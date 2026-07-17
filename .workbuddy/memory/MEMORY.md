# 项目长期记忆：rixing (日行 / RiXing)

## 项目概况
极简便签 TODO 桌面应用（Tauri v2，macOS 菜单栏应用）。前端是纯静态 HTML/CSS/JS（`src/`），无前端构建步骤；后端 Rust（`src-tauri/`）。`productName=日行`，identifier=`com.limao.rixing`，bundle 目标 `dmg`+`app`。

## 发布 release 的坑（重要，每次打包都会遇到）
1. **create-dmg 的 AppleScript 美化步骤会失败**：`cargo tauri build` 在 DMG 打包阶段调用 `bundle_dmg.sh`，其中用 `osascript` 让 Finder 排布图标，当前环境无控制 Finder 的自动化权限 → 报 `-10004 权限违例`，导致整个 build 报错退出（但 `.app` 已先生成成功）。
   - 绕过：`cargo tauri build` 照常跑（拿 `.app`），然后手动执行 `bundle_dmg.sh --skip-jenkins` 生成 dmg：
     ```
     STAGE=/tmp/rixing_dmg_stage; rm -rf "$STAGE"; mkdir -p "$STAGE"
     cp -a "src-tauri/target/release/bundle/macos/日行.app" "$STAGE/"
     bash "src-tauri/target/release/bundle/dmg/bundle_dmg.sh" --skip-jenkins \
       --volname "日行" --app-drop-link 200 120 --icon "日行.app" 100 120 \
       "src-tauri/target/release/bundle/dmg/日行_X.Y.Z_aarch64.dmg" "$STAGE"
     ```
   - 产物 dmg 功能完整，仅少了自定义窗口布局（图标位置默认），不影响安装。
2. **中文文件名资产会被 GitHub 吞掉前缀**：用 `gh release create/upload` 上传 `日行_*.dmg` 时，"日行"前缀丢失，变成 `_1.1.1_aarch64.dmg`。正确做法：上传时改用英文前缀 `RiXing_1.1.1_aarch64.dmg` / `RiXing_1.1.1_aarch64.app.tar.gz`（与 v1.1.0 约定一致）。
3. **无代码签名证书**：`security find-identity` 显示 0 个有效身份。产物为 ad-hoc 签名，用户需右键打开或 `xattr -cr` 绕过 Gatekeeper。发布说明里要注明此限制。
4. **版本号**：当前 tauri.conf.json 版本要手动改；远程已存在 v1.1.0 release，增量修复用 v1.1.1 等新 tag，勿覆盖已发布版本。

## 待办页面 UI 约定（用户偏好）
- 待办项几乎贴边（`.todo-item` padding `0 8px`），`.todo-container` 仅上下 padding。
- 扁平无边框风：除 `.group-header` 的 `border-bottom` 外，所有边框删除（容器/分组/项/徽章/输入框聚焦态改用蓝色光晕而非边框）。
- 卡片/输入框圆角已删除，仅保留整个窗口（`.todo-container`）`border-radius:10px`。
- 颜色统一走 CSS 变量（`--bg/--surface/--border/--text/--accent` 等），项目只有亮/暗两套主题，无独立"紫色主题"变量（之前看到的紫色是窗口外框系统着色）。

## 翻译页 UI 约定
- **架构（2026-07-17 重构）**：翻译功能已从 `settings.html`/`settings.js` 拆到 **`src/translate/`** 目录，仍作为「设置」窗口的 translate 标签页（用户选"保留为 tab，代码拆目录"方案，非独立窗口）。
  - `translate/translate.css`：翻译专属样式（原内联在 settings.html 的 `.tr-*`/`.progress-*`/`.model-status-tag` 等），与共享的 `.btn`/`.hidden`/`.loading-spinner` 分离。
  - `translate/translate.js`：标记模板 `TR_TRANSLATE_PANEL_HTML` + `injectTranslatePanel()`（脚本加载时把标记注入 settings.html 的 `#translate-mount` 并 `applyI18n(mount)`）+ 全部 `tr*` 逻辑 + `initTranslate()`。
  - `settings.html`：翻译面板只剩 `<div id="translate-mount">` 挂载点；`<head>` 引 `translate/translate.css`；`<body>` 末尾脚本顺序 `i18n.js → ui-common.js → translate/translate.js → settings.js`。
  - `initTranslateHotkey()` **留在 settings.js**（它耦合快捷键录制系统：`translateKbdBtn`/`fmtTodoAccel`/`recordingBtn` 均在 settings.js）；`initTranslate()` 调用保留在 settings.js 末尾，定义来自 translate.js（全局函数）。
- 孤儿 `translate.html`/`translate.js` 已确认不存在（无需清理）；彩色 SVG 图标当年只接在孤儿文件里，settings 版本本就无图标赋值（`tr-btn-icon` 是空 span），本次抽取零回归。
- 视觉为极简三段式上下布局（2026-07-17 重构）：上方源文输入区 + 中央悬浮翻译按钮(`.tr-fab`，胶囊形绿色渐变) + 下方结果区，无分割线。状态反馈全部融入按钮(文字变化 + `.is-loading` 脉冲动画)，无独立 spinner/进度条/模型状态标签。模型下载/加载对用户完全透明(按钮显示"准备中...")。沿用 theme.css 变量，亮/暗双主题。
- 硬约束：所有交互 id 必须保留；`translate-btn/copy-btn` 被 JS 用 `textContent` 重写，内部只能放纯文字(不能放 SVG 图标)；`model-status`/`tgt-lang-label`/`char-count`/`progress-section`/`progress-fill`/`progress-text`/`loading-indicator` 在 DOM 中必须存在(JS 会访问)，均用 `.tr-hidden` 永久隐藏。
- 交换按钮已移除（上下结构无需语言交换）。
- box-shadow 必须用绿色 `rgba(7,193,96,...)`，不可用蓝色 `rgba(64,158,255,...)`（主色是微信绿 `#07c160`）。

## 全局快捷键架构（可配置快捷键的标准做法）
- 后端 (`src-tauri/src/main.rs`)：每个可配置快捷键遵循同一模式——
  1) `XxxShortcut()` 从 `settings.json` 读 `settings.xxxShortcut` 字段，缺省回退 `XXX_DEFAULT_SHORTCUT`；
  2) `registered_xxx_shortcut()` 用 `OnceLock<Mutex<Option<Shortcut>>>` 跟踪已注册项，重设时先 `gs.unregister(old)`；
  3) 三个 `#[tauri::command]`：`get_xxx_shortcut` / `apply_xxx_shortcut_settings`（保存后重注册）/ `suspend_xxx_shortcut`（录制时临时注销，避免被系统吞键）；
  4) 在 `invoke_handler` 注册这 3 个命令，并在 `.setup` 里调用 `apply_xxx_shortcut(&app_handle)` 启动注册。
- 前端 (`src/settings.js`)：录制系统共用一套 `recordingBtn` 状态机。待办/翻译这类"独立全局动作"走特殊分支（`todoKbdBtn`/`translateKbdBtn`，不在 `kbdBtns` 里——`kbdBtns` 选择器用 `:not([data-key="todo"]):not([data-key="translate"])` 排除）；分屏(tiling)快捷键走 `settings.tiling.shortcuts[key]` 通用分支。
- 录制逻辑：`keydown` handler 监听 `recordingBtn`；非修饰键 + 至少一个修饰键 → `accel = [...mods, e.code].join('+')`，写入 `settings.xxxShortcut`，`saveSettings()` 持久化（整体写回 settings.json），再 `apply_xxx_shortcut_settings` 重注册。
- 复用：显示用 `fmtTodoAccel()`，录制中提示复用 `todo_hotkey_record` 文案；HTML 里是 `<button class="kbd" data-key="xxx">`。
- 已知快捷键：待办窗口 `super+shift+KeyU`（切换主窗显隐）；翻译 `super+shift+KeyY`（打开设置翻译标签页 `show_settings_tab(app,"translate")`）。
