# 日行 · RiXing 推广文案包

> 适用产品：日行 / RiXing —— macOS 菜单栏隐私效率台（待办 · 番茄钟 · 农历日历 · 本地 AI 音乐 · 本地翻译 · 窗口分屏 · 防休眠）
> 仓库：https://github.com/polimao/rixing
> 下载：https://github.com/polimao/rixing/releases
>
> 使用方式：把文中 `{{版本号}}`、`{{dmg下载链接}}` 替换为实际值即可发布。
> 核心卖点（统一口径）：本地 AI、零订阅、零云端、不到 6MB、隐私优先。

---

## 一、少数派（sspai）· 体验长文

**标题（二选一）：**
- 《我把每天的小事都交给了菜单栏：一个不到 6MB、AI 还跑在本地的效率 App》
- 《拒绝上云之后，我的待办和专注反而更顺了》

**正文草稿：**

> 我是那种手机电脑里装了一堆效率工具、结果反而更焦虑的人。直到最近我把"待办 + 专注 + 日历"全部搬进了一个菜单栏小图标里——它叫**日行（RiXing）**。
>
> 最打动我的一点：它**不联网、不登录、不要月费**。待办存在你自己的 iCloud Drive 里，AI 也跑在你自己的 Mac 上。
>
> 它常驻菜单栏，不占 Dock、不弹窗。需要时用全局快捷键一键唤出，平时安静待命。我日常用它做四件事：
>
> 1. **顺手的待办**：按分类/优先级/时间分组，行内编辑，还有带完成趋势的"成就"视图。
> 2. **番茄钟**：把任意任务变专注计时，胶囊计时器能浮在全屏之上。
> 3. **带农历的日历 + 纪念日倒计时**：法定节假日、休/班角标、重要日期红色倒数。
> 4. **真正的本地 AI**：生成式专注音乐（Magenta RealTime 2，Apple Silicon 本地实时生成）和 8 语种翻译（HY-MT 本地推理）全程不出 App，零密钥、零调用费。
>
> 除此之外还有窗口分屏、防休眠、亮/暗主题、8 种语言。整机体积不到 6MB，基于 Tauri v2 + Rust，常驻几乎不占资源。
>
> 如果你也受够了"先注册再使用、数据全在别人服务器"的工具，可以试试这种本地优先的思路。
>
> 下载：{{dmg下载链接}} ｜ 开源（MIT）：https://github.com/polimao/rixing

**发布建议**：配 2–3 张截图（待办亮/暗、日历、设置），文末加话题 `#效率工具` `#macOS` `#隐私`。

---

## 二、V2EX · 自荐帖

**节点**：`分享创造` 或 `macOS`

**标题**：`[分享创造] 做了一个本地优先的 macOS 菜单栏效率 App：待办/番茄钟/农历，AI 还跑在你自己电脑上`

**正文：**

> 大家好，分享一下自己做的 macOS 菜单栏小工具**日行（RiXing）**。
>
> 定位很简单：把"每天都要做的小事"塞进菜单栏，不占 Dock、不弹窗，需要时一键唤出。
>
> 几个我觉得值得一提的点：
> - 🔒 **隐私优先**：待办存自己的 iCloud Drive（纯 JSON），AI 也本地跑，无账号、无遥测、无服务器。
> - 🤖 **真·本地 AI**：专注音乐（Magenta RealTime 2，Apple Silicon 实时生成）+ 8 语种翻译（HY-MT 本地推理），零订阅、零密钥。
> - 🪶 **轻巧原生**：基于 Tauri v2 + Rust，.dmg 不到 6MB。
> - 🧩 **一个 App 多面手**：待办、番茄钟、农历日历/纪念日、窗口分屏、防休眠。
>
> 开源（MIT），欢迎试用和提建议：
> 下载：{{dmg下载链接}}
> 仓库：https://github.com/polimao/rixing
>
> 目前还没做 Apple 签名公证，首次打开若被拦截，右键"打开"或 `xattr -cr` 即可。后续打算补上。求 star 和反馈 🙏

---

## 三、Product Hunt · 发布文案（英文）

**Launch Name**：日行 RiXing

**Tagline（<60 字符）**：
`A private, offline-first macOS menubar: todos, focus & on-device AI`

**First Comment（Maker 留言）**：

> Hi PH! 👋 I built RiXing because I was tired of productivity apps that demand an account, ship my data to the cloud, and charge a monthly fee.
>
> RiXing lives in your macOS menu bar and does the small daily things — todos, pomodoro, a lunar calendar, window snapping, and anti-sleep — all offline.
>
> The part I'm proudest of: the AI runs **on your own Mac**. Generative focus music (Magenta RealTime 2 on Apple Silicon) and 8-language translation (HY-MT, local inference) never leave your machine. No API keys, no subscription.
>
> It's ~6MB, built with Tauri v2 + Rust, MIT-licensed. Would love your feedback!

**Topics**：Productivity · macOS · Artificial Intelligence · Privacy · Developer Tools

**Gallery 说明**：首图放"菜单栏唤起待办"的 GIF；次图放暗色模式 + 本地翻译面板。

**评论区首条（置顶）**：`Free & open source (MIT). Download: {{dmg下载链接}} · Source: https://github.com/polimao/rixing`

**发布时间建议**：周二或周三 12:01 AM PST（太平洋时间），并提前在 X / 个人主页预告。

---

## 四、Hacker News · Show HN（英文）

**标题**：
`Show HN: RiXing – a macOS menubar app with on-device AI (no cloud, no subscription)`

**首段（正文）**：

> RiXing is a menu-bar productivity app for macOS: todos, pomodoro, lunar calendar, window snapping, and anti-sleep. The twist is that the AI runs entirely on-device — generative focus music via Magenta RealTime 2 on Apple Silicon, and 8-language translation via HY-MT with local llama.cpp inference. No accounts, no telemetry, no API keys, no monthly fee. Data lives in your own iCloud Drive as plain JSON.
>
> It's ~6MB, built with Tauri v2 + Rust, MIT-licensed.
>
> Repo: https://github.com/polimao/rixing
> Download: {{dmg下载链接}}
>
> I'd love feedback, especially from anyone who cares about local-first / privacy-respecting tooling. (Note: not yet notarized by Apple, so first launch may need a right-click "Open" or `xattr -cr`.)

**讨论引导（可选补一句）**：
> Curious what people here think about the local-first tradeoff vs. cloud AI — happy to discuss.

---

## 五、通用素材（各渠道复用）

- **一句话定位**：菜单栏里的隐私效率台——待办、番茄钟、本地 AI 音乐与翻译，全离线、零订阅。
- **三组数据钩子**：不到 6MB ／ 零订阅零密钥 ／ 数据只存在你自己的 iCloud Drive。
- **必带链接**：下载 {{dmg下载链接}} ｜ 仓库 https://github.com/polimao/rixing
- **首图/演示**：优先用"菜单栏一键唤出待办 + 本地翻译面板"的 GIF，最能体现"轻巧 + 隐私 AI"。

---

## 六、发布前检查清单

- [ ] 把 `{{版本号}}` `/{{dmg下载链接}}` 替换成实际值
- [ ] 确认 GitHub Release 已发布且 dmg 可下载
- [ ] 准备 3 张截图 + 2 段 GIF（菜单栏唤起、暗色模式、本地翻译）
- [ ] 落地页/README 含"首次打开被拦截"的解决步骤
- [ ] Product Hunt 预约发布时间；HN/少数派 备选标题已定稿
- [ ] 各渠道发布后 24h 内亲自回复评论，引导讨论
