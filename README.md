<div align="center">

<img src="docs/images/hero.png" alt="日行 · RiXing — a macOS menu-bar productivity companion with on-device AI" width="100%">

# 日行 · RiXing

**Your macOS menu bar, supercharged — tasks, focus, a lunar calendar, on-device AI music, and local translation, all in one tiny private app.**

[![Platform](https://img.shields.io/badge/platform-macOS%2010.15%2B-000000?logo=apple&logoColor=white)](https://www.apple.com/macos/)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![Backend](https://img.shields.io/badge/backend-Rust-DEA584?logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![.dmg size](https://img.shields.io/badge/.dmg-~5.3_MB-3FB950)](https://tauri.app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-4C8EDA)](LICENSE)

[English](README.md) · [简体中文](README.zh-CN.md)

</div>

---

**日行 · RiXing** lives in your macOS menu bar and quietly handles the small, daily things — your tasks, a focus timer, today's date with the Chinese lunar calendar, and ambient AI that helps you stay in flow. No Dock icon, no window clutter, no cloud. One click or a global hotkey brings it up from anywhere; everything else runs on your Mac.

## 💡 Why RiXing

- 🔒 **Private by default** — your to-dos and settings live as plain JSON in *your* iCloud Drive, and the AI runs **on your Mac**. No accounts, no telemetry, no servers. Ever.
- 🤖 **Real AI, no API keys** — generative focus music (Magenta RealTime 2) and 8-language translation run **entirely on-device** via Apple Silicon. Zero subscriptions, zero usage fees.
- 🪶 **Tiny & native** — under 6 MB, sits in the menu bar, and feels like part of macOS. Built with Tauri v2 + Rust, not a browser in a box.
- 🧩 **One app, many jobs** — tasks, pomodoro, calendar, anniversaries, split-screen, and keep-awake. Stop juggling a dozen single-purpose utilities.

## ✨ Features

- 🎵 **On-device AI music — 轻听 (QingTing)** — real-time generative focus music powered by Magenta RealTime 2 (MRT2) running locally via MLX on Apple Silicon. Pick a preset (vibe / genre / instrument) or write your own prompt, toggle drums, set the volume — the music streams endlessly and switches style on the fly. First launch auto-installs the Python env + model (from HuggingFace, with an `hf-mirror.com` fallback so downloads are fast in China).
- 🌐 **On-device translation** — a local HY-MT model (~1.1 GB gguf, runs via `llama.cpp`) translates between 8 languages without leaving the app. `⌘⇧Y` pops the translate panel; everything runs on your CPU/GPU, no cloud.
- ✅ **Frictionless to-dos** — group by category / priority / time, inline editing, one-tap status, and an *Achievements* view with a completion trend chart.
- 🍅 **Built-in Pomodoro** — turn any task into a focus session; the capsule timer floats above full-screen apps.
- 📅 **Lunar calendar with anniversary countdowns** — solar + lunar days, public holidays and 休/班 (rest/work) badges, today highlighted, plus a 倒计时 (countdown) panel that counts down to the important dates you set (birthdays, deadlines…) and flags the soon ones in red.
- 🧷 **Menu-bar native** — two tray icons (to-do + calendar). Left-click pops the window directly under the icon; right-click opens the menu. No Dock icon (accessory app).
- 🪟 **Split screen** — snap the **active window of any app** to the left/right half, maximize, or restore it — with **customizable** hotkeys (default `⌘⌃ + arrows`) and an adjustable gap. Requires macOS Accessibility permission.
- 🛡️ **Keep Awake** — prevent your Mac from sleeping or dimming the screen with a timer; auto-restores when the time is up.
- ⌨️ **Customizable global hotkeys** — set your own shortcut for the to-do window (`⌘⇧U` default) and the snap shortcuts in Settings.
- 🌗 **Light / dark / follow-system** theme, synced across every window.
- 🌍 **8 languages** — 简体中文, English, 日本語, 한국어, Español, Français, Deutsch, Русский. Tray labels and menus switch too.
- 🚀 **Launch at login** — enable from Settings.

## 📸 Screenshots

|                       To-dos                        |                       Calendar                         |
| :-------------------------------------------------: | :----------------------------------------------------: |
| <img src="docs/images/todos-light.png" width="330"> | <img src="docs/images/calendar-light.png" width="300"> |

|                     Dark mode                      |                       Settings                        |
| :------------------------------------------------: | :---------------------------------------------------: |
| <img src="docs/images/todos-dark.png" width="330"> | <img src="docs/images/settings-dark.png" width="300"> |

## 📦 Install

### Download

Grab the latest `.dmg` from the [Releases](../../releases) page, open it, and drag **日行.app** to Applications.

### Build from source

```bash
# Prerequisites: Rust (https://rustup.rs) and the Tauri CLI
cargo install tauri-cli --version "^2.0"

git clone https://github.com/polimao/rixing.git
cd rixing
cargo tauri build      # Chinese edition → product name 「日行」

# International edition → product name "RiXing"
cargo tauri build --config src-tauri/tauri.international.conf.json

# both → src-tauri/target/release/bundle/{dmg,macos}/
```

### Why so small?

RiXing is built with Tauri v2 (a Rust backend + a thin native webview) instead of bundling a full browser engine, so the `.dmg` is ~5.3 MB and the app uses a fraction of the memory of an Electron app. The AI models are downloaded on first use and cached locally — they're never counted in the app size.

### Split-screen shortcuts (default)

| Shortcut | Action |
| -------- | ------ |
| `⌘ ⌃ ←`  | Left half of the current screen |
| `⌘ ⌃ →`  | Right half |
| `⌘ ⌃ ↑`  | Maximize (fill the screen) |
| `⌘ ⌃ ↓`  | Restore the previous size |

All four are user-rebindable.

## 🛠 Development

The frontend is plain static HTML/CSS/JS (no build step); the backend is Rust.

```bash
cargo tauri dev        # run with hot-reload of the Rust side
# or: pnpm dev / pnpm build  (aliases for the cargo tauri commands)
```

## 🔒 Data & privacy

Everything stays on your machine. To-dos and settings are stored as JSON — in **iCloud Drive when it's enabled** (so your Macs stay in sync), otherwise in a local App Support folder:

```
# iCloud Drive enabled:
~/Library/Mobile Documents/com~apple~CloudDocs/Rixing/.todos_data.json
~/Library/Mobile Documents/com~apple~CloudDocs/Rixing/.todos_settings.json
# iCloud Drive off:
~/Library/Application Support/com.limao.rixing/.todos_data.json
~/Library/Application Support/com.limao.rixing/.todos_settings.json
```

No accounts, no analytics, no telemetry.

### AI features & network

The translation and QingTing music features run their AI models **entirely on-device** after a one-time download:

- **Translation** — the HY-MT gguf model (~1.1 GB) is fetched from HuggingFace on first use and cached under the app's data dir (iCloud Drive / App Support, same as your to-dos).
- **QingTing** — the MRT2 model (~0.5 GB) plus a small `uv`-managed Python env are fetched on first launch and cached under `~/Documents/Magenta/magenta-rt-v2/`.

Both auto-fall back to `hf-mirror.com` when the HuggingFace main site is slow/unreachable. After the initial download, inference is 100% local — no audio, text, or to-do data ever leaves your Mac.

## 📄 License

[MIT](LICENSE) © Polimao
