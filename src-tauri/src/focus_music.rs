// 轻听：管理 MRT2 Python 桥接子进程。
// 通过 stdin/stdout JSON-line 协议通信，状态通过 Tauri 事件推送到前端。

use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{atomic::AtomicBool, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter};

/// 全局桥接进程句柄（stdin writer）。
struct Bridge {
    stdin: ChildStdin,
}

static BRIDGE: Mutex<Option<Bridge>> = Mutex::new(None);
/// 子进程句柄，由 monitor 线程持有（避免与 send_cmd 死锁）
static BRIDGE_CHILD: Mutex<Option<Child>> = Mutex::new(None);
/// 当前播放状态，避免 spawn 阻塞主线程时前端反复查询
static PLAYING: AtomicBool = AtomicBool::new(false);
/// 桥接进程是否应处于运行状态（用于区分正常关闭与异常退出）
static BRIDGE_ACTIVE: AtomicBool = AtomicBool::new(false);

/// HuggingFace 镜像站（境内可达，加速下载）。主站为 https://huggingface.co。
const HF_MIRROR_ENDPOINT: &str = "https://hf-mirror.com";
/// 默认下载的 MRT2 模型名。用 mrt2_small（0.46GB）：实测 ~0.75s 生成 1s 音频，
/// 1.33× 实时，能跟上播放。mrt2_base 实测 2s/1s = 0.5× 实时，会持续 underrun 卡顿。
const MRT2_MODEL_NAME: &str = "mrt2_small";

/// 探测镜像站可达性，选择 HuggingFace 下载 endpoint。
/// 缓存结果避免每次安装都探测。参照翻译面板 download_model 的 HEAD probe 模式。
fn pick_hf_endpoint() -> &'static str {
    static CHOICE: OnceLock<&'static str> = OnceLock::new();
    *CHOICE.get_or_init(|| {
        let client = reqwest::blocking::Client::new();
        match client
            .head(HF_MIRROR_ENDPOINT)
            .timeout(Duration::from_secs(5))
            .send()
        {
            Ok(r) if r.status().is_success() || r.status().is_redirection() => {
                HF_MIRROR_ENDPOINT
            }
            _ => "https://huggingface.co",
        }
    })
}

/// 从 tqdm 进度行里解析百分比（形如 `model.safetensors:  43%|...`）。
fn parse_percent(s: &str) -> Option<u32> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i > 0 {
            let mut j = i;
            while j > 0 && bytes[j - 1].is_ascii_digit() {
                j -= 1;
            }
            if j < i {
                if let Ok(num) = std::str::from_utf8(&bytes[j..i]) {
                    if let Ok(n) = num.parse::<u32>() {
                        return Some(n.min(100));
                    }
                }
            }
        }
        i += 1;
    }
    None
}

/// 去除 click/tqdm 的 ANSI 转义序列，给前端展示干净的文案。
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_esc = false;
    for c in s.chars() {
        if in_esc {
            // CSI 序列以字母结束
            if c.is_ascii_alphabetic() {
                in_esc = false;
            }
            continue;
        }
        if c == '\x1b' {
            in_esc = true;
            continue;
        }
        out.push(c);
    }
    out
}

/// 流式执行一条命令：stdout 按行转发为 loading 状态文案，stderr 解析 tqdm 百分比
/// 转发为 progress 事件，并把 stderr 累积起来供失败时返回。
/// 对照翻译面板：它用 HTTP read loop 直接 emit downloaded/total；这里下载委托给
/// `mrt` CLI（huggingface_hub），所以改为转发其输出，能拿到字节级进度就拿。
fn run_streaming(
    app: &AppHandle,
    program: &str,
    args: &[&str],
    env_extra: Vec<(&str, &str)>,
    stage_label: &str,
) -> Result<(), String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    for (k, v) in &env_extra {
        cmd.env(k, v);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动 {} 失败: {}", program, e))?;
    let stdout = child.stdout.take().ok_or("无法获取子进程 stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取子进程 stderr")?;

    // stdout 线程：按行转发为 loading 文案
    let app_out = app.clone();
    let label_out = stage_label.to_string();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let clean = strip_ansi(line.trim());
            if clean.is_empty() {
                continue;
            }
            let _ = app_out.emit(
                "focus-music-status",
                serde_json::json!({
                    "type": "status",
                    "stage": "loading",
                    "message": format!("{} · {}", label_out, clean),
                }),
            );
        }
    });

    // stderr 线程：按字节读取（tqdm 用 \r 原地刷新，按行读会阻塞），
    // 切分片段解析百分比；同时累积全文供错误返回。
    let app_err = app.clone();
    let stderr_buf: std::sync::Arc<Mutex<String>> = std::sync::Arc::new(Mutex::new(String::new()));
    let stderr_buf_t = stderr_buf.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut seg: Vec<u8> = Vec::new();
        let mut b = [0u8; 1];
        loop {
            match reader.read(&mut b) {
                Ok(0) => break,
                Ok(_) => {
                    if b[0] == b'\r' || b[0] == b'\n' {
                        if !seg.is_empty() {
                            let s = String::from_utf8_lossy(&seg);
                            let s = s.trim();
                            if !s.is_empty() {
                                if let Some(pct) = parse_percent(s) {
                                    let _ = app_err.emit(
                                        "focus-music-status",
                                        serde_json::json!({
                                            "type": "progress",
                                            "stage": "loading",
                                            "percent": pct,
                                            "message": strip_ansi(s),
                                        }),
                                    );
                                }
                                if let Ok(mut buf) = stderr_buf_t.lock() {
                                    buf.push_str(s);
                                    buf.push('\n');
                                }
                            }
                        }
                        seg.clear();
                    } else {
                        seg.push(b[0]);
                    }
                }
                Err(_) => break,
            }
        }
        if !seg.is_empty() {
            let s = String::from_utf8_lossy(&seg);
            let s = s.trim();
            if !s.is_empty() {
                if let Ok(mut buf) = stderr_buf_t.lock() {
                    buf.push_str(s);
                    buf.push('\n');
                }
            }
        }
    });

    let status = child
        .wait()
        .map_err(|e| format!("等待 {} 退出失败: {}", program, e))?;
    if !status.success() {
        let stderr_txt = stderr_buf
            .lock()
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        // 截断过长的错误输出
        let stderr_short = if stderr_txt.len() > 800 {
            format!("{}…", &stderr_txt[..800])
        } else {
            stderr_txt
        };
        return Err(format!("{} 失败: {}", stage_label, stderr_short));
    }
    Ok(())
}

/// 运行 `mrt models …` 命令，先用探测到的 endpoint，失败则回退另一个 endpoint 重试。
fn run_mrt_models(
    app: &AppHandle,
    mrt: &str,
    args: &[&str],
    stage_label: &str,
) -> Result<(), String> {
    let primary = pick_hf_endpoint();
    let _ = app.emit(
        "focus-music-status",
        serde_json::json!({
            "type": "status", "stage": "loading",
            "message": format!("{}（使用 {}）", stage_label, primary),
        }),
    );
    match run_streaming(app, mrt, args, vec![("HF_ENDPOINT", primary)], stage_label) {
        Ok(()) => Ok(()),
        Err(e) => {
            // 回退到另一个 endpoint 再试一次（huggingface_hub 会续传已下载的 .incomplete 片段）
            let fallback = if primary == HF_MIRROR_ENDPOINT {
                "https://huggingface.co"
            } else {
                HF_MIRROR_ENDPOINT
            };
            let _ = app.emit(
                "focus-music-status",
                serde_json::json!({
                    "type": "status", "stage": "loading",
                    "message": format!("{} 首次失败，切换到 {} 重试…", stage_label, fallback),
                }),
            );
            run_streaming(app, mrt, args, vec![("HF_ENDPOINT", fallback)], stage_label)
                .map_err(|e2| format!("{}（首次: {}; 已回退重试）: {}", stage_label, e, e2))
        }
    }
}

/// 找到 mrt2_bridge.py 的路径。
fn bridge_script_path() -> Result<PathBuf, String> {
    // 开发环境：相对 Cargo.toml 的 python/ 目录
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_path = manifest_dir.join("python/mrt2_bridge.py");
    if dev_path.exists() {
        return Ok(dev_path);
    }
    // 生产环境：bundle resources
    // Tauri v2 将 resources 目录放到 bundle 的 Resources/ 下
    #[cfg(target_os = "macos")]
    {
        if let Ok(exe) = std::env::current_exe() {
            // .app/Contents/MacOS/rixing → .app/Contents/Resources/python/mrt2_bridge.py
            let res_path = exe
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join("Resources/python/mrt2_bridge.py");
            if res_path.exists() {
                return Ok(res_path);
            }
        }
    }
    Err("找不到 mrt2_bridge.py（开发路径和 bundle 路径均不存在）".to_string())
}

/// 向桥接进程发送一条 JSON 命令。
fn send_cmd(cmd: Value) -> Result<(), String> {
    let mut guard = BRIDGE.lock().map_err(|e| e.to_string())?;
    let bridge = guard.as_mut().ok_or("桥接进程未启动")?;
    let line = serde_json::to_string(&cmd).map_err(|e| e.to_string())?;
    writeln!(bridge.stdin, "{}", line).map_err(|e| format!("写入 stdin 失败: {}", e))?;
    bridge.stdin.flush().map_err(|e| format!("flush 失败: {}", e))?;
    Ok(())
}

/// 查找 uv 可执行文件路径
fn uv_path() -> Result<String, String> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    let candidates = [
        home.join(".local/bin/uv"),
        home.join(".cargo/bin/uv"),
        home.join(".langflow/uv/uv"),
    ];
    for c in &candidates {
        if c.is_file() {
            return Ok(c.to_string_lossy().to_string());
        }
    }
    // fallback: check PATH
    if let Ok(output) = Command::new("uv").arg("--version").output() {
        if output.status.success() {
            return Ok("uv".to_string());
        }
    }
    Err("未找到 uv 包管理器，无法自动安装依赖".to_string())
}

fn venv_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("python/.venv")
}

/// 目录非空（含至少一个文件/子目录）。
fn dir_nonempty(p: &PathBuf) -> bool {
    p.is_dir() && p.read_dir().map(|mut d| d.next().is_some()).unwrap_or(false)
}

/// 确保 Python 虚拟环境已创建并安装好所有依赖（含模型权重）。
/// 全程流式上报进度到前端；首次安装约 1–2 分钟，后续检测到就绪则直接返回。
/// 对照翻译面板：translate 的 download_model 自己跑 HTTP read loop 报字节进度；
/// 这里下载委托给 `mrt` CLI（huggingface_hub），由 run_streaming 转发其输出与 tqdm 进度。
fn ensure_python_env(app: &AppHandle) -> Result<(), String> {
    let venv = venv_dir();
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    let models_root = home.join("Documents/Magenta/magenta-rt-v2");
    let venv_ready = venv.join("bin/python3.12").is_file()
        && venv.join("bin/mrt").is_file();
    // resources（musiccoca + spectrostream）由 `mrt models init` 下载
    let resources_ready = dir_nonempty(&models_root.join("resources/musiccoca"))
        && dir_nonempty(&models_root.join("resources/spectrostream"));
    // 模型权重（mrt2_base）由 `mrt models download` 下载
    let model_ready = dir_nonempty(&models_root.join("models").join(MRT2_MODEL_NAME));
    if venv_ready && resources_ready && model_ready {
        return Ok(()); // 一切就绪，跳过
    }

    let uv = uv_path()?;

    // 1 + 2. 创建 venv 并安装依赖（仅在 venv 未就绪时）
    if !venv_ready {
        let _ = app.emit("focus-music-status", serde_json::json!({
            "type": "status", "stage": "loading",
            "step": "venv",
            "message": "正在创建 Python 环境…"
        }));
        run_streaming(
            app,
            &uv,
            &["venv", venv.to_str().unwrap(), "--python", "3.12"],
            vec![],
            "创建 Python 环境",
        )?;

        let _ = app.emit("focus-music-status", serde_json::json!({
            "type": "status", "stage": "loading",
            "step": "install",
            "message": "正在安装依赖（首次约需 30 秒）…"
        }));
        let python = venv.join("bin/python3.12");
        run_streaming(
            app,
            &uv,
            &[
                "pip", "install",
                "--python", python.to_str().unwrap(),
                "magenta-rt[mlx]", "sounddevice", "numpy",
            ],
            vec![],
            "安装依赖",
        )?;
    }

    let mrt = venv.join("bin/mrt");

    // 3. 下载共享资源（musiccoca / spectrostream）
    if !resources_ready {
        let _ = app.emit("focus-music-status", serde_json::json!({
            "type": "status", "stage": "loading",
            "step": "resources",
            "message": "正在下载共享资源（musiccoca、spectrostream）…"
        }));
        run_mrt_models(app, mrt.to_str().unwrap(), &["models", "init"], "下载共享资源")?;
    }

    // 4. 下载 MRT2 模型权重（显式指定 mrt2_base，否则 CLI 会进入交互式选择器卡死）
    if !model_ready {
        let _ = app.emit("focus-music-status", serde_json::json!({
            "type": "status", "stage": "loading",
            "step": "model",
            "message": "正在下载 MRT2 模型权重（约数百 MB）…"
        }));
        run_mrt_models(
            app,
            mrt.to_str().unwrap(),
            &["models", "download", MRT2_MODEL_NAME],
            "下载 MRT2 模型",
        )?;
    }

    Ok(())
}

/// 启动桥接进程并开始读取其 stdout。
fn spawn_bridge(app: &AppHandle) -> Result<(), String> {
    // 检查是否已运行
    {
        let guard = BRIDGE.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }

    // 确保 Python 环境和依赖就绪
    ensure_python_env(app)?;

    let script = bridge_script_path()?;
    let python = find_python()?;

    let mut child = Command::new(&python)
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 Python 进程 ({}): {}", python, e))?;

    let stdin = child.stdin.take().ok_or("无法获取子进程 stdin")?;
    let stdout = child.stdout.take().ok_or("无法获取子进程 stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取子进程 stderr")?;

    // 后台线程：读取 stdout JSON 行，转换为 Tauri 事件
    let app_out = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if text.trim().is_empty() {
                        continue;
                    }
                    if let Ok(mut val) = serde_json::from_str::<Value>(&text) {
                        if let Some(stage) = val.get("stage").and_then(|s| s.as_str()) {
                            PLAYING.store(stage == "playing", std::sync::atomic::Ordering::SeqCst);
                        }
                        // 标准化：Python 发 {"type":"error"} 但前端期望 {"stage":"error"}
                        if val.get("type").and_then(|t| t.as_str()) == Some("error")
                            && val.get("stage").is_none()
                        {
                            val.as_object_mut().unwrap().insert(
                                "stage".into(),
                                serde_json::Value::String("error".into()),
                            );
                        }
                        let _ = app_out.emit("focus-music-status", &val);
                    }
                }
                Err(_) => break,
            }
        }
    });

    // 后台线程：读取 stderr，打印到日志（调试用）
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(text) = line {
                eprintln!("[mrt2-bridge] {}", text);
            }
        }
    });

    let mut guard = BRIDGE.lock().map_err(|e| e.to_string())?;
    *guard = Some(Bridge { stdin });
    // 子进程句柄存入独立 Mutex，供 monitor 线程 wait 而不阻塞 send_cmd
    *BRIDGE_CHILD.lock().map_err(|e| e.to_string())? = Some(child);
    BRIDGE_ACTIVE.store(true, std::sync::atomic::Ordering::SeqCst);
    drop(guard);

    // 监控线程：等待子进程退出，若仍应运行则通知前端出错
    let app_err = app.clone();
    thread::spawn(move || {
        let child_opt = BRIDGE_CHILD.lock().ok().and_then(|mut g| g.take());
        if let Some(mut c) = child_opt {
            let status = c.wait();
            if BRIDGE_ACTIVE.load(std::sync::atomic::Ordering::SeqCst) {
                let code = status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
                let _ = app_err.emit("focus-music-status", serde_json::json!({
                    "type": "status",
                    "stage": "error",
                    "message": format!("Python 进程异常退出 (code={})", code),
                }));
                BRIDGE_ACTIVE.store(false, std::sync::atomic::Ordering::SeqCst);
            }
        }
    });

    Ok(())
}

fn find_python() -> Result<String, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // 优先用项目 venv（uv 创建），其次系统 python3.12 / python3
    let venv_python = manifest_dir.join("python/.venv/bin/python3.12");
    let candidates: Vec<String> = vec![
        venv_python.to_string_lossy().to_string(),
        "python3.12".to_string(),
        "python3".to_string(),
    ];
    for candidate in &candidates {
        if let Ok(output) = std::process::Command::new(candidate)
            .arg("--version")
            .output()
        {
            if output.status.success() {
                return Ok(candidate.to_string());
            }
        }
    }
    Err("找不到 Python（需要 python3.12 或 python3）".to_string())
}

/// 初始化桥接进程并加载模型。
#[tauri::command]
pub fn focus_init(app: AppHandle) -> Result<Value, String> {
    spawn_bridge(&app)?;
    send_cmd(serde_json::json!({"cmd": "init"}))?;
    Ok(serde_json::json!({"ok": true}))
}

/// 开始生成音乐。
#[tauri::command]
pub fn focus_start(app: AppHandle, prompt: String, drums: Option<bool>) -> Result<Value, String> {
    let _ = spawn_bridge(&app);
    send_cmd(serde_json::json!({"cmd": "start", "prompt": prompt, "drums": drums.unwrap_or(true)}))?;
    PLAYING.store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(serde_json::json!({"ok": true}))
}

/// 停止播放。
#[tauri::command]
pub fn focus_stop() -> Result<Value, String> {
    send_cmd(serde_json::json!({"cmd": "stop"}))?;
    PLAYING.store(false, std::sync::atomic::Ordering::SeqCst);
    Ok(serde_json::json!({"ok": true}))
}

/// 切换提示词（播放中也可切换，音乐平滑过渡）。
#[tauri::command]
pub fn focus_set_prompt(text: String) -> Result<Value, String> {
    send_cmd(serde_json::json!({"cmd": "prompt", "text": text}))?;
    Ok(serde_json::json!({"ok": true}))
}

/// 开关鼓点/节奏。
#[tauri::command]
pub fn focus_set_drums(on: bool) -> Result<Value, String> {
    send_cmd(serde_json::json!({"cmd": "drums", "on": on}))?;
    Ok(serde_json::json!({"ok": true}))
}

/// 设置音量 (0.0 ~ 1.0)。
#[tauri::command]
pub fn focus_set_volume(level: f64) -> Result<Value, String> {
    send_cmd(serde_json::json!({"cmd": "volume", "level": level.clamp(0.0, 1.0)}))?;
    Ok(serde_json::json!({"ok": true}))
}

/// 查询当前播放状态。
#[tauri::command]
pub fn focus_get_status() -> Value {
    serde_json::json!({
        "playing": PLAYING.load(std::sync::atomic::Ordering::SeqCst),
    })
}

/// 查询环境就绪状态（不启动子进程）：venv / 资源 / 模型是否齐备。
/// 前端打开时调用，决定是直接显示主 UI 还是显示"检查并启动"横幅。
#[tauri::command]
pub fn focus_setup_status() -> Value {
    let venv = venv_dir();
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    let models_root = home.join("Documents/Magenta/magenta-rt-v2");
    let venv_ready = venv.join("bin/python3.12").is_file()
        && venv.join("bin/mrt").is_file();
    let resources_ready = dir_nonempty(&models_root.join("resources/musiccoca"))
        && dir_nonempty(&models_root.join("resources/spectrostream"));
    let model_ready = dir_nonempty(&models_root.join("models").join(MRT2_MODEL_NAME));
    serde_json::json!({
        "venv_ready": venv_ready,
        "resources_ready": resources_ready,
        "model_ready": model_ready,
        "ready": venv_ready && resources_ready && model_ready,
        // 桥接是否已运行（再查一次 PLAYING 不够，需要 BRIDGE 是否在跑）
        "bridge_running": BRIDGE_ACTIVE.load(std::sync::atomic::Ordering::SeqCst),
    })
}

/// 关闭桥接进程（应用退出时调用）。
pub fn shutdown_bridge() {
    BRIDGE_ACTIVE.store(false, std::sync::atomic::Ordering::SeqCst);
    let _ = send_cmd(serde_json::json!({"cmd": "quit"}));
    if let Ok(mut guard) = BRIDGE.lock() {
        if let Some(mut bridge) = guard.take() {
            let _ = bridge.stdin.flush();
            drop(bridge.stdin);
            // monitor 线程持有 child 并会 wait，这里只清理 stdin
        }
    }
}
