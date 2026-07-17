// 官网国际化：8 种语言 + 自动选择 + 手动切换。
// 选择规则（与 App 一致）：在中国（按时区判断）→ 简体中文 + 品牌「日行」+ 中文包；
// 否则按浏览器语言显示，品牌「RiXing」+ 国际包。访客可用右上角下拉手动切换并记忆。
// 字符串里的 {brand} 占位符会按当前语言替换为 日行 / RiXing。
(function () {
  const DICT = {
    'zh-CN': {
      lang_name: '简体中文',
      doc_title: '{brand} · 常驻菜单栏的待办 / 日历 / 窗口管理',
      doc_desc: '{brand} —— 一款常驻 macOS 菜单栏的极简待办、日历与窗口分屏工具。轻快、私密、开源免费。',
      og_title: '{brand} · macOS 菜单栏效率工具',
      og_desc: '极简待办 / 农历日历 / 窗口分屏，常驻菜单栏，开源免费。',
      nav_features: '功能',
      nav_shots: '截图',
      nav_download: '下载',
      hero_tag: '常驻菜单栏的极简待办 · 日历 · 窗口分屏',
      hero_sub: '轻快、私密、开源免费。需要时一键唤出，用完即隐，安静地待在你的 macOS 菜单栏里。',
      hero_cta_download: '↓ 免费下载（.dmg）',
      hero_cta_github: '在 GitHub 查看',
      hero_meta: 'macOS 11+ · Apple Silicon · 安装包仅 ~5 MB · MIT 开源',
      feat_title: '为什么选{brand}',
      feat_sub: '把高频效率工具收进菜单栏，少占地方，多干正事。',
      f1_h: '菜单栏原生',
      f1_p: '两个托盘图标：待办与日历。左键即在图标下方弹窗，右键打开设置；不占 Dock。',
      f2_h: '顺手的待办',
      f2_p: '按分类 / 优先级 / 时间分组，行内编辑，一键切换状态，还有完成趋势「成就」视图。',
      f3_h: '内置番茄钟',
      f3_p: '把任意任务变成专注计时，胶囊计时器可悬浮在全屏 App 之上。',
      f4_h: '农历日历',
      f4_p: '公历 + 农历、法定节假日与「休 / 班」角标，今天高亮。',
      f5_h: '窗口分屏',
      f5_p: '一键把任意窗口分到左 / 右半屏、铺满或复原，快捷键可自定义。',
      f6_h: '隐私优先',
      f6_p: '数据是你 iCloud Drive 里的纯 JSON，无账号、无遥测、无服务器。8 语言、明暗主题。',
      f7_h: '本地 AI 音乐',
      f7_p: '基于 Magenta RealTime 2，在 Apple Silicon 上实时生成专注音乐，零订阅、零调用费。',
      f8_h: '本地翻译',
      f8_p: 'HY-MT 模型在 8 种语言间互译，全程本地推理，不碰云、不传数据。',
      ai_title: '真 AI，免密钥、零订阅',
      ai_sub: '生成式音乐与翻译，100% 跑在你的 Mac 上——不登录、不上云、不收费。',
      ai1_h: '本地 AI 音乐 · 轻听',
      ai1_p: 'Magenta RealTime 2 在 Apple Silicon 实时生成专注音乐，选预设或写提示词，音乐源源不断。',
      ai2_h: '本地翻译',
      ai2_p: 'HY-MT 模型在 8 种语言间互译，快捷键 ⌘⇧Y 唤出，纯本地推理，全程不出 App。',
      ai3_h: '隐私优先',
      ai3_p: '无账号、无遥测、无服务器；AI 模型首次使用后完全离线，你的数据只在自己电脑。',
      faq_title: '常见问题',
      faq1_q: '日行收费吗？',
      faq1_a: '完全免费、开源（MIT）。AI 模型在你的 Mac 本地运行，没有任何订阅或调用费。',
      faq2_q: '支持 Intel 芯片的 Mac 吗？',
      faq2_a: '当前提供 Apple Silicon（M 系列）版本。Intel 机型可先从源码自行构建，后续会补发通用版。',
      faq3_q: '我的数据存在哪？',
      faq3_a: '待办与设置是 iCloud Drive 里的纯 JSON；开启 iCloud 时多台 Mac 自动同步，否则存本地 App Support。',
      faq4_q: '第一次打不开怎么办？',
      faq4_a: '应用暂未做苹果公证：第一次请右键 App →「打开」，或到「系统设置 → 隐私与安全性」点「仍要打开」。',
      shots_title: '界面预览',
      shots_sub: '干净、克制、贴合 macOS。',
      dl_h: '立即开始',
      dl_p: '下载后拖入「应用程序」即可。免费、开源。',
      dl_btn: '↓ 下载 {brand} for macOS（Apple Silicon）',
      dl_req: 'macOS 11 Big Sur 或更高 · Apple Silicon (M 系列)',
      dl_note: '<b>首次打开提示：</b>应用暂未做苹果公证，第一次打开请<b>右键点击 App →「打开」</b>，或到「系统设置 → 隐私与安全性」里点「仍要打开」。之后即可正常使用。',
      footer: '{brand} · <a href="https://github.com/polimao/rixing" target="_blank" rel="noopener">GitHub</a> · MIT © 李貌',
    },
    en: {
      lang_name: 'English',
      doc_title: '{brand} · Menu-bar to-dos / calendar / window manager',
      doc_desc: '{brand} — a minimal menu-bar to-do, calendar and window-tiling tool for macOS. Fast, private, free and open source.',
      og_title: '{brand} · macOS menu-bar productivity tool',
      og_desc: 'Minimal to-dos / lunar calendar / window tiling, right in your menu bar. Free and open source.',
      nav_features: 'Features',
      nav_shots: 'Screenshots',
      nav_download: 'Download',
      hero_tag: 'Minimal to-dos · calendar · window tiling, in your menu bar',
      hero_sub: 'Fast, private, free and open source. Summon it with one click, hide it when done — it sits quietly in your macOS menu bar.',
      hero_cta_download: '↓ Free download (.dmg)',
      hero_cta_github: 'View on GitHub',
      hero_meta: 'macOS 11+ · Apple Silicon · ~5 MB installer · MIT licensed',
      feat_title: 'Why {brand}',
      feat_sub: 'Tuck your most-used productivity tools into the menu bar — less clutter, more done.',
      f1_h: 'Native to the menu bar',
      f1_p: 'Two tray icons: to-dos and calendar. Left-click pops a panel right below the icon, right-click opens settings; no Dock space used.',
      f2_h: 'To-dos that flow',
      f2_p: 'Group by category / priority / time, edit inline, toggle status in one click, plus an “Achievements” completion-trend view.',
      f3_h: 'Built-in Pomodoro',
      f3_p: 'Turn any task into a focus timer; the capsule timer can float above full-screen apps.',
      f4_h: 'Lunar calendar',
      f4_p: 'Gregorian + lunar dates, public holidays with rest / work-day badges, and today highlighted.',
      f5_h: 'Window tiling',
      f5_p: 'Snap any window to the left / right half, maximize or restore in one shortcut — fully customizable.',
      f6_h: 'Privacy first',
        f6_p: 'Your data is plain JSON in your iCloud Drive — no account, no telemetry, no servers. 8 languages, light & dark themes.',
        f7_h: 'On-device AI music',
        f7_p: 'Generative focus music via Magenta RealTime 2 on Apple Silicon — zero subscription, zero API fees.',
        f8_h: 'On-device translation',
        f8_p: 'HY-MT translates across 8 languages with fully local inference — no cloud, no data leaving your Mac.',
        ai_title: 'Real AI — no keys, no subscription',
        ai_sub: 'Generative music and translation, 100% on your Mac: no login, no cloud, no fees.',
        ai1_h: 'On-device AI music · 轻听',
        ai1_p: 'Magenta RealTime 2 streams focus music on Apple Silicon in real time — pick a preset or write a prompt.',
        ai2_h: 'On-device translation',
        ai2_p: 'HY-MT translates 8 languages with a ⌘⇧Y shortcut; pure local inference, nothing leaves the app.',
        ai3_h: 'Privacy first',
        ai3_p: 'No account, no telemetry, no servers. After first use the AI models run fully offline — your data stays on your Mac.',
        faq_title: 'FAQ',
        faq1_q: 'Does RiXing cost anything?',
        faq1_a: 'Completely free and open source (MIT). The AI models run locally on your Mac, so there are no subscriptions or API fees.',
        faq2_q: 'Does it support Intel Macs?',
        faq2_a: 'We currently ship an Apple Silicon (M-series) build. Intel users can build from source for now; a universal build is planned.',
        faq3_q: 'Where is my data stored?',
        faq3_a: 'To-dos and settings are plain JSON in your iCloud Drive (auto-synced across Macs when iCloud is on), otherwise in local App Support.',
        faq4_q: 'It won’t open the first time?',
        faq4_a: 'The app isn’t notarized yet: the first time, right-click the app → “Open”, or go to “System Settings → Privacy & Security” and click “Open Anyway”.',
        shots_title: 'A look inside',
      shots_sub: 'Clean, restrained, at home on macOS.',
      dl_h: 'Get started',
      dl_p: 'Download, then drag it into Applications. Free and open source.',
      dl_btn: '↓ Download {brand} for macOS (Apple Silicon)',
      dl_req: 'macOS 11 Big Sur or later · Apple Silicon (M-series)',
      dl_note: '<b>First launch:</b> the app isn’t notarized yet, so the first time, <b>right-click the app → “Open”</b>, or go to “System Settings → Privacy & Security” and click “Open Anyway”. After that it opens normally.',
      footer: '{brand} · <a href="https://github.com/polimao/rixing" target="_blank" rel="noopener">GitHub</a> · MIT © 李貌',
    },
    ja: {
      lang_name: '日本語',
      doc_title: '{brand} · メニューバー常駐の ToDo / カレンダー / ウィンドウ管理',
      doc_desc: '{brand} —— macOS のメニューバーに常駐する、シンプルな ToDo・カレンダー・ウィンドウ分割ツール。軽快・プライベート・オープンソースで無料。',
      og_title: '{brand} · macOS メニューバーの効率化ツール',
      og_desc: 'シンプルな ToDo / 旧暦カレンダー / ウィンドウ分割をメニューバーに。無料・オープンソース。',
      nav_features: '機能',
      nav_shots: 'スクリーンショット',
      nav_download: 'ダウンロード',
      hero_tag: 'メニューバー常駐のシンプルな ToDo・カレンダー・ウィンドウ分割',
      hero_sub: '軽快・プライベート・オープンソースで無料。必要なときにワンクリックで呼び出し、使い終えれば隠れて、macOS のメニューバーに静かに常駐します。',
      hero_cta_download: '↓ 無料ダウンロード（.dmg）',
      hero_cta_github: 'GitHub で見る',
      hero_meta: 'macOS 11+ · Apple Silicon · インストーラー約 5 MB · MIT ライセンス',
      feat_title: '{brand} を選ぶ理由',
      feat_sub: 'よく使う効率化ツールをメニューバーへ。場所を取らず、作業に集中。',
      f1_h: 'メニューバーにネイティブ',
      f1_p: '2 つのトレイアイコン：ToDo とカレンダー。左クリックでアイコン下にパネル、右クリックで設定。Dock を占有しません。',
      f2_h: '使いやすい ToDo',
      f2_p: 'カテゴリ / 優先度 / 時間でグループ化、インライン編集、ワンクリックで状態切替、達成トレンドの「成果」ビューも。',
      f3_h: 'ポモドーロ内蔵',
      f3_p: 'どんなタスクも集中タイマーに。カプセル型タイマーは全画面アプリの上にも浮かべられます。',
      f4_h: '旧暦カレンダー',
      f4_p: '新暦＋旧暦、祝日と「休 / 出」バッジ、今日をハイライト。',
      f5_h: 'ウィンドウ分割',
      f5_p: '任意のウィンドウを左 / 右半分、最大化、復元へワンショートカット。キーは自由にカスタマイズ。',
      f6_h: 'プライバシー優先',
      f6_p: 'データは iCloud Drive 内のプレーンな JSON。アカウント・テレメトリ・サーバーなし。8 言語、ライト／ダークテーマ対応。',
      shots_title: '画面プレビュー',
      shots_sub: 'クリーンで控えめ、macOS になじむデザイン。',
      dl_h: '今すぐ始める',
      dl_p: 'ダウンロードして「アプリケーション」へドラッグするだけ。無料・オープンソース。',
      dl_btn: '↓ {brand} for macOS をダウンロード（Apple Silicon）',
      dl_req: 'macOS 11 Big Sur 以降 · Apple Silicon（M シリーズ）',
      dl_note: '<b>初回起動について：</b>このアプリはまだ公証されていません。初回は <b>アプリを右クリック →「開く」</b>、または「システム設定 → プライバシーとセキュリティ」で「このまま開く」を選んでください。以降は通常どおり起動します。',
      footer: '{brand} · <a href="https://github.com/polimao/rixing" target="_blank" rel="noopener">GitHub</a> · MIT © 李貌',
    },
    ko: {
      lang_name: '한국어',
      doc_title: '{brand} · 메뉴 막대 상주 할 일 / 달력 / 창 관리',
      doc_desc: '{brand} —— macOS 메뉴 막대에 상주하는 미니멀 할 일·달력·창 분할 도구. 가볍고 사적이며 오픈 소스 무료.',
      og_title: '{brand} · macOS 메뉴 막대 생산성 도구',
      og_desc: '미니멀 할 일 / 음력 달력 / 창 분할을 메뉴 막대에서. 무료 오픈 소스.',
      nav_features: '기능',
      nav_shots: '스크린샷',
      nav_download: '다운로드',
      hero_tag: '메뉴 막대에 상주하는 미니멀 할 일 · 달력 · 창 분할',
      hero_sub: '가볍고 사적이며 오픈 소스 무료. 필요할 때 한 번에 불러오고, 끝나면 숨겨져 macOS 메뉴 막대에 조용히 머뭅니다.',
      hero_cta_download: '↓ 무료 다운로드 (.dmg)',
      hero_cta_github: 'GitHub에서 보기',
      hero_meta: 'macOS 11+ · Apple Silicon · 설치 파일 약 5 MB · MIT 라이선스',
      feat_title: '{brand}를 선택하는 이유',
      feat_sub: '자주 쓰는 생산성 도구를 메뉴 막대로. 자리는 덜 차지하고 일은 더 많이.',
      f1_h: '메뉴 막대 네이티브',
      f1_p: '트레이 아이콘 두 개: 할 일과 달력. 좌클릭하면 아이콘 아래로 패널, 우클릭하면 설정. Dock을 차지하지 않습니다.',
      f2_h: '손에 익는 할 일',
      f2_p: '분류 / 우선순위 / 시간으로 그룹화, 인라인 편집, 한 번에 상태 전환, 완료 추세 ‘성취’ 뷰까지.',
      f3_h: '내장 뽀모도로',
      f3_p: '어떤 작업이든 집중 타이머로. 캡슐 타이머는 전체 화면 앱 위에도 떠 있을 수 있습니다.',
      f4_h: '음력 달력',
      f4_p: '양력 + 음력, 공휴일과 ‘휴 / 근’ 배지, 오늘 강조.',
      f5_h: '창 분할',
      f5_p: '어떤 창이든 왼쪽 / 오른쪽 절반, 최대화, 복원을 단축키 하나로. 키는 자유롭게 설정.',
      f6_h: '프라이버시 우선',
      f6_p: '데이터는 iCloud Drive의 순수 JSON. 계정·텔레메트리·서버 없음. 8개 언어, 라이트/다크 테마.',
      shots_title: '화면 미리보기',
      shots_sub: '깔끔하고 절제된, macOS에 어울리는 디자인.',
      dl_h: '지금 시작하기',
      dl_p: '다운로드 후 ‘응용 프로그램’으로 끌어다 놓으면 끝. 무료·오픈 소스.',
      dl_btn: '↓ macOS용 {brand} 다운로드 (Apple Silicon)',
      dl_req: 'macOS 11 Big Sur 이상 · Apple Silicon (M 시리즈)',
      dl_note: '<b>첫 실행 안내:</b> 아직 공증되지 않은 앱입니다. 처음에는 <b>앱을 우클릭 → ‘열기’</b> 하거나 ‘시스템 설정 → 개인정보 보호 및 보안’에서 ‘그래도 열기’를 누르세요. 이후에는 정상적으로 열립니다.',
      footer: '{brand} · <a href="https://github.com/polimao/rixing" target="_blank" rel="noopener">GitHub</a> · MIT © 李貌',
    },
    es: {
      lang_name: 'Español',
      doc_title: '{brand} · Tareas / calendario / gestor de ventanas en la barra de menús',
      doc_desc: '{brand} —— una herramienta minimalista de tareas, calendario y división de ventanas que vive en la barra de menús de macOS. Ligera, privada, gratuita y de código abierto.',
      og_title: '{brand} · Herramienta de productividad para la barra de menús de macOS',
      og_desc: 'Tareas minimalistas / calendario lunar / división de ventanas, en tu barra de menús. Gratis y de código abierto.',
      nav_features: 'Funciones',
      nav_shots: 'Capturas',
      nav_download: 'Descargar',
      hero_tag: 'Tareas · calendario · división de ventanas, en tu barra de menús',
      hero_sub: 'Ligera, privada, gratuita y de código abierto. Invócala con un clic y ocúltala al terminar: vive tranquila en tu barra de menús de macOS.',
      hero_cta_download: '↓ Descarga gratis (.dmg)',
      hero_cta_github: 'Ver en GitHub',
      hero_meta: 'macOS 11+ · Apple Silicon · instalador de ~5 MB · licencia MIT',
      feat_title: 'Por qué {brand}',
      feat_sub: 'Guarda tus herramientas de productividad en la barra de menús: menos estorbo, más hecho.',
      f1_h: 'Nativa en la barra de menús',
      f1_p: 'Dos iconos: tareas y calendario. Clic izquierdo abre un panel bajo el icono, clic derecho abre los ajustes; sin ocupar el Dock.',
      f2_h: 'Tareas con fluidez',
      f2_p: 'Agrupa por categoría / prioridad / tiempo, edición en línea, cambia de estado con un clic y una vista de «Logros» con la tendencia de avance.',
      f3_h: 'Pomodoro integrado',
      f3_p: 'Convierte cualquier tarea en un temporizador de enfoque; la cápsula puede flotar sobre apps a pantalla completa.',
      f4_h: 'Calendario lunar',
      f4_p: 'Fechas gregorianas + lunares, festivos con distintivos de descanso / trabajo y el día de hoy resaltado.',
      f5_h: 'División de ventanas',
      f5_p: 'Coloca cualquier ventana en la mitad izquierda / derecha, maximízala o restáurala con un atajo; totalmente personalizable.',
      f6_h: 'Privacidad primero',
      f6_p: 'Tus datos son JSON puro en tu iCloud Drive: sin cuenta, sin telemetría, sin servidores. 8 idiomas, temas claro y oscuro.',
      shots_title: 'Un vistazo',
      shots_sub: 'Limpia, sobria y a tono con macOS.',
      dl_h: 'Empieza ya',
      dl_p: 'Descárgala y arrástrala a Aplicaciones. Gratis y de código abierto.',
      dl_btn: '↓ Descargar {brand} para macOS (Apple Silicon)',
      dl_req: 'macOS 11 Big Sur o posterior · Apple Silicon (serie M)',
      dl_note: '<b>Primera apertura:</b> la app aún no está notarizada; la primera vez, <b>haz clic derecho en la app → «Abrir»</b>, o ve a «Ajustes del Sistema → Privacidad y seguridad» y pulsa «Abrir de todos modos». Después se abrirá con normalidad.',
      footer: '{brand} · <a href="https://github.com/polimao/rixing" target="_blank" rel="noopener">GitHub</a> · MIT © 李貌',
    },
    fr: {
      lang_name: 'Français',
      doc_title: '{brand} · Tâches / calendrier / gestion de fenêtres dans la barre des menus',
      doc_desc: '{brand} —— un outil minimaliste de tâches, calendrier et partage de fenêtres logé dans la barre des menus de macOS. Rapide, privé, gratuit et open source.',
      og_title: '{brand} · Outil de productivité pour la barre des menus de macOS',
      og_desc: 'Tâches minimalistes / calendrier lunaire / partage de fenêtres, dans votre barre des menus. Gratuit et open source.',
      nav_features: 'Fonctionnalités',
      nav_shots: 'Captures',
      nav_download: 'Télécharger',
      hero_tag: 'Tâches · calendrier · partage de fenêtres, dans la barre des menus',
      hero_sub: 'Rapide, privé, gratuit et open source. Appelez-le d’un clic, masquez-le une fois fini : il reste discret dans votre barre des menus macOS.',
      hero_cta_download: '↓ Téléchargement gratuit (.dmg)',
      hero_cta_github: 'Voir sur GitHub',
      hero_meta: 'macOS 11+ · Apple Silicon · installateur ~5 Mo · licence MIT',
      feat_title: 'Pourquoi {brand}',
      feat_sub: 'Rangez vos outils de productivité dans la barre des menus : moins d’encombrement, plus d’efficacité.',
      f1_h: 'Native dans la barre des menus',
      f1_p: 'Deux icônes : tâches et calendrier. Clic gauche pour un panneau sous l’icône, clic droit pour les réglages ; sans occuper le Dock.',
      f2_h: 'Des tâches fluides',
      f2_p: 'Regroupez par catégorie / priorité / date, édition en ligne, changement d’état en un clic, et une vue « Réussites » de la tendance d’achèvement.',
      f3_h: 'Pomodoro intégré',
      f3_p: 'Transformez n’importe quelle tâche en minuteur de concentration ; la capsule peut flotter au-dessus des apps en plein écran.',
      f4_h: 'Calendrier lunaire',
      f4_p: 'Dates grégoriennes + lunaires, jours fériés avec badges repos / travail, et aujourd’hui mis en évidence.',
      f5_h: 'Partage de fenêtres',
      f5_p: 'Placez n’importe quelle fenêtre sur la moitié gauche / droite, maximisez ou restaurez d’un raccourci, entièrement personnalisable.',
      f6_h: 'Confidentialité d’abord',
      f6_p: 'Vos données sont du JSON brut dans votre iCloud Drive : sans compte, sans télémétrie, sans serveur. 8 langues, thèmes clair et sombre.',
      shots_title: 'Aperçu',
      shots_sub: 'Épurée, sobre, parfaitement à sa place sur macOS.',
      dl_h: 'Commencer',
      dl_p: 'Téléchargez, puis glissez-le dans Applications. Gratuit et open source.',
      dl_btn: '↓ Télécharger {brand} pour macOS (Apple Silicon)',
      dl_req: 'macOS 11 Big Sur ou ultérieur · Apple Silicon (série M)',
      dl_note: '<b>Première ouverture :</b> l’app n’est pas encore notariée ; la première fois, <b>faites un clic droit sur l’app → « Ouvrir »</b>, ou allez dans « Réglages Système → Confidentialité et sécurité » et cliquez sur « Ouvrir quand même ». Ensuite, elle s’ouvrira normalement.',
      footer: '{brand} · <a href="https://github.com/polimao/rixing" target="_blank" rel="noopener">GitHub</a> · MIT © 李貌',
    },
    de: {
      lang_name: 'Deutsch',
      doc_title: '{brand} · To-dos / Kalender / Fensterverwaltung in der Menüleiste',
      doc_desc: '{brand} —— ein minimalistisches To-do-, Kalender- und Fenster-Tiling-Tool in der macOS-Menüleiste. Schnell, privat, kostenlos und quelloffen.',
      og_title: '{brand} · Produktivitätstool für die macOS-Menüleiste',
      og_desc: 'Minimalistische To-dos / Mondkalender / Fenster-Tiling, direkt in der Menüleiste. Kostenlos und quelloffen.',
      nav_features: 'Funktionen',
      nav_shots: 'Screenshots',
      nav_download: 'Herunterladen',
      hero_tag: 'To-dos · Kalender · Fenster-Tiling, in der Menüleiste',
      hero_sub: 'Schnell, privat, kostenlos und quelloffen. Per Klick aufrufen, nach Gebrauch ausblenden – es bleibt ruhig in deiner macOS-Menüleiste.',
      hero_cta_download: '↓ Kostenlos laden (.dmg)',
      hero_cta_github: 'Auf GitHub ansehen',
      hero_meta: 'macOS 11+ · Apple Silicon · ~5 MB Installer · MIT-Lizenz',
      feat_title: 'Warum {brand}',
      feat_sub: 'Verstaue deine häufigsten Produktivitätstools in der Menüleiste – weniger Ballast, mehr erledigt.',
      f1_h: 'Nativ in der Menüleiste',
      f1_p: 'Zwei Symbole: To-dos und Kalender. Linksklick öffnet ein Panel unter dem Symbol, Rechtsklick die Einstellungen; ohne Dock-Platz.',
      f2_h: 'To-dos, die flutschen',
      f2_p: 'Gruppieren nach Kategorie / Priorität / Zeit, Inline-Bearbeitung, Status per Klick wechseln, plus eine „Erfolge“-Ansicht des Fortschritts.',
      f3_h: 'Integrierter Pomodoro',
      f3_p: 'Mach aus jeder Aufgabe einen Fokus-Timer; der Kapsel-Timer kann über Vollbild-Apps schweben.',
      f4_h: 'Mondkalender',
      f4_p: 'Gregorianische + Mond-Daten, Feiertage mit Frei- / Arbeitstag-Badges und hervorgehobenem Heute.',
      f5_h: 'Fenster-Tiling',
      f5_p: 'Jedes Fenster per Kurzbefehl auf die linke / rechte Hälfte legen, maximieren oder wiederherstellen – frei anpassbar.',
      f6_h: 'Privatsphäre zuerst',
      f6_p: 'Deine Daten sind reines JSON in deinem iCloud Drive – kein Konto, keine Telemetrie, keine Server. 8 Sprachen, helles & dunkles Design.',
      shots_title: 'Ein Blick hinein',
      shots_sub: 'Aufgeräumt, zurückhaltend, ganz im macOS-Stil.',
      dl_h: 'Loslegen',
      dl_p: 'Herunterladen und in „Programme“ ziehen. Kostenlos und quelloffen.',
      dl_btn: '↓ {brand} für macOS laden (Apple Silicon)',
      dl_req: 'macOS 11 Big Sur oder neuer · Apple Silicon (M-Serie)',
      dl_note: '<b>Erster Start:</b> Die App ist noch nicht notarisiert. Beim ersten Mal <b>Rechtsklick auf die App → „Öffnen“</b>, oder unter „Systemeinstellungen → Datenschutz & Sicherheit“ auf „Trotzdem öffnen“ klicken. Danach startet sie normal.',
      footer: '{brand} · <a href="https://github.com/polimao/rixing" target="_blank" rel="noopener">GitHub</a> · MIT © 李貌',
    },
    ru: {
      lang_name: 'Русский',
      doc_title: '{brand} · Задачи / календарь / управление окнами в строке меню',
      doc_desc: '{brand} —— минималистичный инструмент для задач, календаря и разделения окон в строке меню macOS. Быстрый, приватный, бесплатный и с открытым исходным кодом.',
      og_title: '{brand} · Инструмент продуктивности для строки меню macOS',
      og_desc: 'Минималистичные задачи / лунный календарь / разделение окон прямо в строке меню. Бесплатно и с открытым кодом.',
      nav_features: 'Возможности',
      nav_shots: 'Скриншоты',
      nav_download: 'Скачать',
      hero_tag: 'Задачи · календарь · разделение окон в строке меню',
      hero_sub: 'Быстрый, приватный, бесплатный и открытый. Вызывается одним кликом и прячется после использования — тихо живёт в строке меню macOS.',
      hero_cta_download: '↓ Скачать бесплатно (.dmg)',
      hero_cta_github: 'Открыть на GitHub',
      hero_meta: 'macOS 11+ · Apple Silicon · установщик ~5 МБ · лицензия MIT',
      feat_title: 'Почему {brand}',
      feat_sub: 'Спрячьте часто используемые инструменты в строку меню — меньше беспорядка, больше дела.',
      f1_h: 'Родной для строки меню',
      f1_p: 'Два значка: задачи и календарь. Левый клик открывает панель под значком, правый — настройки; не занимает Dock.',
      f2_h: 'Удобные задачи',
      f2_p: 'Группировка по категории / приоритету / времени, редактирование на месте, смена статуса одним кликом и вид «Достижения» с трендом выполнения.',
      f3_h: 'Встроенный помодоро',
      f3_p: 'Превратите любую задачу в таймер фокуса; капсула-таймер может висеть поверх полноэкранных приложений.',
      f4_h: 'Лунный календарь',
      f4_p: 'Григорианские + лунные даты, праздники со значками выходной / рабочий и подсветкой сегодняшнего дня.',
      f5_h: 'Разделение окон',
      f5_p: 'Одной комбинацией разместите окно в левой / правой половине, разверните или восстановите — полностью настраивается.',
      f6_h: 'Приватность прежде всего',
      f6_p: 'Ваши данные — обычный JSON в вашем iCloud Drive: без аккаунта, без телеметрии, без серверов. 8 языков, светлая и тёмная темы.',
      shots_title: 'Взгляд изнутри',
      shots_sub: 'Чисто, сдержанно, в духе macOS.',
      dl_h: 'Начать',
      dl_p: 'Скачайте и перетащите в «Программы». Бесплатно и с открытым кодом.',
      dl_btn: '↓ Скачать {brand} для macOS (Apple Silicon)',
      dl_req: 'macOS 11 Big Sur или новее · Apple Silicon (серия M)',
      dl_note: '<b>Первый запуск:</b> приложение пока не нотаризовано. В первый раз <b>щёлкните по приложению правой кнопкой → «Открыть»</b>, или зайдите в «Системные настройки → Конфиденциальность и безопасность» и нажмите «Всё равно открыть». Дальше оно будет открываться как обычно.',
      footer: '{brand} · <a href="https://github.com/polimao/rixing" target="_blank" rel="noopener">GitHub</a> · MIT © 李貌',
    },
  };

  const SUPPORTED = Object.keys(DICT);

  // 品牌名：中文版「日行」，其余语言（国际版）「RiXing」
  function brandFor(lang) { return lang === 'zh-CN' ? '日行' : 'RiXing'; }

  // 下载入口：统一指向最新 Release 页面，避免具体 dmg 文件名不匹配导致 404。
  // 确认资产名后（如 RiXing_1.1.1_aarch64.dmg）可改回 latest/download/<文件名> 直链。
  const DOWNLOAD = {
    'zh-CN': 'https://github.com/polimao/rixing/releases/latest',
    intl: 'https://github.com/polimao/rixing/releases/latest',
  };
  function downloadFor(lang) { return lang === 'zh-CN' ? DOWNLOAD['zh-CN'] : DOWNLOAD.intl; }

  // 任意语言码归一化到受支持的 8 种之一
  function normalize(code) {
    if (!code) return 'en';
    if (DICT[code]) return code;
    const low = String(code).toLowerCase();
    if (low.startsWith('zh')) return 'zh-CN';
    const base = low.split('-')[0];
    return DICT[base] ? base : 'en';
  }

  // 中国大陆相关时区（含港澳）：命中即判为「在中国」→ 中文版
  const CHINA_TZ = ['Asia/Shanghai', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Macau', 'Asia/Hong_Kong'];

  function detectLang() {
    // 1) 用户手动选择优先并记忆
    try {
      const saved = localStorage.getItem('site.lang');
      if (saved && DICT[saved]) return saved;
    } catch (e) { /* ignore */ }
    // 2) 在中国（按时区）→ 简体中文
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
    if (CHINA_TZ.includes(tz)) return 'zh-CN';
    // 3) 否则按浏览器语言（回退英文）
    return normalize(navigator.language || (navigator.languages && navigator.languages[0]) || 'en');
  }

  function t(lang, key) {
    const d = DICT[lang] || DICT.en;
    const v = key in d ? d[key] : (DICT.en[key] ?? key);
    return String(v).replace(/\{brand\}/g, brandFor(lang));
  }

  function setMeta(attr, name, content) {
    const el = document.querySelector(`meta[${attr}="${name}"]`);
    if (el) el.setAttribute('content', content);
  }

  function apply(lang) {
    lang = DICT[lang] ? lang : 'en';
    const brand = brandFor(lang);
    document.documentElement.setAttribute('lang', lang);

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(lang, el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(lang, el.getAttribute('data-i18n-html'));
    });
    // 品牌名文本节点 / 图片 alt
    document.querySelectorAll('[data-brand]').forEach((el) => { el.textContent = brand; });
    document.querySelectorAll('[data-brand-alt]').forEach((el) => { el.setAttribute('alt', brand); });
    // 下载链接（中文包 / 国际包）
    document.querySelectorAll('[data-download]').forEach((el) => { el.setAttribute('href', downloadFor(lang)); });

    // 文档标题与社交分享 meta
    document.title = t(lang, 'doc_title');
    setMeta('name', 'description', t(lang, 'doc_desc'));
    setMeta('property', 'og:title', t(lang, 'og_title'));
    setMeta('property', 'og:description', t(lang, 'og_desc'));

    const sel = document.getElementById('lang-select');
    if (sel) sel.value = lang;
  }

  function buildSwitcher() {
    const sel = document.getElementById('lang-select');
    if (!sel) return;
    sel.innerHTML = SUPPORTED.map((code) => `<option value="${code}">${DICT[code].lang_name}</option>`).join('');
    sel.addEventListener('change', () => {
      try { localStorage.setItem('site.lang', sel.value); } catch (e) { /* ignore */ }
      apply(sel.value);
    });
  }

  function init() {
    buildSwitcher();
    apply(detectLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
