<div align="center">

<img src="docs/images/hero.png" alt="日行 · RiXing —— macOS 极简菜单栏待办与日历" width="100%">

# 日行 · RiXing

**一款常驻 macOS 菜单栏的待办与日历 —— 轻快、私密、随手可达。**

[![Platform](https://img.shields.io/badge/platform-macOS%2010.15%2B-000000?logo=apple&logoColor=white)](https://www.apple.com/macos/)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/backend-Rust-DEA584?logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![.dmg size](https://img.shields.io/badge/.dmg-~1.8_MB-3FB950)](#-why-tauri)
[![License: MIT](https://img.shields.io/badge/license-MIT-4C8EDA)](LICENSE)

[English](README.md) · 简体中文

</div>

---

**日行 · RiXing** 常驻在 macOS 菜单栏：左键点击托盘图标，待办清单就在图标正下方弹出；第二个托盘图标显示今天日期，点开是带农历的日历。没有 Dock 图标、不占窗口，需要时一键唤出，全局快捷键随处可用。

## ✨ 功能特性

- 🧷 **菜单栏原生** —— 两个托盘图标（待办 + 日历）。左键在图标正下方弹窗，右键打开菜单；不在 Dock 显示（accessory 应用）。
- ✅ **顺手的待办** —— 按分类 / 优先级 / 时间分组，行内编辑，一键切换状态，并有带完成趋势图的「成就」视图。
- 🍅 **内置番茄钟** —— 把任意任务变成专注计时；胶囊计时器可悬浮在全屏 App 之上。
- 📅 **带农历的日历** —— 公历 + 农历、法定节假日与「休 / 班」角标，高亮今天。
- ⌨️ **可自定义全局快捷键** —— 在设置中自行修改唤出待办窗口的快捷键。
- 🌗 **亮色 / 暗色 / 随系统** —— 主题即时切换，所有窗口同步。
- 🌍 **8 种语言** —— 简体中文、English、日本語、한국어、Español、Français、Deutsch、Русский。托盘文字和菜单也随语言切换。
- 🚀 **开机自启动** —— 设置中一键开启。
- 🪟 **窗口分屏** —— 把**任意 App 的当前活跃窗口**分到左半屏 / 右半屏 / 铺满，或一键复原；快捷键**可自定义**（默认 `⌘⌃ + 方向键`），边距可调。需要 macOS「辅助功能」权限。
- ☁️ **隐私优先** —— 数据是存在你自己 iCloud Drive 里的纯 JSON，无账号、无遥测、无服务器。

## 📸 界面预览

|                       待办                        |                       日历                         |
| :-------------------------------------------------: | :----------------------------------------------------: |
| <img src="docs/images/todos-light.png" width="330"> | <img src="docs/images/calendar-light.png" width="300"> |

|                     暗色模式                      |                       设置                        |
| :------------------------------------------------: | :---------------------------------------------------: |
| <img src="docs/images/todos-dark.png" width="330"> | <img src="docs/images/settings-dark.png" width="300"> |

## 📦 安装

### 下载

在 [Releases](../../releases) 页面下载最新 `.dmg`，打开后把 **日行.app** 拖到「应用程序」。

### 从源码构建

```bash
# 前置：Rust (https://rustup.rs) 与 Tauri CLI
cargo install tauri-cli --version "^2.0"

git clone https://github.com/polimao/rixing.git
cd rixing
cargo tauri build      # 中文版 → 软件名「日行」

# 国际版 → 软件名 "RiXing"
cargo tauri build --config src-tauri/tauri.international.conf.json

# 两者产物都在 src-tauri/target/release/bundle/{dmg,macos}/
```

### 窗口分屏快捷键（默认）

| 快捷键   | 动作                     |
| -------- | ------------------------ |
| `⌘ ⌃ ←`  | 移到当前屏幕左半部分     |
| `⌘ ⌃ →`  | 移到右半部分             |
| `⌘ ⌃ ↑`  | 最大化（铺满屏幕）       |
| `⌘ ⌃ ↓`  | 复原到之前的窗口大小     |

四个都可由用户自改。

## 🛠 开发

前端是纯静态 HTML/CSS/JS（无打包步骤），后端是 Rust。

```bash
cargo tauri dev        # 运行（Rust 侧热重载）
# 或：pnpm dev / pnpm build（即上面两条命令的别名）
```

## 🔒 数据与隐私

一切都留在你的电脑上。待办与设置以 JSON 存储：**开启 iCloud Drive 时**放在 iCloud Drive（多台 Mac 自动同步），**未开启时**退回本地 App Support：

```
# iCloud Drive 已开启：
~/Library/Mobile Documents/com~apple~CloudDocs/Rixing/.todos_data.json
~/Library/Mobile Documents/com~apple~CloudDocs/Rixing/.todos_settings.json
# 未开启 iCloud Drive 时：
~/Library/Application Support/com.limao.rixing/.todos_data.json
~/Library/Application Support/com.limao.rixing/.todos_settings.json
```

无账号、无统计、无任何网络请求。

## 📄 许可证

[MIT](LICENSE) © Polimao
