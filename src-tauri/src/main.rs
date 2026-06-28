// 待办 — Tauri 版本
// 隐藏 Dock、菜单栏托盘、全局快捷键、失焦自动隐藏、番茄钟胶囊形态、
// 平滑窗口高度动画，数据持久化到 iCloud Drive（含 legacy 路径迁移）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tiling;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde_json::Value;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// ===========================================================================
// 应用共享状态
// ===========================================================================
struct AppState {
    /// 是否处于番茄钟（专注）模式——决定失焦时是否隐藏窗口
    is_pomodoro: Arc<AtomicBool>,
    /// 窗口高度动画的“代号”，每次新的 resize 自增以取消上一段动画
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

/// 托盘三处文案：(待办标题, “设置”菜单项, “退出”菜单项)。
/// 托盘右键菜单文案：分别跳转到设置面板对应标签页（念日 / 窗口分屏 / 通用设置 / 关于）+ 退出。
struct TrayLabels {
    ann: &'static str,
    tidy: &'static str,
    general: &'static str,
    about: &'static str,
    quit: &'static str,
}

fn tray_strings(lang: &str) -> TrayLabels {
    match lang {
        "en" => TrayLabels { ann: "Anniversaries", tidy: "Split screen", general: "General settings", about: "About", quit: "Quit" },
        "ja" => TrayLabels { ann: "記念日", tidy: "画面分割", general: "一般設定", about: "このアプリについて", quit: "終了" },
        "ko" => TrayLabels { ann: "기념일", tidy: "화면 분할", general: "일반 설정", about: "정보", quit: "종료" },
        "es" => TrayLabels { ann: "Aniversarios", tidy: "Dividir pantalla", general: "Ajustes generales", about: "Acerca de", quit: "Salir" },
        "fr" => TrayLabels { ann: "Anniversaires", tidy: "Partage d’écran", general: "Réglages généraux", about: "À propos", quit: "Quitter" },
        "de" => TrayLabels { ann: "Jahrestage", tidy: "Bildschirm teilen", general: "Allgemeine Einstellungen", about: "Über", quit: "Beenden" },
        "ru" => TrayLabels { ann: "Годовщины", tidy: "Разделение экрана", general: "Общие настройки", about: "О программе", quit: "Выход" },
        _ => TrayLabels { ann: "念日", tidy: "窗口分屏", general: "通用设置", about: "关于", quit: "退出" }, // zh-CN 及默认
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
/// 切换「显示待办统计」后刷新主托盘标题：仅改标题、不重建托盘。
/// 早先用「移除+重建」来清数字，但在 macOS 上移除后同一帧重建会把图标弄丢
/// （图标只在创建时设置一次），于是关闭统计就看不到待办图标了。
/// 实际上 `set_title(Some(""))` 能可靠清空数字（`set_title(None)` 在 macOS 是 no-op，
/// 才是当初清不掉的原因）。托盘只能在主线程操作。
#[tauri::command]
fn refresh_tray_count(app: AppHandle) {
    let app_for_main = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = app_for_main.tray_by_id("main") {
            let title = if load_show_count() {
                LAST_PENDING.load(Ordering::SeqCst).to_string()
            } else {
                String::new()
            };
            let _ = tray.set_title(Some(title));
        }
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

/// 弹出系统“辅助功能”授权引导，返回当前是否已授权。
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
/// 也避免组合键被全局快捷键“吞掉”导致录制不到。录制结束再调 apply 恢复。
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
        // 图标恒显；数字仅在“显示待办统计”开启时显示，否则清空只留图标
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
    let ann_item = MenuItem::with_id(app, "open-ann", s.ann, true, None::<&str>)?;
    let tidy_item = MenuItem::with_id(app, "open-tidy", s.tidy, true, None::<&str>)?;
    let general_item = MenuItem::with_id(app, "open-general", s.general, true, None::<&str>)?;
    let about_item = MenuItem::with_id(app, "open-about", s.about, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", s.quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&ann_item, &tidy_item, &general_item, &about_item, &sep, &quit_item],
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
// 托盘图标的创建（显隐通过“创建 / 移除”实现，比 set_visible 在 macOS 上更可靠）
// ===========================================================================
fn create_main_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_tray_menu(app)?;
    // 数字仅在“显示待办统计”开启时显示
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
            open_settings
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

            // 全局快捷键 Cmd/Ctrl+Shift+U 切换显隐
            let win_for_shortcut = window.clone();
            let toggle_shortcut =
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyU);
            app.global_shortcut().on_shortcut(
                toggle_shortcut,
                move |_app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if win_for_shortcut.is_visible().unwrap_or(false) {
                            let _ = win_for_shortcut.hide();
                        } else {
                            let _ = win_for_shortcut.show();
                            let _ = win_for_shortcut.set_focus();
                        }
                    }
                },
            )?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用出错");
}
