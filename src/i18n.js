// 轻量 i18n：8 种语言。t(key) 取串，applyI18n(root) 翻译 [data-i18n] / [data-i18n-placeholder] / [data-i18n-title]。
// 语言码：zh-CN / en / ja / ko / es / fr / de / ru
(function () {
  const DICT = {
    'zh-CN': {
      lang_name: '简体中文',
      // settings
      settings: '设置',
      general: '通用',
      appearance: '外观',
      autostart: '开机自启动',
      language: '语言',
      theme: '主题',
      theme_light: '亮色',
      theme_dark: '暗色',
      theme_system: '随系统',
      language_system: '跟随系统',
      // todos chrome
      app_title: '待办',
      sort: '排序',
      sort_category: '按分类',
      sort_priority: '按优先级',
      sort_time: '按时间',
      tip_pending: '待办',
      tip_achievement: '成就',
      achievement: '成就',
      undo: '撤销',
      input_placeholder: '输入...',
      more_actions: '更多操作',
      no_completed: '暂无已完成任务，继续努力！',
      // calendar chrome
      today: '今天',
      week: ['日', '一', '二', '三', '四', '五', '六'],
    },
    en: {
      lang_name: 'English',
      settings: 'Settings', general: 'General', appearance: 'Appearance',
      autostart: 'Launch at login', language: 'Language', theme: 'Theme',
      theme_light: 'Light', theme_dark: 'Dark', theme_system: 'System',
      language_system: 'System default',
      app_title: 'Todos', sort: 'Sort', sort_category: 'By category',
      sort_priority: 'By priority', sort_time: 'By time',
      tip_pending: 'To-do', tip_achievement: 'Achievements', achievement: 'Achievements',
      undo: 'Undo', input_placeholder: 'Type', more_actions: 'More',
      no_completed: 'No completed tasks yet — keep going!',
      today: 'Today', week: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
    ja: {
      lang_name: '日本語',
      settings: '設定', general: '一般', appearance: '外観',
      autostart: 'ログイン時に起動', language: '言語', theme: 'テーマ',
      theme_light: 'ライト', theme_dark: 'ダーク', theme_system: 'システム',
      language_system: 'システムに合わせる',
      app_title: 'やること', sort: '並び替え', sort_category: 'カテゴリ順',
      sort_priority: '優先度順', sort_time: '時間順',
      tip_pending: '未完了', tip_achievement: '達成', achievement: '達成',
      undo: '元に戻す', input_placeholder: '入力', more_actions: 'その他',
      no_completed: '完了したタスクはまだありません。頑張って！',
      today: '今日', week: ['日', '月', '火', '水', '木', '金', '土'],
    },
    ko: {
      lang_name: '한국어',
      settings: '설정', general: '일반', appearance: '모양',
      autostart: '로그인 시 실행', language: '언어', theme: '테마',
      theme_light: '라이트', theme_dark: '다크', theme_system: '시스템',
      language_system: '시스템 설정',
      app_title: '할 일', sort: '정렬', sort_category: '카테고리순',
      sort_priority: '우선순위순', sort_time: '시간순',
      tip_pending: '할 일', tip_achievement: '성취', achievement: '성취',
      undo: '실행 취소', input_placeholder: '입력', more_actions: '더 보기',
      no_completed: '완료된 작업이 없습니다 — 계속 힘내세요!',
      today: '오늘', week: ['일', '월', '화', '수', '목', '금', '토'],
    },
    es: {
      lang_name: 'Español',
      settings: 'Ajustes', general: 'General', appearance: 'Apariencia',
      autostart: 'Abrir al iniciar sesión', language: 'Idioma', theme: 'Tema',
      theme_light: 'Claro', theme_dark: 'Oscuro', theme_system: 'Sistema',
      language_system: 'Predeterminado del sistema',
      app_title: 'Tareas', sort: 'Ordenar', sort_category: 'Por categoría',
      sort_priority: 'Por prioridad', sort_time: 'Por fecha',
      tip_pending: 'Pendiente', tip_achievement: 'Logros', achievement: 'Logros',
      undo: 'Deshacer', input_placeholder: 'Escribe', more_actions: 'Más',
      no_completed: 'Aún no hay tareas completadas, ¡sigue así!',
      today: 'Hoy', week: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    },
    fr: {
      lang_name: 'Français',
      settings: 'Réglages', general: 'Général', appearance: 'Apparence',
      autostart: 'Ouvrir à la connexion', language: 'Langue', theme: 'Thème',
      theme_light: 'Clair', theme_dark: 'Sombre', theme_system: 'Système',
      language_system: 'Réglage du système',
      app_title: 'Tâches', sort: 'Trier', sort_category: 'Par catégorie',
      sort_priority: 'Par priorité', sort_time: 'Par date',
      tip_pending: 'À faire', tip_achievement: 'Réussites', achievement: 'Réussites',
      undo: 'Annuler', input_placeholder: 'Saisir', more_actions: 'Plus',
      no_completed: 'Aucune tâche terminée pour l’instant — continuez !',
      today: 'Aujourd’hui', week: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
    },
    de: {
      lang_name: 'Deutsch',
      settings: 'Einstellungen', general: 'Allgemein', appearance: 'Darstellung',
      autostart: 'Beim Anmelden öffnen', language: 'Sprache', theme: 'Design',
      theme_light: 'Hell', theme_dark: 'Dunkel', theme_system: 'System',
      language_system: 'Systemstandard',
      app_title: 'Aufgaben', sort: 'Sortieren', sort_category: 'Nach Kategorie',
      sort_priority: 'Nach Priorität', sort_time: 'Nach Zeit',
      tip_pending: 'Offen', tip_achievement: 'Erfolge', achievement: 'Erfolge',
      undo: 'Rückgängig', input_placeholder: 'Eingeben', more_actions: 'Mehr',
      no_completed: 'Noch keine erledigten Aufgaben — weiter so!',
      today: 'Heute', week: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    },
    ru: {
      lang_name: 'Русский',
      settings: 'Настройки', general: 'Общие', appearance: 'Оформление',
      autostart: 'Запуск при входе', language: 'Язык', theme: 'Тема',
      theme_light: 'Светлая', theme_dark: 'Тёмная', theme_system: 'Системная',
      language_system: 'Как в системе',
      app_title: 'Задачи', sort: 'Сортировка', sort_category: 'По категории',
      sort_priority: 'По приоритету', sort_time: 'По времени',
      tip_pending: 'Задачи', tip_achievement: 'Достижения', achievement: 'Достижения',
      undo: 'Отменить', input_placeholder: 'Введите', more_actions: 'Ещё',
      no_completed: 'Пока нет выполненных задач — продолжайте!',
      today: 'Сегодня', week: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    },
  };

  // 码放（窗口整理）相关文案，合并进各语言词典
  const TIDY = {
    'zh-CN': { tidy: '窗口分屏', tidy_enable: '启用窗口分屏', tidy_gap: '窗口边距 (px)', tidy_left: '左半屏', tidy_right: '右半屏', tidy_max: '最大化', tidy_restore: '复原', tidy_perm: '需开启「辅助功能」权限', tidy_grant: '去授权', tidy_record: '按下快捷键', tidy_none: '未设置', tidy_dup: '已被占用' },
    en: { tidy: 'Split screen', tidy_enable: 'Enable split screen', tidy_gap: 'Window gap (px)', tidy_left: 'Left half', tidy_right: 'Right half', tidy_max: 'Maximize', tidy_restore: 'Restore', tidy_perm: 'Requires Accessibility permission', tidy_grant: 'Grant', tidy_record: 'Press keys', tidy_none: 'Unset', tidy_dup: 'Already in use' },
    ja: { tidy: '画面分割', tidy_enable: '画面分割を有効化', tidy_gap: '余白 (px)', tidy_left: '左半分', tidy_right: '右半分', tidy_max: '最大化', tidy_restore: '元に戻す', tidy_perm: 'アクセシビリティ権限が必要', tidy_grant: '許可', tidy_record: 'キーを押す', tidy_none: '未設定', tidy_dup: '使用中' },
    ko: { tidy: '화면 분할', tidy_enable: '화면 분할 사용', tidy_gap: '여백 (px)', tidy_left: '왼쪽 절반', tidy_right: '오른쪽 절반', tidy_max: '최대화', tidy_restore: '복원', tidy_perm: '손쉬운 사용 권한 필요', tidy_grant: '허용', tidy_record: '키 입력', tidy_none: '미설정', tidy_dup: '이미 사용 중' },
    es: { tidy: 'Dividir pantalla', tidy_enable: 'Activar división de pantalla', tidy_gap: 'Margen (px)', tidy_left: 'Mitad izquierda', tidy_right: 'Mitad derecha', tidy_max: 'Maximizar', tidy_restore: 'Restaurar', tidy_perm: 'Requiere permiso de Accesibilidad', tidy_grant: 'Conceder', tidy_record: 'Pulsa teclas', tidy_none: 'Sin asignar', tidy_dup: 'Ya en uso' },
    fr: { tidy: 'Partage d’écran', tidy_enable: 'Activer le partage d’écran', tidy_gap: 'Marge (px)', tidy_left: 'Moitié gauche', tidy_right: 'Moitié droite', tidy_max: 'Maximiser', tidy_restore: 'Restaurer', tidy_perm: 'Nécessite l’autorisation Accessibilité', tidy_grant: 'Autoriser', tidy_record: 'Tapez les touches', tidy_none: 'Non défini', tidy_dup: 'Déjà utilisé' },
    de: { tidy: 'Bildschirm teilen', tidy_enable: 'Bildschirm teilen aktivieren', tidy_gap: 'Rand (px)', tidy_left: 'Linke Hälfte', tidy_right: 'Rechte Hälfte', tidy_max: 'Maximieren', tidy_restore: 'Wiederherstellen', tidy_perm: 'Benötigt Bedienungshilfen-Recht', tidy_grant: 'Erlauben', tidy_record: 'Tasten drücken', tidy_none: 'Nicht gesetzt', tidy_dup: 'Bereits belegt' },
    ru: { tidy: 'Разделение экрана', tidy_enable: 'Включить разделение экрана', tidy_gap: 'Отступ (px)', tidy_left: 'Левая половина', tidy_right: 'Правая половина', tidy_max: 'Развернуть', tidy_restore: 'Восстановить', tidy_perm: 'Нужно разрешение «Универсальный доступ»', tidy_grant: 'Разрешить', tidy_record: 'Нажмите клавиши', tidy_none: 'Не задано', tidy_dup: 'Уже занято' },
  };
  for (const k in DICT) Object.assign(DICT[k], TIDY[k] || {});

  // 待办行的“更多操作”菜单文案
  const MENU = {
    'zh-CN': { focus: '专注', delete: '删除', deleted: '已删除任务' },
    en: { focus: 'Focus', delete: 'Delete', deleted: 'Task deleted' },
    ja: { focus: '集中', delete: '削除', deleted: 'タスクを削除しました' },
    ko: { focus: '집중', delete: '삭제', deleted: '작업이 삭제됨' },
    es: { focus: 'Enfocar', delete: 'Eliminar', deleted: 'Tarea eliminada' },
    fr: { focus: 'Focus', delete: 'Supprimer', deleted: 'Tâche supprimée' },
    de: { focus: 'Fokus', delete: 'Löschen', deleted: 'Aufgabe gelöscht' },
    ru: { focus: 'Фокус', delete: 'Удалить', deleted: 'Задача удалена' },
  };
  for (const k in DICT) Object.assign(DICT[k], MENU[k] || {});

  // 通用：显示待办统计数字
  const COUNT = {
    'zh-CN': { show_count: '显示待办统计' },
    en: { show_count: 'Show task count' },
    ja: { show_count: 'タスク数を表示' },
    ko: { show_count: '작업 수 표시' },
    es: { show_count: 'Mostrar recuento' },
    fr: { show_count: 'Afficher le nombre' },
    de: { show_count: 'Anzahl anzeigen' },
    ru: { show_count: 'Показывать счётчик' },
  };
  for (const k in DICT) Object.assign(DICT[k], COUNT[k] || {});

  // 待办窗口动态文案：问候语 / 分组 / 完成时间 / Toast
  const CHROME = {
    'zh-CN': { greet_morning: '早安！今天有什么计划？', greet_noon: '中午好！记得好好吃饭休息哦。', greet_afternoon: '下午好！继续加油！', greet_evening: '晚上好！今天辛苦了！', greet_night: '夜深了，早点休息吧。', all_todos: '所有待办', completed_at: '完成于: ', toast_completed: '已完成任务', toast_focus_done: '专注完成！休息一下吧。' },
    en: { greet_morning: 'Good morning! What’s the plan today?', greet_noon: 'Good noon! Remember to eat and rest.', greet_afternoon: 'Good afternoon! Keep it up!', greet_evening: 'Good evening! Great work today!', greet_night: 'It’s late — get some rest.', all_todos: 'All to-dos', completed_at: 'Done at: ', toast_completed: 'Task completed', toast_focus_done: 'Focus done! Take a break.' },
    ja: { greet_morning: 'おはよう！今日の予定は？', greet_noon: 'こんにちは！食事と休憩を忘れずに。', greet_afternoon: 'こんにちは！その調子！', greet_evening: 'こんばんは！今日もお疲れさま！', greet_night: '夜更かしせず、早めに休んで。', all_todos: 'すべて', completed_at: '完了: ', toast_completed: 'タスクを完了しました', toast_focus_done: '集中完了！休憩しましょう。' },
    ko: { greet_morning: '좋은 아침! 오늘 계획은?', greet_noon: '점심 시간! 식사와 휴식 잊지 마세요.', greet_afternoon: '좋은 오후! 계속 화이팅!', greet_evening: '좋은 저녁! 오늘 수고했어요!', greet_night: '늦었어요, 일찍 쉬세요.', all_todos: '모든 할 일', completed_at: '완료: ', toast_completed: '작업 완료', toast_focus_done: '집중 완료! 잠시 쉬세요.' },
    es: { greet_morning: '¡Buenos días! ¿Qué planeas hoy?', greet_noon: '¡Buenas! Recuerda comer y descansar.', greet_afternoon: '¡Buenas tardes! ¡Sigue así!', greet_evening: '¡Buenas noches! ¡Buen trabajo hoy!', greet_night: 'Es tarde, descansa pronto.', all_todos: 'Todas', completed_at: 'Hecho: ', toast_completed: 'Tarea completada', toast_focus_done: '¡Enfoque completado! Descansa.' },
    fr: { greet_morning: 'Bonjour ! Quel est le plan ?', greet_noon: 'Bon midi ! Pense à manger et te reposer.', greet_afternoon: 'Bon après-midi ! Continue !', greet_evening: 'Bonsoir ! Bon travail aujourd’hui !', greet_night: 'Il est tard, repose-toi.', all_todos: 'Toutes', completed_at: 'Terminé : ', toast_completed: 'Tâche terminée', toast_focus_done: 'Focus terminé ! Fais une pause.' },
    de: { greet_morning: 'Guten Morgen! Was steht an?', greet_noon: 'Mahlzeit! Iss und ruh dich aus.', greet_afternoon: 'Guten Nachmittag! Weiter so!', greet_evening: 'Guten Abend! Gut gemacht heute!', greet_night: 'Es ist spät, ruh dich aus.', all_todos: 'Alle', completed_at: 'Erledigt: ', toast_completed: 'Aufgabe erledigt', toast_focus_done: 'Fokus fertig! Mach eine Pause.' },
    ru: { greet_morning: 'Доброе утро! Какие планы?', greet_noon: 'Добрый день! Не забудьте поесть и отдохнуть.', greet_afternoon: 'Добрый день! Так держать!', greet_evening: 'Добрый вечер! Хорошая работа!', greet_night: 'Уже поздно, отдохните.', all_todos: 'Все', completed_at: 'Готово: ', toast_completed: 'Задача выполнена', toast_focus_done: 'Фокус завершён! Отдохните.' },
  };
  for (const k in DICT) Object.assign(DICT[k], CHROME[k] || {});

  // 其它零散文案：分组“添加”按钮提示 / 番茄钟无标题占位（“今天”已在各语言基础词典中）
  const MISC = {
    'zh-CN': { add_here: '在此组添加', untitled_task: '无标题任务' },
    en: { add_here: 'Add to this group', untitled_task: 'Untitled task' },
    ja: { add_here: 'このグループに追加', untitled_task: '無題のタスク' },
    ko: { add_here: '이 그룹에 추가', untitled_task: '제목 없는 작업' },
    es: { add_here: 'Añadir a este grupo', untitled_task: 'Tarea sin título' },
    fr: { add_here: 'Ajouter à ce groupe', untitled_task: 'Tâche sans titre' },
    de: { add_here: 'Zu dieser Gruppe hinzufügen', untitled_task: 'Unbenannte Aufgabe' },
    ru: { add_here: 'Добавить в эту группу', untitled_task: 'Задача без названия' },
  };
  for (const k in DICT) Object.assign(DICT[k], MISC[k] || {});

  // 任务数据值的显示翻译（存储值仍是中文，仅显示翻译）：分类 / 状态 / 优先级
  const DATA = {
    'zh-CN': { cat_work: '工作', cat_life: '生活', status_todo: '待办', status_done: '完成', prio_high: '高', prio_mid: '中', prio_low: '低' },
    en: { cat_work: 'Work', cat_life: 'Life', status_todo: 'To-do', status_done: 'Done', prio_high: 'High', prio_mid: 'Medium', prio_low: 'Low' },
    ja: { cat_work: '仕事', cat_life: '生活', status_todo: '未完了', status_done: '完了', prio_high: '高', prio_mid: '中', prio_low: '低' },
    ko: { cat_work: '업무', cat_life: '생활', status_todo: '할 일', status_done: '완료', prio_high: '높음', prio_mid: '보통', prio_low: '낮음' },
    es: { cat_work: 'Trabajo', cat_life: 'Vida', status_todo: 'Pendiente', status_done: 'Hecho', prio_high: 'Alta', prio_mid: 'Media', prio_low: 'Baja' },
    fr: { cat_work: 'Travail', cat_life: 'Vie', status_todo: 'À faire', status_done: 'Terminé', prio_high: 'Haute', prio_mid: 'Moyenne', prio_low: 'Basse' },
    de: { cat_work: 'Arbeit', cat_life: 'Leben', status_todo: 'Offen', status_done: 'Erledigt', prio_high: 'Hoch', prio_mid: 'Mittel', prio_low: 'Niedrig' },
    ru: { cat_work: 'Работа', cat_life: 'Жизнь', status_todo: 'Задача', status_done: 'Готово', prio_high: 'Высокий', prio_mid: 'Средний', prio_low: 'Низкий' },
  };
  for (const k in DICT) Object.assign(DICT[k], DATA[k] || {});

  // 把存储用的中文值映射到 i18n key（用于显示翻译）
  const VALUE_KEY = {
    '工作': 'cat_work', '生活': 'cat_life',
    '待办': 'status_todo', '完成': 'status_done',
    '高': 'prio_high', '中': 'prio_mid', '低': 'prio_low',
  };
  // 显示标签：已知的中文数据值翻译成当前语言；未知值（自定义）原样返回
  function dataLabel(value) {
    const key = VALUE_KEY[value];
    return key ? t(key) : value;
  }

  const SUPPORTED = Object.keys(DICT);

  // 把任意 navigator/系统语言码归一化到受支持的 8 种之一
  function normalizeLang(code) {
    if (!code) return 'en';
    code = String(code);
    if (DICT[code]) return code;
    const low = code.toLowerCase();
    if (low.startsWith('zh')) return 'zh-CN';
    const base = low.split('-')[0];
    return DICT[base] ? base : 'en';
  }

  let current = 'zh-CN';

  function setLang(code) { current = DICT[code] ? code : normalizeLang(code); }
  function getLang() { return current; }
  function t(key) {
    const d = DICT[current] || DICT['zh-CN'];
    return key in d ? d[key] : (DICT['zh-CN'][key] ?? key);
  }

  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('data-tooltip', t(el.getAttribute('data-i18n-title')));
    });
  }

  window.I18N = { DICT, SUPPORTED, normalizeLang, setLang, getLang, t, applyI18n, dataLabel };
})();
