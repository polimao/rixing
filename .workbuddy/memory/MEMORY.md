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
- **架构已厘清（2026-07-17 核查）**：翻译 UI 实际只有一份在运行——`settings.html` 的 translate 标签页（由 settings.js `initTranslate` 驱动）。`translate.html` + `translate.js` 是**孤儿文件**：tauri.conf.json 仅声明 3 窗（main→index.html、calendar→calendar.html、settings→settings.html），翻译快捷键也只 `show_settings_tab(app,"translate")` 打开 settings 标签；translate.html 无任何窗口加载，仅被 Tauri 当静态资源打包，且 translate.js 仅被 translate.html 引用。可安全删除两者；delete 前注意 translate.html 比 settings 标签功能更全（含源语言选择、可工作交换按钮、更完整模型管理），若想保留这些特性需先移植进 settings 标签。
- 视觉为 DeepL 风格左右双栏分屏：顶栏(品牌+模型状态胶囊)、语言栏(源 select+圆形交换按钮+目标 label)、双栏卡片(面板头语言名+悬浮工具/复制、textarea、面板脚字符数)、渐变主按钮、精致进度条。沿用 theme.css 变量，亮/暗双主题。
- 改翻译页的硬约束：所有交互 id 必须保留；`translate-btn/copy-btn/model-btn` 被 JS 用 `textContent` 重写，内部只能放纯文字(不能放 SVG 图标)；`model-status` 在 settings 中必须存在于 DOM(JS 写 innerHTML，可 display:none)。
- 交换按钮目前是纯视觉装饰(hover 旋转 180°)，未接实际语言交换。

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
