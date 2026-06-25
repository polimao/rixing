<div align="center">

<img src="docs/images/hero.png" alt="待办 · Todos — a minimalist menu-bar to-do & calendar for macOS" width="100%">

# 待办 · Todos

**A minimalist menu-bar to-do list & calendar for macOS — fast, private, and always one click away.**

[![Platform](https://img.shields.io/badge/platform-macOS%2010.15%2B-000000?logo=apple&logoColor=white)](https://www.apple.com/macos/)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/backend-Rust-DEA584?logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![.dmg size](https://img.shields.io/badge/.dmg-~1.8_MB-3FB950)](#-why-tauri)
[![License: MIT](https://img.shields.io/badge/license-MIT-4C8EDA)](LICENSE)

English · [简体中文](README.zh-CN.md)

</div>

---

**待办 · Todos** lives in your macOS menu bar. Left-click the tray to pop a tidy to-do list right under the icon; the second tray icon shows today's date and opens a Chinese-lunar calendar. No Dock icon, no window clutter — it stays out of the way until you need it, and a global hotkey brings it up from anywhere.

It started as an Electron app and was rewritten in **Tauri v2**: the bundle shrank from ~100 MB to a **~1.8 MB .dmg**, with a fraction of the memory footprint and a native macOS WebView.

## ✨ Features

- 🧷 **Menu-bar native** — two tray icons (to-do list + calendar). Left-click pops the window directly under the icon; right-click opens the menu. No Dock icon (accessory app).
- ✅ **Frictionless to-dos** — group by category / priority / time, inline editing, one-tap status, and an *Achievements* view with a completion trend chart.
- 🍅 **Built-in Pomodoro** — turn any task into a focus session; the capsule timer floats above full-screen apps.
- 📅 **Calendar with Chinese lunar dates** — solar + lunar days, public holidays and 休/班 (rest/work) badges, today highlighted.
- ⌨️ **Global hotkey** — `⌘ ⇧ U` toggles the list from any app.
- 🌗 **Light / Dark / System theme** — switch instantly; every window follows.
- 🌍 **8 languages** — 简体中文, English, 日本語, 한국어, Español, Français, Deutsch, Русский. The tray text and menus localize too.
- 🚀 **Launch at login** — optional, one toggle in Settings.
- 🪟 **Split screen** — snap the **active window of any app** to the left/right half, maximize, or restore it — with **customizable** hotkeys (default `⌘⌃ + arrows`) and an adjustable gap. Requires macOS Accessibility permission.
- ☁️ **Private by design** — your data is plain JSON in *your* iCloud Drive. No account, no telemetry, no servers.

## 📸 Screenshots

|                       To-dos                        |                       Calendar                         |
| :-------------------------------------------------: | :----------------------------------------------------: |
| <img src="docs/images/todos-light.png" width="330"> | <img src="docs/images/calendar-light.png" width="300"> |

|                     Dark mode                      |                       Settings                        |
| :------------------------------------------------: | :---------------------------------------------------: |
| <img src="docs/images/todos-dark.png" width="330"> | <img src="docs/images/settings-dark.png" width="300"> |

## 📦 Install

### Download

Grab the latest `.dmg` from the [Releases](../../releases) page, open it, and drag **待办.app** to Applications.

> The app isn't notarized yet. On first launch, right-click the app → **Open**, or allow it under *System Settings → Privacy & Security*.

### Build from source

```bash
# Prerequisites: Rust (https://rustup.rs) and the Tauri CLI
cargo install tauri-cli --version "^2.0"

git clone https://github.com/<your-username>/todos.git
cd todos
cargo tauri build      # Chinese edition → product name 「日行」

# International edition → product name "Rixing"
cargo tauri build --config src-tauri/tauri.international.conf.json

# both → src-tauri/target/release/bundle/{dmg,macos}/
```

> Both editions ship all 8 UI languages and auto-detect the language from the
> system; they differ only in the bundle/product name (`日行` vs `Rixing`). The
> marketing site ([`docs/`](docs/)) auto-selects Chinese + the `日行` package in
> China (by timezone) and the visitor's language + the `Rixing` package
> elsewhere, with a manual language switcher in the nav.

## 🚀 Usage

| Action                              | How                                                |
| ----------------------------------- | -------------------------------------------------- |
| Show / hide the to-do list          | Left-click the **待办** tray icon, or press `⌘ ⇧ U` |
| Open the calendar                   | Left-click the **date** tray icon                  |
| Open Settings / Quit                | Right-click either tray icon                       |
| Change language / theme / autostart | The **Settings** window                            |

## ⚙️ Settings

Right-click a tray icon → **Settings**:

- **Launch at login** — start 待办 automatically when you log in.
- **Language** — 8 languages, or *follow the system*.
- **Theme** — Light, Dark, or *follow the system*.
- **Split screen** — enable it, set the **gap** between windows/edges, and **rebind** each shortcut (click a key field and press the combo). First enable triggers the macOS Accessibility prompt.

Changes apply live across every window and the menu-bar text.

### Split-screen shortcuts (default)

| Shortcut | Action |
| -------- | ------ |
| `⌘ ⌃ ←`  | Left half of the current screen |
| `⌘ ⌃ →`  | Right half |
| `⌘ ⌃ ↑`  | Maximize (fill the screen) |
| `⌘ ⌃ ↓`  | Restore the previous size |

All four are user-rebindable, and the **gap** is the basis for every snapped size.

## 🛠 Development

The frontend is plain static HTML/CSS/JS (no bundler / build step); the backend is Rust.

```bash
cargo tauri dev        # run with hot-reload of the Rust side
# or: pnpm dev / pnpm build  (aliases for the cargo tauri commands)
```

```
src/                       Frontend (Tauri frontendDist — static, no build step)
  index.html  renderer.js  style.css      To-do window
  calendar.html  calendar.js              Calendar window (lunar via vendored lunar.js)
  settings.html  settings.js              Settings window
  i18n.js                                 8-language dictionary + helpers
  ui-common.js                            Theme + language bootstrap, cross-window sync
  theme.css                               CSS variables + dark overrides
src-tauri/                 Rust backend
  src/main.rs              Windows / tray / hotkey / Pomodoro / storage / i18n
  tauri.conf.json          Borderless + transparent + menu-bar accessory
  capabilities/            Frontend IPC permissions
```

### How it works (a few highlights)

- **Tray, localized** — one `TrayIconBuilder` per icon; the title, menu (`Settings` / `Quit`) and date format are localized from the saved language. Changing language rebuilds the trays on the main thread.
- **i18n** — `i18n.js` holds the dictionaries; `ui-common.js` resolves the language (explicit or system), translates `[data-i18n]` nodes, and syncs all windows via a Tauri event.
- **Theme** — a `data-theme` attribute on `<html>` drives CSS variables; *System* is resolved with `prefers-color-scheme`.
- **Auto-hide & positioning** — windows hide on blur (except during Pomodoro) and pop centered beneath the clicked tray icon.

## 🪶 Why Tauri

|                 | Electron (old)   | **Tauri v2 (now)**  |
| --------------- | ---------------- | ------------------- |
| `.dmg` size     | ~100 MB          | **~1.8 MB**         |
| Runtime         | Bundled Chromium | Native macOS WebView |
| Resident memory | High             | Much lower          |
| Backend         | Node             | Rust                |

## 🔒 Data & privacy

Everything stays on your machine. To-dos and settings are stored as JSON — in **iCloud Drive when it's enabled** (so your Macs stay in sync), otherwise in a local App Support folder:

```
# iCloud Drive enabled:
~/Library/Mobile Documents/com~apple~CloudDocs/Todos/.todos_data.json
~/Library/Mobile Documents/com~apple~CloudDocs/Todos/.todos_settings.json
# iCloud Drive off:
~/Library/Application Support/com.limao.todos/.todos_data.json
~/Library/Application Support/com.limao.todos/.todos_settings.json
```

No accounts, no analytics, no network calls. (Legacy `~/.todos_*.json` files are migrated, then removed, on first launch.)

## 🗺 Roadmap

- [ ] Notarized / signed builds
- [ ] Reminders & notifications
- [ ] Deeper localization of in-app content
- [ ] Windows / Linux builds

## 🤝 Contributing

Issues and PRs are welcome. For larger changes, please open an issue first to discuss what you'd like to change.

## 📄 License

[MIT](LICENSE) © 李貌
