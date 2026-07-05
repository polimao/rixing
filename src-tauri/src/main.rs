// 待办 — Tauri 版本
// 隐藏 Dock、菜单栏托盘、全局快捷键、失焦自动隐藏、番茄钟胶囊形态、
// 平滑窗口高度动画，数据持久化到 iCloud Drive（含 legacy 路径迁移）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tiling;
mod focus_music;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, Ordering};
use std::sync::{Arc, mpsc, Mutex, OnceLock};

use serde_json::Value;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

// ===========================================================================
// 应用共享状态
// ===========================================================================
struct AppState {
    /// 是否处于番茄钟（专注）模式——决定失焦时是否隐藏窗口
    is_pomodoro: Arc<AtomicBool>,
    /// 窗口高度动画的"代号"，每次新的 resize 自增以取消上一段动画
    resize_gen: Arc<AtomicU32>,
}

/// 最近一次的未完成数量。托盘重建（如切换语言）时用它恢复标题，避免数字短暂消失。
static LAST_PENDING: AtomicI64 = AtomicI64::new(0);

// ===========================================================================
// 数据持久化：iCloud Drive 路径 + legacy 迁移（从 renderer.js 搬到后端）
// ===========================================================================
/// 数据根目录：优先 iCloud Drive（多设备同步），iCloud 不可用则退回本地 App Support，
/// 避免没开 iCloud 时把数据写进一个不会同步、可能被系统清理的位置而丢失。
/// 启动时解析一次并缓存，避免运行中 iCloud 状态变化导致路径漂移。
fn base_dir() -> PathBuf {
    static BASE: OnceLock<PathBuf> = OnceLock::new();
    BASE.get_or_init(|| {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
        let icloud = home.join("Library/Mobile Documents/com~apple~CloudDocs");
        if icloud.is_dir() {
            icloud.join("Rixing") // iCloud Drive 已开启
        } else {
            home.join("Library/Application Support/com.limao.rixing") // 本地兜底
        }
    })
    .clone()
}
fn data_path() -> Option<PathBuf> {
    Some(base_dir().join(".todos_data.json"))
}
fn settings_path() -> Option<PathBuf> {
    Some(base_dir().join(".todos_settings.json"))
}
fn legacy_data_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".todos_data.json"))
}
fn legacy_settings_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".todos_settings.json"))
}

fn read_json(path: &PathBuf) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_json(path: &PathBuf, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

/// 判断是否为 4 条示例数据（避免示例数据覆盖真实数据的迁移判定）
fn is_seed_todos(data: &Value) -> bool {
    let arr = match data.as_array() {
        Some(a) => a,
        None => return false,
    };
    if arr.len() != 4 {
        return false;
    }
    const SEEDS: [&str; 4] = ["学习 Electron 和 Chart.js", "写周报", "买水果", "跑步5公里"];
    arr.iter().enumerate().all(|(i, item)| {
        item.get("text").and_then(|t| t.as_str()) == Some(SEEDS[i])
    })
}

/// 首次启动时把旧 home 目录（~/.todos_*.json）里的数据迁移到当前根目录，迁移后删除旧文件。
fn migrate_legacy_if_needed() {
    // 数据
    if let (Some(dp), Some(lp)) = (data_path(), legacy_data_path()) {
        let dest = read_json(&dp);
        let legacy = read_json(&lp);

        let legacy_ok = legacy
            .as_ref()
            .and_then(|v| v.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        let dest_empty_or_seed = match &dest {
            None => true,
            Some(v) => v.as_array().map(|a| a.is_empty()).unwrap_or(true) || is_seed_todos(v),
        };

        if legacy_ok && dest_empty_or_seed {
            if let Some(l) = legacy {
                let _ = write_json(&dp, &l);
            }
        }
        // 目标已落数据后，清理旧版 home 目录文件（仅在确认目标存在时删，避免误删唯一副本）
        if lp.exists() && dp.exists() {
            let _ = std::fs::remove_file(&lp);
        }
    }

    // 设置
    if let (Some(sp), Some(lsp)) = (settings_path(), legacy_settings_path()) {
        let dest = read_json(&sp);
        let legacy = read_json(&lsp);

        let legacy_is_obj = legacy.as_ref().map(|v| v.is_object()).unwrap_or(false);
        let dest_not_obj = !dest.as_ref().map(|v| v.is_object()).unwrap_or(false);

        if legacy_is_obj && dest_not_obj {
            if let Some(l) = legacy {
                let _ = write_json(&sp, &l);
            }
        }
        if lsp.exists() && sp.exists() {
            let _ = std::fs::remove_file(&lsp);
        }
    }
}

// ===========================================================================
// 命令：数据读写
// ===========================================================================
#[tauri::command]
fn load_todos() -> Value {
    data_path()
        .and_then(|p| read_json(&p))
        .filter(|v| v.is_array())
        .unwrap_or_else(|| Value::Array(vec![]))
}

#[tauri::command]
fn save_todos(todos: Value) -> Result<(), String> {
    let p = data_path().ok_or_else(|| "无法定位用户主目录".to_string())?;
    write_json(&p, &todos)
}

#[tauri::command]
fn load_settings() -> Value {
    settings_path()
        .and_then(|p| read_json(&p))
        .filter(|v| v.is_object())
        .unwrap_or_else(|| serde_json::json!({ "sortRule": "default" }))
}

#[tauri::command]
fn save_settings(settings: Value) -> Result<(), String> {
    let p = settings_path().ok_or_else(|| "无法定位用户主目录".to_string())?;
    write_json(&p, &settings)
}

/// 是否显示待办统计数字（托盘 + 面板标题），缺省关闭。
fn load_show_count() -> bool {
    settings_path()
        .and_then(|p| read_json(&p))
        .and_then(|v| v.get("showCount").and_then(|x| x.as_bool()))
        .unwrap_or(false)
}

/// 读取用户选择的界面语言（前端只把具体语言码写入 settings.lang，缺省简体中文）。
fn load_lang() -> String {
    settings_path()
        .and_then(|p| read_json(&p))
        .and_then(|v| v.get("lang").and_then(|x| x.as_str()).map(String::from))
        .unwrap_or_else(|| "zh-CN".to_string())
}

/// 托盘三处文案：(待办标题, "设置"菜单项, "退出"菜单项)。
/// 托盘右键菜单文案：分别跳转到设置面板对应标签页（倒计时 / 窗口分屏 / 通用设置 / 关于）+ 退出。
struct TrayLabels {
    focus: &'static str,
    ann: &'static str,
    tidy: &'static str,
    general: &'static str,
    about: &'static str,
    quit: &'static str,
}

fn tray_strings(lang: &str) -> TrayLabels {
    match lang {
        "en" => TrayLabels { focus: "QingTing", ann: "Anniversaries", tidy: "Split screen", general: "General settings", about: "About", quit: "Quit" },
        "ja" => TrayLabels { focus: "QingTing", ann: "重要日倒计时", tidy: "画面分割", general: "一般設定", about: "このアプリについて", quit: "終了" },
        "ko" => TrayLabels { focus: "QingTing", ann: "기념일", tidy: "화면 분할", general: "일반 설정", about: "정보", quit: "종료" },
        "es" => TrayLabels { focus: "QingTing", ann: "Aniversarios", tidy: "Dividir pantalla", general: "Ajustes generales", about: "Acerca de", quit: "Salir" },
        "fr" => TrayLabels { focus: "QingTing", ann: "Anniversaires", tidy: "Partage d'écran", general: "Réglages généraux", about: "À propos", quit: "Quitter" },
        "de" => TrayLabels { focus: "QingTing", ann: "Jahrestage", tidy: "Bildschirm teilen", general: "Allgemeine Einstellungen", about: "Über", quit: "Beenden" },
        "ru" => TrayLabels { focus: "QingTing", ann: "Годовщины", tidy: "Разделение экрана", general: "Общие настройки", about: "О программе", quit: "Выход" },
        _ => TrayLabels { focus: "轻听", ann: "倒计时", tidy: "窗口分屏", general: "通用设置", about: "关于", quit: "退出" }, // zh-CN 及默认
    }
}

// ===========================================================================
// 命令：设置面板（开机自启动 + 语言切换后重建托盘）
// ===========================================================================
#[tauri::command]
fn get_settings_state(app: AppHandle) -> Value {
    let autostart = app.autolaunch().is_enabled().unwrap_or(false);
    serde_json::json!({ "autostart": autostart })
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let mgr = app.autolaunch();
    if enabled {
        mgr.enable().map_err(|e| e.to_string())
    } else {
        mgr.disable().map_err(|e| e.to_string())
    }
}

/// 语言切换后，按新语言重建两个托盘（菜单文案 / 待办标题 / 日期格式）。
/// muda 菜单只能在主线程创建，命令运行在工作线程，故 marshal 到主线程执行。
#[tauri::command]
fn relocalize_tray(app: AppHandle) {
    let app_for_main = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = app_for_main.remove_tray_by_id("main");
        let _ = app_for_main.remove_tray_by_id("calendar");
        let _ = create_main_tray(&app_for_main);
        let _ = create_calendar_tray(&app_for_main);
    });
}

/// 切换「显示待办统计」后重建主托盘以套用最新设置。
/// macOS 上对已有标题调用 `set_title(Some(""))`/`None` 不一定能把数字清掉，
/// 重建托盘（以正确标题新建）是可靠的清除方式。muda/托盘只能在主线程操作。
#[tauri::command]
fn refresh_tray_count(app: AppHandle) {
    let app_for_main = app.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = app_for_main.remove_tray_by_id("main");
        let _ = create_main_tray(&app_for_main);
    });
}

// ===========================================================================
// 码放（窗口整理）：开关 + 边距 + 可自定义的全局快捷键
// ===========================================================================
const TILE_DEFAULTS: [(&str, &str); 4] = [
    ("left", "super+control+ArrowLeft"),
    ("right", "super+control+ArrowRight"),
    ("max", "super+control+ArrowUp"),
    ("restore", "super+control+ArrowDown"),
];

/// 当前已注册的码放快捷键（用于重设时先注销）。
fn registered_tiling() -> &'static Mutex<Vec<Shortcut>> {
    static S: OnceLock<Mutex<Vec<Shortcut>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(Vec::new()))
}

// ---------------------------------------------------------------------------
// 待办窗口全局快捷键（可自定义，类似码放快捷键的模式）
// ---------------------------------------------------------------------------
const TODO_DEFAULT_SHORTCUT: &str = "super+shift+KeyU";

fn registered_todo_shortcut() -> &'static Mutex<Option<Shortcut>> {
    static S: OnceLock<Mutex<Option<Shortcut>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn todo_shortcut() -> String {
    settings_path()
        .and_then(|p| read_json(&p))
        .and_then(|v| v.get("todoShortcut").and_then(|x| x.as_str()).map(String::from))
        .unwrap_or_else(|| TODO_DEFAULT_SHORTCUT.to_string())
}

fn apply_todo_shortcut(app: &AppHandle) {
    let gs = app.global_shortcut();
    let mut reg = match registered_todo_shortcut().lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    // 先注销旧快捷键
    if let Some(old) = reg.take() {
        let _ = gs.unregister(old);
    }
    let sc: Shortcut = match todo_shortcut().parse() {
        Ok(s) => s,
        Err(_) => return,
    };
    let win = app.get_webview_window("main");
    let ok = gs
        .on_shortcut(sc, move |_app, _scut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(ref w) = win {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .is_ok();
    if ok {
        *reg = Some(sc);
    }
}

/// 读取当前待办窗口快捷键（返回给设置面板展示）。
#[tauri::command]
fn get_todo_shortcut() -> Value {
    serde_json::json!({ "shortcut": todo_shortcut() })
}

/// 保存后由前端调用，按最新设置重注册待办快捷键。
#[tauri::command]
fn apply_todo_shortcut_settings(app: AppHandle) {
    apply_todo_shortcut(&app);
}

/// 录制期间临时注销待办快捷键，避免被系统吞掉。
#[tauri::command]
fn suspend_todo_shortcut(app: AppHandle) {
    let gs = app.global_shortcut();
    if let Ok(mut reg) = registered_todo_shortcut().lock() {
        if let Some(old) = reg.take() {
            let _ = gs.unregister(old);
        }
    }
}

// ===========================================================================
// 翻译快捷键（固定 Cmd+Shift+Y，不走设置，不可自定义）
// 打开设置面板的翻译标签页，而非独立窗口。
// ===========================================================================
fn apply_translate_shortcut(app: &AppHandle) {
    let gs = app.global_shortcut();
    let sc: Shortcut = "super+shift+KeyY"
        .parse()
        .expect("translate shortcut 'super+shift+KeyY' should be valid");
    let app_clone = app.clone();
    let _ = gs.on_shortcut(sc, move |_app, _scut, event| {
        if event.state() == ShortcutState::Pressed {
            show_settings_tab(&app_clone, "translate");
        }
    });
}

// ===========================================================================
// 翻译模型管理：下载、加载、推理、卸载
// ===========================================================================

/// 模型文件名
const MODEL_FILENAME: &str = "HY-MT1.5-1.8B-Q4_K_M.gguf";
/// Hugging Face 下载 URL（主站，境外可用）
const MODEL_URL: &str =
    "https://huggingface.co/tencent/HY-MT1.5-1.8B-GGUF/resolve/main/HY-MT1.5-1.8B-Q4_K_M.gguf";
/// Hugging Face 镜像站（境内可用）
const MODEL_URL_MIRROR: &str =
    "https://hf-mirror.com/tencent/HY-MT1.5-1.8B-GGUF/resolve/main/HY-MT1.5-1.8B-Q4_K_M.gguf";

fn model_path() -> PathBuf {
    base_dir().join(MODEL_FILENAME)
}


/// 翻译任务。前端发来翻译请求后通过 channel 交给 worker 线程。
enum TranslateJob {
    Translate {
        id: String,
        text: String,
        tgt_lang: String,
    },
    Shutdown,
}

/// worker 线程的发送端，启动后置入 OnceLock。
static TRANSLATE_TX: OnceLock<Mutex<Option<mpsc::Sender<TranslateJob>>>> = OnceLock::new();

/// 检查模型文件是否已下载（做基本的文件大小校验）。
#[tauri::command]
fn check_model_status() -> Value {
    let path = model_path();
    let downloaded = path.is_file();
    let size = if downloaded {
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    serde_json::json!({
        "downloaded": downloaded && size > 100_000_000, // 至少 100 MB 才算有效
        "path": path.to_string_lossy(),
        "size": size,
    })
}

/// 下载模型文件（带进度上报）。
#[tauri::command]
fn download_model(app: AppHandle) -> Result<Value, String> {
    let path = model_path();
    if path.is_file() {
        if let Ok(meta) = std::fs::metadata(&path) {
            if meta.len() > 100_000_000 {
                return Ok(serde_json::json!({ "success": true, "message": "Already downloaded" }));
            }
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Phase 1: HEAD probe each URL (short timeout) to find a reachable one
    let client = reqwest::blocking::Client::new();
    let download_url = {
        let mut chosen = None;
        for url in &[MODEL_URL, MODEL_URL_MIRROR] {
            match client
                .head(*url)
                .timeout(std::time::Duration::from_secs(10))
                .send()
            {
                Ok(resp) if resp.status().is_success() || resp.status().is_redirection() => {
                    chosen = Some(*url);
                    break;
                }
                _ => {}
            }
        }
        chosen.ok_or("All download URLs unreachable")?
    };

    // Phase 2: actual GET download with long timeout (1.1 GB may take a while)
    let tmp_path = path.with_extension("gguf.tmp");
    let mut resp = client
        .get(download_url)
        .timeout(std::time::Duration::from_secs(3600))
        .send()
        .map_err(|e| format!("Download request failed: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("Server returned {}", status));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut dest = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
    use std::io::{Read, Write};
    let mut buf = [0u8; 8192];
    loop {
        let n = resp.read(&mut buf).map_err(|e| format!("Read error: {}", e))?;
        if n == 0 {
            break;
        }
        dest.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;
        let _ = app.emit("translate-model-download-progress", serde_json::json!({
            "downloaded": downloaded,
            "total": total,
        }));
    }
    dest.flush().map_err(|e| e.to_string())?;
    drop(dest);
    std::fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

/// 启动翻译 worker 线程，加载模型。
/// 注意：llama-cpp-2 的类型不是 Send 的，所以 worker 线程在加载完成后通过
/// 另一个 channel 发回确认，后续翻译任务在该线程内串行执行。
#[tauri::command]
fn load_translate_model(app: AppHandle) -> Result<Value, String> {
    let tx_ref = TRANSLATE_TX.get_or_init(|| Mutex::new(None));
    {
        let guard = tx_ref.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(serde_json::json!({ "loaded": true, "message": "Already loaded" }));
        }
    }
    let mp = model_path();
    if !mp.is_file() {
        return Err("Model file not found. Please download it first.".to_string());
    }

    let (tx, rx) = mpsc::channel::<TranslateJob>();

    std::thread::spawn(move || {
        let _ = app.emit("translate-model-status", serde_json::json!({ "stage": "loading", "detail": "init_backend" }));

        let backend = match llama_cpp_2::llama_backend::LlamaBackend::init() {
            Ok(b) => b,
            Err(e) => {
                let _ = app.emit("translate-error", serde_json::json!({ "error": format!("Backend init: {}", e) }));
                return;
            }
        };

        let _ = app.emit("translate-model-status", serde_json::json!({ "stage": "loading", "detail": "loading_model" }));

        let model_params = llama_cpp_2::model::params::LlamaModelParams::default();
        let model = match llama_cpp_2::model::LlamaModel::load_from_file(&backend, &mp, &model_params) {
            Ok(m) => m,
            Err(e) => {
                let _ = app.emit("translate-error", serde_json::json!({ "error": format!("Failed to load model: {}", e) }));
                return;
            }
        };

        let _ = app.emit("translate-model-status", serde_json::json!({ "stage": "loading", "detail": "creating_context" }));

        let n_ctx = std::num::NonZeroU32::new(4096).unwrap();
        let ctx_params = llama_cpp_2::context::params::LlamaContextParams::default()
            .with_n_ctx(Some(n_ctx));
        let mut ctx = match model.new_context(&backend, ctx_params) {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("translate-error", serde_json::json!({ "error": format!("Failed to create context: {}", e) }));
                return;
            }
        };

        let _ = app.emit("translate-model-status", serde_json::json!({ "stage": "loading", "detail": "warming_up" }));

        // Warm up: feed a single token so Metal shaders compile NOW rather than
        // during the first real translation (which can take 30s–2min on Apple Silicon).
        // The warmup prompt is a minimal translation request so the model warms up
        // the same attention pattern (cross-attention) used by real requests.
        {
            let warmup_prompt =
                "<｜hy_begin▁of▁sentence｜><｜hy_User｜>Translate the following segment into English, without additional explanation.\n\nhello<｜hy_Assistant｜>";
            match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let _ = do_translate(&model, &mut ctx, warmup_prompt);
            })) {
                _ => { /* warmup result doesn't matter; shader compilation happened */ }
            }
            // Clear KV cache so warmup doesn't contaminate the first real request
            ctx.clear_kv_cache();
        }

        let _ = app.emit("translate-model-status", serde_json::json!({ "stage": "ready" }));

        for job in rx {
            match job {
                TranslateJob::Translate { id, text, tgt_lang } => {
                    let prompt = format!(
                        "<｜hy_begin▁of▁sentence｜><｜hy_User｜>Translate the following segment into {}, without additional explanation.\n\n{}<｜hy_Assistant｜>",
                        tgt_lang, text
                    );
                    // catch_unwind: sample_token_greedy panics if selected_token is None.
                    // If the model produces garbage, we want to surface the error instead of
                    // silently killing the worker thread.
                    let result = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        do_translate(&model, &mut ctx, &prompt)
                    })) {
                        Ok(r) => r,
                        Err(panic) => {
                            let msg = if let Some(s) = panic.downcast_ref::<String>() {
                                s.clone()
                            } else if let Some(s) = panic.downcast_ref::<&str>() {
                                s.to_string()
                            } else {
                                "unknown panic in do_translate".to_string()
                            };
                            Err(msg)
                        }
                    };
                    match result {
                        Ok(translated) => {
                            let _ = app.emit("translate-result", serde_json::json!({
                                "id": id,
                                "text": translated
                            }));
                        }
                        Err(e) => {
                            let _ = app.emit("translate-error", serde_json::json!({
                                "id": id,
                                "error": e
                            }));
                        }
                    }
                }
                TranslateJob::Shutdown => break,
            }
        }
        // model/ctx/backend 在此处 drop
    });

    let mut guard = tx_ref.lock().map_err(|e| e.to_string())?;
    *guard = Some(tx);
    Ok(serde_json::json!({ "loaded": true }))
}

/// 卸载翻译模型（发送 Shutdown，回收线程和内存）。
#[tauri::command]
fn unload_translate_model() -> Result<Value, String> {
    let tx_ref = TRANSLATE_TX.get_or_init(|| Mutex::new(None));
    let mut guard = tx_ref.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = guard.take() {
        let _ = tx.send(TranslateJob::Shutdown);
        // 不等待线程 join — Drop 后线程自行结束
    }
    Ok(serde_json::json!({ "loaded": false }))
}

/// 查询翻译模型当前状态。
#[tauri::command]
fn get_translate_status() -> Value {
    let mp = model_path();
    let downloaded = mp.is_file() && std::fs::metadata(&mp).map(|m| m.len() > 100_000_000).unwrap_or(false);
    let loaded = match TRANSLATE_TX.get().and_then(|m| m.lock().ok()) {
        Some(guard) => guard.is_some(),
        None => false,
    };
    serde_json::json!({ "downloaded": downloaded, "loaded": loaded })
}

/// 发起翻译（通过 channel 发给 worker 线程，立即返回；结果通过事件推送）。
#[tauri::command]
fn translate_text(app: AppHandle, text: String, tgt_lang: String) -> Result<Value, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let tx_ref = TRANSLATE_TX.get().ok_or("Model not initialized")?;
    let guard = tx_ref.lock().map_err(|e| e.to_string())?;
    let tx = guard.as_ref().ok_or("Model not loaded. Please load the model first.")?;
    let id = format!("{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis());
    tx.send(TranslateJob::Translate { id: id.clone(), text, tgt_lang })
        .map_err(|e| format!("Failed to send translation request: {}", e))?;
    let _ = app.emit("translate-model-status", serde_json::json!({ "stage": "translating" }));
    Ok(serde_json::json!({ "id": id }))
}

/// 核心推理：tokenize → decode → sample → detokenize。
/// 此函数在 worker 线程中调用，借用 model + &mut ctx。
fn do_translate(
    model: &llama_cpp_2::model::LlamaModel,
    ctx: &mut llama_cpp_2::context::LlamaContext,
    prompt: &str,
) -> Result<String, String> {
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::AddBos;
    use llama_cpp_2::sampling::LlamaSampler;
    use llama_cpp_2::token::LlamaToken;

    // Tokenize the prompt (BOS is already in the HY-MT template)
    let tokens = model
        .str_to_token(prompt, AddBos::Never)
        .map_err(|e| format!("Tokenization error: {}", e))?;

    let n_ctx = ctx.n_ctx() as usize;

    // Clear KV cache before feeding
    ctx.clear_kv_cache();

    // Feed prompt tokens in batches
    {
        let mut n_processed = 0usize;
        while n_processed < tokens.len() {
            let chunk_end = (n_processed + n_ctx).min(tokens.len());
            let mut batch = LlamaBatch::new(chunk_end - n_processed, 1);
            for (i, &tok) in tokens[n_processed..chunk_end].iter().enumerate() {
                let is_last = n_processed + i == tokens.len() - 1;
                batch
                    .add(tok, (n_processed + i) as i32, &[0], is_last)
                    .map_err(|e| format!("Batch add error: {}", e))?;
            }
            ctx.decode(&mut batch)
                .map_err(|e| format!("Decode error: {}", e))?;
            n_processed = chunk_end;
        }
    }

    // Build sampler chain: top_k=20, top_p=0.6, greedy for deterministic output
    let sampler_top_k = LlamaSampler::top_k(20);
    let sampler_top_p = LlamaSampler::top_p(0.6, 1);

    let eos_token = model.token_eos();
    let mut output_tokens: Vec<LlamaToken> = Vec::new();
    let mut decoder = encoding_rs::UTF_8.new_decoder();

    for _ in 0..1024 {
        let mut candidates = ctx.token_data_array();
        candidates.apply_sampler(&sampler_top_k);
        candidates.apply_sampler(&sampler_top_p);
        // Use greedy last: selects the token with highest probability after top_k/top_p filtering.
        // If no token has a non-zero probability (shouldn't happen with the HY-MT model), fall back
        // to the raw argmax of the logits array.
        candidates.apply_sampler(&LlamaSampler::greedy());
        let token = match candidates.selected_token() {
            Some(t) => t,
            None => {
                // Rare edge case: all probabilities vanished after filtering.
                // Fall back to raw argmax over the unfiltered logits.
                let raw = ctx.token_data_array();
                let best = raw
                    .data
                    .iter()
                    .max_by(|a, b| a.logit().partial_cmp(&b.logit()).unwrap_or(std::cmp::Ordering::Equal))
                    .map(|d| d.id());
                best.unwrap_or(eos_token)
            }
        };

        if token == eos_token || model.is_eog_token(token) {
            break;
        }

        // Feed the sampled token back for the next step.
        // Position = prompt token count + already-generated token count, so it stays consecutive.
        let pos = (tokens.len() + output_tokens.len()) as i32;
        output_tokens.push(token);
        let mut batch = LlamaBatch::new(1, 1);
        batch
            .add(token, pos, &[0], true)
            .map_err(|e| format!("Batch add error: {}", e))?;
        ctx.decode(&mut batch)
            .map_err(|e| format!("Decode error: {}", e))?;
    }

    if output_tokens.is_empty() {
        return Err("No output tokens generated".to_string());
    }

    // Detokenize
    let mut result = String::new();
    for token in output_tokens {
        let piece = model
            .token_to_piece(token, &mut decoder, false, None)
            .map_err(|e| format!("Detokenization error: {}", e))?;
        result.push_str(&piece);
    }

    Ok(result.trim().to_string())
}

fn tiling_gap() -> f64 {
    settings_path()
        .and_then(|p| read_json(&p))
        .and_then(|v| {
            v.get("tiling")
                .and_then(|t| t.get("gap"))
                .and_then(|x| x.as_f64())
        })
        .unwrap_or(8.0)
}

fn tiling_shortcut(key: &str, default: &str) -> String {
    settings_path()
        .and_then(|p| read_json(&p))
        .and_then(|v| {
            v.get("tiling")
                .and_then(|t| t.get("shortcuts"))
                .and_then(|s| s.get(key))
                .and_then(|x| x.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| default.to_string())
}

fn tiling_enabled() -> bool {
    settings_path()
        .and_then(|p| read_json(&p))
        .and_then(|v| {
            v.get("tiling")
                .and_then(|t| t.get("enabled"))
                .and_then(|x| x.as_bool())
        })
        .unwrap_or(false)
}

fn action_for(key: &str) -> tiling::TileAction {
    match key {
        "right" => tiling::TileAction::Right,
        "max" => tiling::TileAction::Maximize,
        "restore" => tiling::TileAction::Restore,
        _ => tiling::TileAction::Left,
    }
}

/// 按设置（重新）注册码放快捷键：先注销旧的，开关开启时再注册新的。
fn apply_tiling(app: &AppHandle) {
    let gs = app.global_shortcut();
    let mut reg = match registered_tiling().lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    for sc in reg.drain(..) {
        let _ = gs.unregister(sc);
    }
    if !tiling_enabled() {
        return;
    }
    for (key, default) in TILE_DEFAULTS {
        let sc: Shortcut = match tiling_shortcut(key, default).parse() {
            Ok(s) => s,
            Err(_) => continue,
        };
        let act = action_for(key);
        let ok = gs
            .on_shortcut(sc, move |app, _scut, event| {
                if event.state() == ShortcutState::Pressed {
                    let g = tiling_gap();
                    let _ = app.run_on_main_thread(move || tiling::tile(act, g));
                }
            })
            .is_ok();
        if ok {
            reg.push(sc);
        }
    }
}

#[tauri::command]
fn get_tiling_settings() -> Value {
    serde_json::json!({
        "enabled": tiling_enabled(),
        "gap": tiling_gap(),
        "trusted": tiling::accessibility_trusted(false),
        "shortcuts": {
            "left": tiling_shortcut("left", TILE_DEFAULTS[0].1),
            "right": tiling_shortcut("right", TILE_DEFAULTS[1].1),
            "max": tiling_shortcut("max", TILE_DEFAULTS[2].1),
            "restore": tiling_shortcut("restore", TILE_DEFAULTS[3].1),
        }
    })
}

/// 弹出系统"辅助功能"授权引导，返回当前是否已授权。
#[tauri::command]
fn request_accessibility() -> bool {
    tiling::accessibility_trusted(true)
}

/// 设置窗口按内容高度自适应（保持宽度不变，瞬时调整，不做动画/番茄钟判定）。
#[tauri::command]
fn resize_settings(window: WebviewWindow, height: f64) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let cur_w = window
        .inner_size()
        .map(|s| s.width as f64 / scale)
        .unwrap_or(482.0);
    let h = height.max(120.0);
    let _ = window.set_size(LogicalSize::new(cur_w, h));
}

/// 设置变更后由前端调用，按最新设置重注册快捷键。
#[tauri::command]
fn apply_tiling_shortcuts(app: AppHandle) {
    apply_tiling(&app);
}

/// 录制快捷键期间临时注销码放快捷键：避免按到组合键时把设置窗口码放掉，
/// 也避免组合键被全局快捷键"吞掉"导致录制不到。录制结束再调 apply 恢复。
#[tauri::command]
fn suspend_tiling_shortcuts(app: AppHandle) {
    let gs = app.global_shortcut();
    if let Ok(mut reg) = registered_tiling().lock() {
        for sc in reg.drain(..) {
            let _ = gs.unregister(sc);
        }
    }
}

// ===========================================================================
// 命令：托盘标题
// ===========================================================================
#[tauri::command]
fn update_tray_title(app: AppHandle, pending: i64, _completed: i64) {
    LAST_PENDING.store(pending, Ordering::SeqCst);
    if let Some(tray) = app.tray_by_id("main") {
        // 图标恒显；数字仅在"显示待办统计"开启时显示，否则清空只留图标
        if load_show_count() {
            let _ = tray.set_title(Some(pending.to_string()));
        } else {
            let _ = tray.set_title(Some("")); // 用空串清空更可靠；None 在 macOS 上未必清掉旧标题
        }
    }
}

// ===========================================================================
// 命令：平滑调整窗口高度（替代 Electron 的原生动画 setSize）
// ===========================================================================
#[tauri::command]
fn resize_window(window: WebviewWindow, state: State<'_, AppState>, height: f64) {
    // 番茄钟模式下窗口尺寸是固定的，忽略内容驱动的高度调整
    if state.is_pomodoro.load(Ordering::SeqCst) {
        return;
    }

    let scale = window.scale_factor().unwrap_or(1.0);
    let cur = match window.inner_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    let cur_w = cur.width as f64 / scale;
    let cur_h = cur.height as f64 / scale;
    let target_h = height;

    if (cur_h - target_h).abs() < 5.0 {
        return;
    }

    // 自增代号以作废上一段未完成的动画
    let my_gen = state.resize_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let gen = state.resize_gen.clone();
    let win = window.clone();

    std::thread::spawn(move || {
        const STEPS: u32 = 12;
        for i in 1..=STEPS {
            if gen.load(Ordering::SeqCst) != my_gen {
                return; // 被新的 resize 接管，放弃本段动画
            }
            let t = i as f64 / STEPS as f64;
            // ease-out cubic，结尾更顺滑
            let e = 1.0 - (1.0 - t).powi(3);
            let h = cur_h + (target_h - cur_h) * e;
            let _ = win.set_size(LogicalSize::new(cur_w, h));
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
    });
}

// ===========================================================================
// 命令：番茄钟进入 / 退出
// ===========================================================================
#[tauri::command]
fn enter_pomodoro(window: WebviewWindow, state: State<'_, AppState>) {
    state.is_pomodoro.store(true, Ordering::SeqCst);
    state.resize_gen.fetch_add(1, Ordering::SeqCst); // 取消进行中的高度动画

    let _ = window.set_min_size(Some(LogicalSize::new(100.0, 50.0)));
    let _ = window.set_size(LogicalSize::new(300.0, 54.0));
    let _ = window.set_always_on_top(true);
    let _ = window.set_visible_on_all_workspaces(true);
    #[cfg(target_os = "macos")]
    set_ns_window_level(&window, NS_SCREEN_SAVER_LEVEL);
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn exit_pomodoro(window: WebviewWindow, state: State<'_, AppState>, height: f64) {
    state.is_pomodoro.store(false, Ordering::SeqCst);
    state.resize_gen.fetch_add(1, Ordering::SeqCst);

    let _ = window.set_min_size(Some(LogicalSize::new(340.0, 200.0)));
    let h = if height < 200.0 { 200.0 } else { height };
    let _ = window.set_size(LogicalSize::new(440.0, h));
    let _ = window.set_visible_on_all_workspaces(false);
    let _ = window.set_always_on_top(false);
    #[cfg(target_os = "macos")]
    set_ns_window_level(&window, NS_NORMAL_LEVEL);
    let _ = window.show();
    let _ = window.set_focus();
}

// macOS 窗口层级：番茄钟需要盖住全屏 App，故抬升到屏保层级
#[cfg(target_os = "macos")]
const NS_SCREEN_SAVER_LEVEL: i64 = 1000;
#[cfg(target_os = "macos")]
const NS_NORMAL_LEVEL: i64 = 0;

#[cfg(target_os = "macos")]
fn set_ns_window_level(window: &WebviewWindow, level: i64) {
    use objc::{msg_send, sel, sel_impl};
    if let Ok(ns) = window.ns_window() {
        unsafe {
            let _: () = msg_send![ns as *mut objc::runtime::Object, setLevel: level];
        }
    }
}

// ===========================================================================
// 命令：日历功能
// ===========================================================================
fn get_today_date_str() -> String {
    let now = chrono::Local::now();
    match load_lang().as_str() {
        "ja" => now.format("%-m月%d日").to_string(),
        "ko" => now.format("%-m월 %d일").to_string(),
        "en" => now.format("%b %-d").to_string(),
        "es" | "fr" | "ru" => now.format("%-d/%-m").to_string(),
        "de" => now.format("%-d.%-m.").to_string(),
        _ => now.format("%-m月%d日").to_string(), // zh-CN 及默认
    }
}

// ===========================================================================
// 托盘右键菜单：设置 + 退出（开关都搬进设置窗口，菜单只留两项）
// ===========================================================================
fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let s = tray_strings(&load_lang());
    let focus_item = MenuItem::with_id(app, "open-focus", s.focus, true, None::<&str>)?;
    let ann_item = MenuItem::with_id(app, "open-ann", s.ann, true, None::<&str>)?;
    let tidy_item = MenuItem::with_id(app, "open-tidy", s.tidy, true, None::<&str>)?;
    let general_item = MenuItem::with_id(app, "open-general", s.general, true, None::<&str>)?;
    let about_item = MenuItem::with_id(app, "open-about", s.about, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", s.quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&focus_item, &ann_item, &tidy_item, &general_item, &about_item, &sep, &quit_item],
    )
}

/// 显示设置窗口并切到指定标签页（tab 与 settings.html 的 data-tab 一致）。
/// 设置窗口在启动时已创建（隐藏），其 JS 监听器常驻，故直接发事件即可切换标签页。
fn show_settings_tab(app: &AppHandle, tab: &str) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.center();
        let _ = w.set_focus();
        let _ = w.emit("settings-open-tab", tab);
    }
}

fn handle_tray_menu_event(app: &AppHandle, id: &str) {
    match id {
        "open-focus" => {
            show_settings_tab(app, "focus");
        }
        "open-ann" | "open-tidy" | "open-general" | "open-about" => {
            // 菜单项 id 映射到设置面板的标签页名
            let tab = match id {
                "open-ann" => "ann",
                "open-tidy" => "tidy",
                "open-about" => "about",
                _ => "general",
            };
            show_settings_tab(app, tab);
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

/// 供窗内「设置」入口（待办窗/日历窗的齿轮按钮）调用：打开设置面板，可选地切到某标签页。
#[tauri::command]
fn open_settings(app: AppHandle, tab: Option<String>) {
    show_settings_tab(&app, tab.as_deref().unwrap_or("general"));
}

// ===========================================================================
// 托盘点击：在图标下方居中弹出 / 隐藏窗口
// ===========================================================================
fn toggle_window_at_tray(window: &WebviewWindow, rect: tauri::Rect) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    let scale = window.scale_factor().unwrap_or(1.0);
    if let Ok(win_size) = window.outer_size() {
        let icon_pos = rect.position.to_physical::<f64>(scale);
        let icon_size = rect.size.to_physical::<f64>(scale);
        let mut x = icon_pos.x + icon_size.width / 2.0 - (win_size.width as f64) / 2.0;
        let y = icon_pos.y + icon_size.height; // 菜单栏图标正下方
        if x < 10.0 {
            x = 10.0;
        }
        let _ = window.set_position(PhysicalPosition::new(x.round(), y.round()));
    }

    let _ = window.show();
    let _ = window.set_focus();
}

// ===========================================================================
// 托盘图标的创建（显隐通过"创建 / 移除"实现，比 set_visible 在 macOS 上更可靠）
// ===========================================================================
fn create_main_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_tray_menu(app)?;
    // 数字仅在"显示待办统计"开启时显示
    let title = if load_show_count() {
        LAST_PENDING.load(Ordering::SeqCst).to_string()
    } else {
        String::new()
    };
    TrayIconBuilder::with_id("main")
        // 菜单栏图标（模板图像，随明暗自动着色）+ 可选的未完成数量
        .icon(tauri::include_image!("./icons/tray.png"))
        .icon_as_template(true)
        .title(title)
        .menu(&menu)
        .show_menu_on_left_click(false) // 左键弹窗，右键才出菜单
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                if let Some(win) = tray.app_handle().get_webview_window("main") {
                    toggle_window_at_tray(&win, rect);
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn create_calendar_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_tray_menu(app)?;
    TrayIconBuilder::with_id("calendar")
        .title(get_today_date_str())
        .menu(&menu)
        .show_menu_on_left_click(false) // 左键弹窗，右键才出菜单
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let _ = tray.set_title(Some(get_today_date_str()));
                if let Some(win) = tray.app_handle().get_webview_window("calendar") {
                    toggle_window_at_tray(&win, rect);
                }
            }
        })
        .build(app)?;
    Ok(())
}

// ===========================================================================
// 入口
// ===========================================================================
fn main() {
    migrate_legacy_if_needed();

    let is_pomodoro = Arc::new(AtomicBool::new(false));
    let resize_gen = Arc::new(AtomicU32::new(0));
    let is_pomodoro_for_blur = is_pomodoro.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(AppState {
            is_pomodoro: is_pomodoro.clone(),
            resize_gen: resize_gen.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            load_todos,
            save_todos,
            load_settings,
            save_settings,
            update_tray_title,
            resize_window,
            enter_pomodoro,
            exit_pomodoro,
            get_settings_state,
            set_autostart,
            relocalize_tray,
            refresh_tray_count,
            get_tiling_settings,
            request_accessibility,
            apply_tiling_shortcuts,
            suspend_tiling_shortcuts,
            resize_settings,
            open_settings,
            get_todo_shortcut,
            apply_todo_shortcut_settings,
            suspend_todo_shortcut,
            check_model_status,
            download_model,
            load_translate_model,
            unload_translate_model,
            get_translate_status,
            translate_text,
            focus_music::focus_init,
            focus_music::focus_start,
            focus_music::focus_stop,
            focus_music::focus_set_prompt,
            focus_music::focus_set_drums,
            focus_music::focus_set_volume,
            focus_music::focus_get_status,
            focus_music::focus_setup_status,
        ])
        .setup(move |app| {
            // 隐藏 Dock 图标（等效 Electron 的 app.dock.hide()）
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let window = app
                .get_webview_window("main")
                .expect("主窗口 main 未创建");

            let calendar_window = app
                .get_webview_window("calendar")
                .expect("日历窗口 calendar 未创建");

            // 失焦自动隐藏（番茄钟模式下保持显示）
            {
                let w = window.clone();
                let pom = is_pomodoro_for_blur.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        if !pom.load(Ordering::SeqCst) {
                            let _ = w.hide();
                        }
                    }
                });
            }

            // 日历窗口失焦自动隐藏
            {
                let cw = calendar_window.clone();
                calendar_window.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        let _ = cw.hide();
                    }
                });
            }

            // 菜单事件全局分发，只注册一次即可覆盖两个托盘（含之后重建的托盘）
            // 轻听运行实例 tracker
            app.on_menu_event(move |app, event| {
                handle_tray_menu_event(app, event.id.as_ref());
            });

            // 两个托盘始终创建（待办 + 日历）
            let app_handle = app.handle();
            if let Err(e) = create_main_tray(app_handle) {
                eprintln!("[tray] create_main_tray failed: {e}");
            }
            if let Err(e) = create_calendar_tray(app_handle) {
                eprintln!("[tray] create_calendar_tray failed: {e}");
            }

            // 码放：按设置注册窗口整理快捷键（开关关闭则不注册）
            apply_tiling(app_handle);

            // 设置窗口：点关闭按钮时只隐藏、不销毁，便于下次从菜单再打开
            if let Some(settings_win) = app.get_webview_window("settings") {
                let sw = settings_win.clone();
                settings_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = sw.hide();
                    }
                });
            }

            // 无 Dock 图标 + 窗口默认隐藏，用户易找不到应用。按产品偏好：
            // 每次启动都打开设置面板并停在「使用教程」标签（settings.html 默认即该标签），讲清
            // 「应用在菜单栏 / 左键打开 / 右键看更多」。用户点「开始使用」即收起设置、弹出主窗。
            if let Some(settings_win) = app.get_webview_window("settings") {
                let _ = settings_win.center();
                let _ = settings_win.show();
                let _ = settings_win.set_focus();
            }

            // 全局快捷键切换待办窗口显隐（从 settings 读取，默认 ⌘⇧U）
            apply_todo_shortcut(app_handle);

            // 翻译快捷键（固定 Cmd+Shift+Y）
            apply_translate_shortcut(app_handle);

            // 设置窗口：点关闭按钮时只隐藏、不销毁
            if let Some(settings_win) = app.get_webview_window("settings") {
                let sw = settings_win.clone();
                settings_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = sw.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用出错");
}
