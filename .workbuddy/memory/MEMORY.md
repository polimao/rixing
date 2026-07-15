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
