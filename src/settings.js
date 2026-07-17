const { invoke } = window.__TAURI__.core;
const appEvent = window.__TAURI__ && window.__TAURI__.event;

const elAutostart = document.getElementById('autostart');
const elShowCount = document.getElementById('show-count');
const elThemeSeg = document.getElementById('theme-seg');
const elLangSelect = document.getElementById('language-select');
const elLabFocus = document.getElementById('lab-focus-tab');

// 防休眠
const elKeepEnabled = document.getElementById('keepawake-enabled');
const elKeepDetail = document.getElementById('keepawake-detail');
const elKeepDuration = document.getElementById('keepawake-duration');
const elKeepValue = document.getElementById('keepawake-value');
const elKeepTicks = document.getElementById('keepawake-ticks');
const elKeepCountdown = document.getElementById('keepawake-countdown');
const elKeepRemain = document.getElementById('keepawake-remain');
const elKeepCancel = document.getElementById('keepawake-cancel');
let keepTimer = null;
const KEEP_DURATIONS = [10, 30, 60, 120, 240, 720, 1440, 4320, 10080, 0]; // 分钟；末位 0 = 永久
const KEEP_LABELS = ['10分', '30分', '1时', '2时', '4时', '12时', '1天', '3天', '一周', '永久'];

let settings = {};   // 完整 settings 对象（合并保存，避免覆盖 sortRule 等）
let syncing = false; // 回写控件时避免触发 change

async function loadSettings() {
  try { settings = (await invoke('load_settings')) || {}; } catch (e) { settings = {}; }
  if (typeof settings !== 'object' || Array.isArray(settings)) settings = {};
}
async function saveSettings() {
  try { await invoke('save_settings', { settings }); } catch (e) { console.error('save settings failed:', e); }
}

// 语言下拉选择
function buildLangSelect() {
  elLangSelect.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = 'system';
  opt.textContent = '🌐 ' + window.I18N.t('language_system');
  elLangSelect.appendChild(opt);
  window.I18N.SUPPORTED.forEach((code) => {
    const o = document.createElement('option');
    o.value = code;
    o.textContent = window.I18N.DICT[code].lang_name;
    elLangSelect.appendChild(o);
  });
}

function currentLangSelection() {
  if (settings.langMode === 'system') return 'system';
  return settings.lang && window.I18N.DICT[settings.lang] ? settings.lang : 'system';
}

function syncControls() {
  const lang = currentLangSelection();
  elLangSelect.value = lang;
  const theme = settings.theme || 'system';
  elThemeSeg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
  elLabFocus.checked = !!settings.labFocusTab;
}

// 实验室：根据设置显示/隐藏「轻听」tab（仅隐藏入口，相关代码保留）
function applyLabFocusVisibility() {
  const focusTab = document.querySelector('.tab[data-tab="focus"]');
  if (focusTab) focusTab.hidden = !settings.labFocusTab;
  resizeToContent();
}

// 顶部标签分页：一次只显示一页，切换后重新贴合窗口高度
function switchTab(name) {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  let matched = false;
  tabs.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    if (on) matched = true;
  });
  if (!matched) return; // 未知标签名：保持当前不变
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.dataset.panel === name);
  });
  updateWindowTitle();
  resizeToContent();
}

// 把当前激活面板的标题显示到顶部拖拽条（作为拖拽区的视觉标识）
function updateWindowTitle() {
  const el = document.getElementById('window-title');
  if (!el) return;
  const activePanel = document.querySelector('.tab-panel.active');
  const key = activePanel && activePanel.dataset.titleKey;
  if (!key) return;
  el.textContent = (window.I18N && window.I18N.t(key)) || key;
}

function setupTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchTab(btn.dataset.tab);
  });
  // 托盘右键菜单项点击后由后端发来目标标签页（倒计时/窗口分屏/通用设置/关于）
  if (appEvent) {
    appEvent.listen('settings-open-tab', (e) => {
      if (typeof e.payload !== 'string') return;
      // 「关于」已并入「通用」页，统一跳转过去
      const target = e.payload === 'about' ? 'general' : e.payload;
      switchTab(target);
    });
  }
}

// 让设置窗口高度自适应内容，从而不出现滚动条（宽度保持不变）
const FIXED_SETTINGS_HEIGHT = 550; // 设置页固定高度（px）

function resizeToContent() {
  requestAnimationFrame(() => {
    // 设置页高度固定为 FIXED_SETTINGS_HEIGHT，不再随内容伸缩
    invoke('resize_settings', { height: FIXED_SETTINGS_HEIGHT }).catch(() => { });
  });
}

async function init() {
  await loadSettings();
  setupTabs();
  buildLangSelect();
  try {
    const st = await invoke('get_settings_state');
    syncing = true; elAutostart.checked = !!(st && st.autostart); syncing = false;
  } catch (e) { console.error(e); }
  syncing = true; elShowCount.checked = !!settings.showCount; syncing = false;
  syncControls();
  applyLabFocusVisibility();
  updateWindowTitle();
  await initTiling();
  await initTodoHotkey();
  await initTranslateHotkey();
  await initKeepAwake();
  renderAnnList();
  annSetDate(''); // 初始化空状态文案（本地化占位符）
  resizeToContent();
  // 字体/emoji 布局稳定后再校准一次
  setTimeout(resizeToContent, 120);
}

elAutostart.addEventListener('change', async () => {
  if (syncing) return;
  const enabled = elAutostart.checked;
  try {
    await invoke('set_autostart', { enabled });
  } catch (e) {
    console.error('set_autostart failed:', e);
    syncing = true; elAutostart.checked = !enabled; syncing = false;
  }
});

elShowCount.addEventListener('change', async () => {
  if (syncing) return;
  settings.showCount = elShowCount.checked;
  await saveSettings();
  // 通知待办窗口刷新面板数字
  if (appEvent) appEvent.emit('settings-updated');
  // 重建主托盘以可靠地显示/清除统计数字（macOS 上 set_title 清空不一定生效）
  try { await invoke('refresh_tray_count'); } catch (e) { console.error('refresh_tray_count failed:', e); }
});

elLabFocus.addEventListener('change', async () => {
  if (syncing) return;
  settings.labFocusTab = elLabFocus.checked;
  await saveSettings();
  applyLabFocusVisibility();
});

async function selectLanguage(value) {
  if (value === 'system') {
    settings.langMode = 'system';
    settings.lang = window.I18N.normalizeLang(navigator.language || 'en');
  } else {
    settings.langMode = 'manual';
    settings.lang = value;
  }
  await saveSettings();
  // 本窗口立即套用
  window.I18N.setLang(settings.lang);
  window.I18N.applyI18n(document);
  updateWindowTitle();     // 语言切换后刷新拖拽条标题
  buildLangSelect();       // 用新语言重写”跟随系统”等 title
  syncControls();
  renderAnnList();
  resizeToContent();  // 译文长度变化可能改变高度
  // 通知其它窗口刷新 + 让后端按新语言重建托盘文案
  if (appEvent) appEvent.emit('settings-updated');
  try { await invoke('relocalize_tray'); } catch (e) { console.error(e); }
}

elLangSelect.addEventListener('change', () => {
  selectLanguage(elLangSelect.value);
});

async function selectTheme(value) {
  settings.theme = value;
  await saveSettings();
  window.AppUI.applyTheme(settings.theme);
  syncControls();
  if (appEvent) appEvent.emit('settings-updated');
}

elThemeSeg.addEventListener('click', (e) => {
  const b = e.target.closest('.seg-btn');
  if (b) selectTheme(b.dataset.theme);
});

// ---------------------------------------------------------------------------
// 码放（窗口整理）
// ---------------------------------------------------------------------------
const elTidyEnabled = document.getElementById('tidy-enabled');
const elTidyDetail = document.getElementById('tidy-detail');
const elTidyGap = document.getElementById('tidy-gap');
const elPermRow = document.getElementById('tidy-perm-row');
const elGrant = document.getElementById('tidy-grant');
const kbdBtns = Array.from(document.querySelectorAll('.kbd[data-key]:not([data-key="todo"]):not([data-key="translate"])'));
const todoKbdBtn = document.querySelector('.kbd[data-key="todo"]');
const translateKbdBtn = document.querySelector('.kbd[data-key="translate"]');

const SYM = {
  super: '⌘', control: '⌃', alt: '⌥', shift: '⇧',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
};

function fmtAccel(s) {
  if (!s) return window.I18N.t('tidy_none');
  return s.split('+').map((p) => SYM[p]
    || (p.startsWith('Key') ? p.slice(3) : p.startsWith('Digit') ? p.slice(5) : p)).join(' ');
}

function reflectTidy(on, trusted) {
  elTidyDetail.classList.toggle('disabled', !on);
  elPermRow.style.display = (on && !trusted) ? '' : 'none';
  resizeToContent(); // 权限行/明暗变化后重新贴合高度
}

async function initTiling() {
  let t = {};
  try { t = (await invoke('get_tiling_settings')) || {}; } catch (e) { console.error(e); }
  settings.tiling = {
    enabled: !!t.enabled,
    gap: typeof t.gap === 'number' ? t.gap : 8,
    shortcuts: t.shortcuts || {},
  };
  syncing = true;
  elTidyEnabled.checked = !!t.enabled;
  elTidyGap.value = settings.tiling.gap;
  kbdBtns.forEach((b) => { b.textContent = fmtAccel(settings.tiling.shortcuts[b.dataset.key]); });
  syncing = false;
  reflectTidy(!!t.enabled, !!t.trusted);
}

async function refreshTrusted() {
  try {
    const t = await invoke('get_tiling_settings');
    reflectTidy(elTidyEnabled.checked, !!t.trusted);
  } catch (e) { /* ignore */ }
}

elTidyEnabled.addEventListener('change', async () => {
  if (syncing) return;
  const on = elTidyEnabled.checked;
  settings.tiling.enabled = on;
  await saveSettings();
  let trusted = true;
  if (on) { try { trusted = await invoke('request_accessibility'); } catch (e) { /* ignore */ } }
  reflectTidy(on, trusted);
  try { await invoke('apply_tiling_shortcuts'); } catch (e) { console.error(e); }
});

elGrant.addEventListener('click', async () => {
  try { await invoke('request_accessibility'); } catch (e) { /* ignore */ }
  setTimeout(refreshTrusted, 400);
});

elTidyGap.addEventListener('change', async () => {
  if (syncing) return;
  let g = parseInt(elTidyGap.value, 10);
  if (isNaN(g) || g < 0) g = 0;
  if (g > 80) g = 80;
  elTidyGap.value = g;
  settings.tiling.gap = g;
  await saveSettings();
  try { await invoke('apply_tiling_shortcuts'); } catch (e) { /* ignore */ }
});

// 快捷键录制：点击后按下组合键
let recordingBtn = null;

function labelFor(btn) { return fmtAccel(settings.tiling.shortcuts[btn.dataset.key]); }

// 录制期间挂起码放快捷键：否则按到组合键会把设置窗口码放掉、且会被系统“吞掉”导致录不上
async function startRecording(btn) {
  recordingBtn = btn;
  btn.classList.add('recording');
  btn.classList.remove('warn');
  btn.textContent = window.I18N.t('tidy_record');
  try { await invoke('suspend_tiling_shortcuts'); } catch (e) { /* ignore */ }
}

// 结束录制并恢复码放快捷键（按当前已保存的设置重新注册）
async function endRecording() {
  if (!recordingBtn) return;
  const wasTodo = recordingBtn === todoKbdBtn;
  if (wasTodo) {
    recordingBtn = null;
    todoKbdBtn.classList.remove('recording');
    todoKbdBtn.textContent = fmtTodoAccel(settings.todoShortcut);
    try { await invoke('apply_todo_shortcut_settings'); } catch (e) { /* ignore */ }
  } else if (recordingBtn === translateKbdBtn) {
    recordingBtn = null;
    translateKbdBtn.classList.remove('recording');
    translateKbdBtn.textContent = fmtTodoAccel(settings.translateShortcut);
    try { await invoke('apply_translate_shortcut_settings'); } catch (e) { /* ignore */ }
  } else {
    const btn = recordingBtn;
    recordingBtn = null;
    btn.classList.remove('recording');
    btn.textContent = labelFor(btn);
    try { await invoke('apply_tiling_shortcuts'); } catch (e) { /* ignore */ }
  }
}

kbdBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (recordingBtn === btn) { endRecording(); return; }
    if (recordingBtn) {
      // 如果之前在录制待办/翻译快捷键，先结束它（恢复对应热键）
      if (recordingBtn === todoKbdBtn || recordingBtn === translateKbdBtn) { endRecording(); }
      else {
        // 切换到另一个分屏快捷键：保持挂起状态，只改目标
        recordingBtn.classList.remove('recording');
        recordingBtn.textContent = labelFor(recordingBtn);
      }
      recordingBtn = btn;
      startRecording(btn);
    } else {
      startRecording(btn);
    }
  });
});

window.addEventListener('keydown', async (e) => {
  if (!recordingBtn) return;
  // 待办快捷键录制与分屏快捷键录制共用此 handler
  if (recordingBtn === todoKbdBtn) {
    e.preventDefault();
    if (e.key === 'Escape') { endRecording(); return; }
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
    const mods = [];
    if (e.metaKey) mods.push('super');
    if (e.ctrlKey) mods.push('control');
    if (e.altKey) mods.push('alt');
    if (e.shiftKey) mods.push('shift');
    if (mods.length === 0) return;
    const accel = [...mods, e.code].join('+');

    settings.todoShortcut = accel;
    await saveSettings();
    recordingBtn = null;
    todoKbdBtn.classList.remove('recording');
    todoKbdBtn.textContent = fmtTodoAccel(accel);
    try { await invoke('apply_todo_shortcut_settings'); } catch (e2) { console.error(e2); }
    return;
  }

  // 翻译快捷键录制（与待办快捷键同模式）
  if (recordingBtn === translateKbdBtn) {
    e.preventDefault();
    if (e.key === 'Escape') { endRecording(); return; }
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
    const mods = [];
    if (e.metaKey) mods.push('super');
    if (e.ctrlKey) mods.push('control');
    if (e.altKey) mods.push('alt');
    if (e.shiftKey) mods.push('shift');
    if (mods.length === 0) return;
    const accel = [...mods, e.code].join('+');

    settings.translateShortcut = accel;
    await saveSettings();
    recordingBtn = null;
    translateKbdBtn.classList.remove('recording');
    translateKbdBtn.textContent = fmtTodoAccel(accel);
    try { await invoke('apply_translate_shortcut_settings'); } catch (e2) { console.error(e2); }
    return;
  }

  // 以下是分屏快捷键录制逻辑
  e.preventDefault();
  if (e.key === 'Escape') { endRecording(); return; }
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return; // 等非修饰键
  const mods = [];
  if (e.metaKey) mods.push('super');
  if (e.ctrlKey) mods.push('control');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  if (mods.length === 0) return; // 全局快捷键至少需一个修饰键
  const accel = [...mods, e.code].join('+');
  const btn = recordingBtn;
  const key = btn.dataset.key;
  settings.tiling.shortcuts = settings.tiling.shortcuts || {};

  // 重复检测：与其它动作的快捷键相同 → 提示且不覆盖
  const dup = Object.entries(settings.tiling.shortcuts).some(([k, v]) => k !== key && v === accel);
  if (dup) {
    recordingBtn = null;
    btn.classList.remove('recording');
    btn.classList.add('warn');
    btn.textContent = window.I18N.t('tidy_dup');
    try { await invoke('apply_tiling_shortcuts'); } catch (e2) { /* ignore */ } // 恢复码放
    setTimeout(() => { btn.classList.remove('warn'); btn.textContent = labelFor(btn); }, 1500);
    return;
  }

  settings.tiling.shortcuts[key] = accel;
  recordingBtn = null;
  btn.classList.remove('recording');
  btn.textContent = fmtAccel(accel);
  await saveSettings();
  try { await invoke('apply_tiling_shortcuts'); } catch (e2) { console.error(e2); }
}, true);

// 失焦/关闭设置窗口时若仍在录制，务必恢复快捷键，避免一直处于挂起状态
window.addEventListener('blur', () => { if (recordingBtn) endRecording(); });

// 每次窗口被显示/聚焦（从托盘”设置”打开）时重新贴合高度
window.addEventListener('focus', () => resizeToContent());

// ---------------------------------------------------------------------------
// 待办窗口快捷键（可自定义，与码放快捷键共用录制模式）
// ---------------------------------------------------------------------------

function fmtTodoAccel(s) {
  if (!s) return SYM['super'] + SYM['shift'] + ' U';
  return s.split('+').map((p) => SYM[p]
    || (p.startsWith('Key') ? p.slice(3) : p.startsWith('Digit') ? p.slice(5) : p)).join(' ');
}

async function initTodoHotkey() {
  if (!todoKbdBtn) return;
  try {
    const res = await invoke('get_todo_shortcut');
    settings.todoShortcut = (res && res.shortcut) || 'super+shift+KeyU';
  } catch (e) {
    settings.todoShortcut = 'super+shift+KeyU';
  }
  todoKbdBtn.textContent = fmtTodoAccel(settings.todoShortcut);
}

todoKbdBtn && todoKbdBtn.addEventListener('click', async () => {
  if (recordingBtn === todoKbdBtn) { endRecording(); return; }
  if (recordingBtn) {
    // 切换到待办快捷键录制：先结束当前的，再开始新的
    endRecording();
  }
  recordingBtn = todoKbdBtn;
  todoKbdBtn.classList.add('recording');
  todoKbdBtn.classList.remove('warn');
  todoKbdBtn.textContent = window.I18N.t('todo_hotkey_record');
  try { await invoke('suspend_todo_shortcut'); } catch (e) { /* ignore */ }
});

// 翻译快捷键：与待办快捷键同模式（录制 / 挂起 / 重注册）
translateKbdBtn && translateKbdBtn.addEventListener('click', async () => {
  if (recordingBtn === translateKbdBtn) { endRecording(); return; }
  if (recordingBtn) {
    // 切换到翻译快捷键录制：先结束当前的，再开始新的
    endRecording();
  }
  recordingBtn = translateKbdBtn;
  translateKbdBtn.classList.add('recording');
  translateKbdBtn.classList.remove('warn');
  translateKbdBtn.textContent = window.I18N.t('todo_hotkey_record');
  try { await invoke('suspend_translate_shortcut'); } catch (e) { /* ignore */ }
});

async function initTranslateHotkey() {
  if (!translateKbdBtn) return;
  try {
    const res = await invoke('get_translate_shortcut');
    settings.translateShortcut = (res && res.shortcut) || 'super+shift+KeyY';
  } catch (e) {
    settings.translateShortcut = 'super+shift+KeyY';
  }
  translateKbdBtn.textContent = fmtTodoAccel(settings.translateShortcut);
}

// ---------------------------------------------------------------------------
// 防休眠
// ---------------------------------------------------------------------------

function formatKeepValue(idx) {
  if (idx === KEEP_DURATIONS.length - 1) return '永久'; // 末档：永久
  const minutes = KEEP_DURATIONS[idx];
  if (minutes < 60) return minutes + ' 分钟';
  const hours = minutes / 60;
  if (hours < 24) return hours + ' 小时';
  const days = hours / 24;
  if (days < 7) return days + ' 天';
  return (days / 7) + ' 周';
}

// 时长档位对应的毫秒数；末档(0)为「永久」，返回 0
function keepDurationMs(idx) {
  const minutes = KEEP_DURATIONS[idx];
  if (!minutes || minutes <= 0) return 0;
  return minutes * 60 * 1000;
}

function formatRemain(ms) {
  if (ms <= 0) return '0 分钟';
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return totalMin + ' 分钟';
  const hours = totalMin / 60;
  if (hours < 24) return (Math.round(hours * 10) / 10) + ' 小时';
  const days = hours / 24;
  if (days < 7) return (Math.round(days * 10) / 10) + ' 天';
  return (Math.round((days / 7) * 10) / 10) + ' 周';
}

function stopKeepCountdown() {
  if (keepTimer) { clearInterval(keepTimer); keepTimer = null; }
}

// reset=true：以当前时刻重新计时（开启 / 重新设置档位时）
// reset=false：沿用已保存的 startedAt 继续（启动恢复时）
function startKeepCountdown(reset = true) {
  stopKeepCountdown();
  const idx = settings.keepAwake.index;
  const dur = keepDurationMs(idx);
  if (dur === 0) {
    // 永久档：不倒计时，仅提示
    if (elKeepCountdown) elKeepCountdown.style.display = '';
    if (elKeepRemain) elKeepRemain.textContent = '永久生效';
    if (elKeepCancel) elKeepCancel.style.display = 'none';
    return;
  }
  if (reset || !settings.keepAwake.startedAt) {
    settings.keepAwake.startedAt = Date.now();
    saveSettings();
  }
  if (elKeepCancel) elKeepCancel.style.display = '';
  const tick = () => {
    const remain = dur - (Date.now() - settings.keepAwake.startedAt);
    if (remain <= 0) {
      // 到点：自动关闭防休眠
      stopKeepCountdown();
      settings.keepAwake.enabled = false;
      settings.keepAwake.startedAt = null;
      elKeepEnabled.checked = false;
      elKeepDetail.classList.add('disabled');
      saveSettings();
      invoke('set_keep_awake', { enabled: false, index: settings.keepAwake.index })
        .catch((e) => console.error('set_keep_awake failed:', e));
      if (elKeepCountdown) elKeepCountdown.style.display = 'none';
      if (elKeepCancel) elKeepCancel.style.display = 'none';
      return;
    }
    if (elKeepCountdown) elKeepCountdown.style.display = '';
    if (elKeepRemain) elKeepRemain.textContent = '剩余 ' + formatRemain(remain);
  };
  tick();
  keepTimer = setInterval(tick, 1000);
}

function reflectKeepValue(i) {
  if (elKeepValue) elKeepValue.textContent = formatKeepValue(i);
  if (elKeepTicks) {
    elKeepTicks.querySelectorAll('span').forEach((s) => {
      s.classList.toggle('active', parseInt(s.dataset.index, 10) === i);
    });
  }
}

function buildKeepTicks() {
  if (!elKeepTicks) return;
  elKeepTicks.innerHTML = '';
  KEEP_LABELS.forEach((lab, i) => {
    const s = document.createElement('span');
    s.textContent = lab;
    s.dataset.index = i;
    s.addEventListener('click', () => {
      if (syncing) return;
      elKeepDuration.value = i;
      reflectKeepValue(i);
      settings.keepAwake.index = i;
      saveSettings();
      if (settings.keepAwake.enabled) {
        // 重新设置档位 → 重新拉起断言并重置倒计时
        invoke('set_keep_awake', { enabled: true, index: i })
          .catch((e) => console.error('set_keep_awake failed:', e));
        startKeepCountdown(true);
      }
    });
    elKeepTicks.appendChild(s);
  });
}

async function initKeepAwake() {
  const ka = (settings.keepAwake && typeof settings.keepAwake === 'object') ? settings.keepAwake : {};
  // 默认：开关关闭（避免误触导致发热/耗电），时长默认 1 小时（index=2）
  const enabled = ka.enabled === true;
  const index = typeof ka.index === 'number' ? ka.index : 2;
  let startedAt = (typeof ka.startedAt === 'number') ? ka.startedAt : null;
  settings.keepAwake = { enabled, index, startedAt: enabled ? startedAt : null };
  buildKeepTicks();
  syncing = true;
  elKeepEnabled.checked = enabled;
  elKeepDuration.value = index;
  syncing = false;
  reflectKeepValue(index);
  elKeepDetail.classList.toggle('disabled', !enabled);
  await saveSettings(); // 持久化默认设置，便于下次启动恢复
  if (enabled) {
    const dur = keepDurationMs(index);
    if (dur > 0 && startedAt && (Date.now() - startedAt) >= dur) {
      // 上次 App 关闭期间已到期：自动关闭（不重新拉起断言）
      settings.keepAwake.enabled = false;
      settings.keepAwake.startedAt = null;
      elKeepEnabled.checked = false;
      elKeepDetail.classList.add('disabled');
      if (elKeepCountdown) elKeepCountdown.style.display = 'none';
      if (elKeepCancel) elKeepCancel.style.display = 'none';
      await saveSettings();
      invoke('set_keep_awake', { enabled: false, index })
        .catch((e) => console.error('set_keep_awake failed:', e));
    } else {
      // 未到期（或永久）：恢复断言并继续 / 开始倒计时
      try {
        await invoke('set_keep_awake', { enabled: true, index });
      } catch (e) {
        console.error('set_keep_awake failed:', e);
      }
      startKeepCountdown(false); // 沿用已有 startedAt
    }
  }
}

elKeepEnabled.addEventListener('change', async () => {
  if (syncing) return;
  const on = elKeepEnabled.checked;
  settings.keepAwake.enabled = on;
  if (!on) {
    // 关闭 / 取消：停止倒计时并释放断言
    stopKeepCountdown();
    settings.keepAwake.startedAt = null;
  }
  await saveSettings();
  elKeepDetail.classList.toggle('disabled', !on);
  try {
    await invoke('set_keep_awake', { enabled: on, index: settings.keepAwake.index });
  } catch (e) {
    console.error('set_keep_awake failed:', e);
  }
  if (on) {
    startKeepCountdown(true); // 开启即从此刻起计时
  } else {
    if (elKeepCountdown) elKeepCountdown.style.display = 'none';
    if (elKeepCancel) elKeepCancel.style.display = 'none';
  }
});

elKeepDuration.addEventListener('input', () => {
  if (syncing) return;
  const i = parseInt(elKeepDuration.value, 10);
  reflectKeepValue(i);
  settings.keepAwake.index = i;
  saveSettings();
});

elKeepDuration.addEventListener('change', () => {
  if (syncing) return;
  if (settings.keepAwake.enabled) {
    const i = parseInt(elKeepDuration.value, 10);
    // 重新设置档位 → 重新拉起断言并重置倒计时
    invoke('set_keep_awake', { enabled: true, index: i })
      .catch((e) => console.error('set_keep_awake failed:', e));
    startKeepCountdown(true);
  }
});

elKeepCancel.addEventListener('click', () => {
  if (syncing) return;
  // 取消 = 关闭开关（会触发上面的 change 监听，停止倒计时并释放断言）
  elKeepEnabled.checked = false;
  elKeepEnabled.dispatchEvent(new Event('change'));
});

// ---------------------------------------------------------------------------
// 重要日期倒计时设置
// ---------------------------------------------------------------------------

function getAnns() {
  return Array.isArray(settings.anniversaries) ? settings.anniversaries : [];
}

function renderAnnList() {
  const list = document.getElementById('ann-list');
  if (!list) return;
  list.innerHTML = '';
  getAnns().forEach((ann) => {
    const typeLabel = ann.repeat
      ? window.I18N.t('ann_repeat_yearly_short')
      : window.I18N.t('ann_once');
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '8px';
    row.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ann.name}</div>
        <div style="font-size:11px;color:var(--text-sub);margin-top:2px">${typeLabel} · ${ann.date}</div>
      </div>
      <button class="ann-del-btn" style="background:#fff0f0;border:1px solid #fde0e0;color:#f56c6c;
        border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;flex-shrink:0"
        data-i18n="ann_delete">${window.I18N.t('ann_delete')}</button>
    `;
    row.querySelector('.ann-del-btn').addEventListener('click', () => deleteAnn(ann.id));
    list.appendChild(row);
  });
  resizeToContent();
}

async function deleteAnn(id) {
  settings.anniversaries = getAnns().filter((a) => a.id !== id);
  await saveSettings();
  if (appEvent) appEvent.emit('settings-updated');
  renderAnnList();
}

function annId() {
  return Math.random().toString(36).slice(2, 10);
}

function shakeEl(el) {
  el.classList.remove('ann-shake');
  void el.offsetWidth;
  el.classList.add('ann-shake');
  el.addEventListener('animationend', () => el.classList.remove('ann-shake'), { once: true });
}

async function addAnn() {
  const nameEl = document.getElementById('ann-name');
  const dateEl = document.getElementById('ann-date');       // 隐藏域，存 YYYY-MM-DD
  const dateBtn = document.getElementById('ann-date-btn');   // 可见触发按钮
  const repeatEl = document.getElementById('ann-repeat');

  const name = nameEl.value.trim();
  const repeat = repeatEl.checked;
  const dateStr = dateEl.value; // 自定义选择器保证合法（不会出现 2 月 31 日）；格式为 YYYY-MM-DD 或空

  if (!name) { shakeEl(nameEl); nameEl.focus(); return; }
  if (!dateStr) { shakeEl(dateBtn); dateBtn.focus(); return; }

  // 每年重复只存月日（MM-DD）；一次性保留完整年月日（YYYY-MM-DD）
  const dateVal = repeat ? dateStr.slice(5) : dateStr;

  if (!Array.isArray(settings.anniversaries)) settings.anniversaries = [];
  settings.anniversaries.push({ id: annId(), name, date: dateVal, repeat });
  await saveSettings();
  if (appEvent) appEvent.emit('settings-updated');

  nameEl.value = '';
  annSetDate('');        // 重置日期选择 UI
  repeatEl.checked = true;
  renderAnnList();
}

document.getElementById('ann-add-btn').addEventListener('click', addAnn);
document.getElementById('ann-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addAnn(); });

// ---------------------------------------------------------------------------
// 自定义日期选择器（替代原生 input[type=date]，解决 macOS 年份选择困难）
// ---------------------------------------------------------------------------
let annDpBuilt = false;
let annDpState = { year: 0, month: 0 };

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 设置 / 清空选择，并同步触发按钮上的文案
function annSetDate(value) {
  const hidden = document.getElementById('ann-date');
  const text = document.getElementById('ann-date-text');
  const btn = document.getElementById('ann-date-btn');
  hidden.value = value || '';
  if (value) {
    const [y, m, d] = value.split('-');
    text.textContent = `${y}-${m}-${d}`;
    text.style.color = 'var(--text)';
    btn.classList.remove('is-empty');
  } else {
    text.textContent = window.I18N ? window.I18N.t('ann_date_placeholder') : 'MM-DD 或 YYYY-MM-DD';
    text.style.color = 'var(--text-sub)';
    btn.classList.add('is-empty');
  }
}

function annDpEl() { return document.getElementById('ann-date-pop'); }

function annDpBuild() {
  if (annDpBuilt) return;
  const pop = annDpEl();
  const t = (k, fb) => (window.I18N ? window.I18N.t(k) : fb);
  pop.innerHTML = `
    <div class="ann-dp-head">
      <div class="ann-dp-navrow">
        <button type="button" class="ann-dp-nav" data-act="prev-year" title="上一年">«</button>
        <button type="button" class="ann-dp-nav" data-act="prev-month" title="上个月">‹</button>
        <button type="button" class="ann-dp-nav" data-act="next-month" title="下个月">›</button>
        <button type="button" class="ann-dp-nav" data-act="next-year" title="下一年">»</button>
      </div>
      <div class="ann-dp-selects">
        <select class="ann-dp-year" aria-label="year"></select>
        <select class="ann-dp-month" aria-label="month"></select>
      </div>
    </div>
    <div class="ann-dp-weekdays"></div>
    <div class="ann-dp-grid"></div>
    <div class="ann-dp-foot">
      <button type="button" data-act="today">${t('ann_pick_today', '今天')}</button>
      <button type="button" data-act="clear">${t('ann_clear', '清除')}</button>
    </div>
  `;

  const cy = new Date().getFullYear();
  const yearSel = pop.querySelector('.ann-dp-year');
  for (let y = cy - 100; y <= cy + 20; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  }

  const locale = (window.I18N && window.I18N.getLang && window.I18N.getLang()) || 'zh-CN';
  const monthSel = pop.querySelector('.ann-dp-month');
  for (let m = 0; m < 12; m++) {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2000, m, 1));
    monthSel.appendChild(o);
  }

  const week = (window.I18N && window.I18N.t('week')) || ['日', '一', '二', '三', '四', '五', '六'];
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0]; // 周一起始
  pop.querySelector('.ann-dp-weekdays').innerHTML = mondayFirst.map((i) => `<div>${week[i]}</div>`).join('');

  pop.addEventListener('click', (e) => {
    const actEl = e.target.closest('[data-act]');
    const act = actEl && actEl.dataset.act;
    if (act === 'prev-year') { annDpState.year--; annDpRender(); }
    else if (act === 'next-year') { annDpState.year++; annDpRender(); }
    else if (act === 'prev-month') { annDpStepMonth(-1); }
    else if (act === 'next-month') { annDpStepMonth(1); }
    else if (act === 'today') { annDpSelect(new Date()); }
    else if (act === 'clear') { annSetDate(''); annDpClose(); }
    else {
      const cell = e.target.closest('.ann-dp-cell');
      if (cell && cell.dataset.val) {
        const [yy, mm, dd] = cell.dataset.val.split('-').map(Number);
        annDpSelect(new Date(yy, mm - 1, dd)); // 按本地年月日构造，避免 UTC 解析差一天
      }
    }
  });
  yearSel.addEventListener('change', () => { annDpState.year = +yearSel.value; annDpRender(); });
  monthSel.addEventListener('change', () => { annDpState.month = +monthSel.value; annDpRender(); });

  annDpBuilt = true;
}

function annDpStepMonth(delta) {
  let m = annDpState.month + delta;
  let y = annDpState.year;
  if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
  annDpState.month = m; annDpState.year = y; annDpRender();
}

function annDpRender() {
  const pop = annDpEl();
  pop.querySelector('.ann-dp-year').value = annDpState.year;
  pop.querySelector('.ann-dp-month').value = annDpState.month;

  const grid = pop.querySelector('.ann-dp-grid');
  const first = new Date(annDpState.year, annDpState.month, 1);
  const startDay = (first.getDay() + 6) % 7; // 周一 = 0
  const daysInMonth = new Date(annDpState.year, annDpState.month + 1, 0).getDate();
  const selVal = document.getElementById('ann-date').value;
  const todayStr = fmtDate(new Date());

  let html = '';
  for (let i = 0; i < startDay; i++) html += '<div class="ann-dp-cell muted"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const val = `${annDpState.year}-${String(annDpState.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = ['ann-dp-cell'];
    if (val === todayStr) cls.push('today');
    if (val === selVal) cls.push('selected');
    html += `<button type="button" class="${cls.join(' ')}" data-val="${annDpState.year}-${String(annDpState.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}">${d}</button>`;
  }
  grid.innerHTML = html;
}

function annDpSelect(d) {
  annSetDate(fmtDate(d));
  annDpClose();
}

function annDpOpen() {
  annDpBuild();
  const cur = document.getElementById('ann-date').value;
  let base;
  if (cur) {
    const [yy, mm, dd] = cur.split('-').map(Number);
    base = new Date(yy, mm - 1, dd); // 本地构造，避免 UTC 解析差一天
  } else {
    base = new Date();
  }
  annDpState.year = base.getFullYear();
  annDpState.month = base.getMonth();
  annDpRender();

  const pop = annDpEl();
  const btn = document.getElementById('ann-date-btn');
  pop.classList.remove('hidden');

  const r = btn.getBoundingClientRect();
  const popH = pop.offsetHeight || 290;
  const popW = pop.offsetWidth || 248;
  let top = r.bottom + 6;
  if (top + popH > window.innerHeight && r.top - popH - 6 > 0) top = r.top - popH - 6;
  let left = r.left;
  if (left + popW > window.innerWidth) left = Math.max(4, window.innerWidth - popW - 4);
  pop.style.top = top + 'px';
  pop.style.left = left + 'px';
}

function annDpClose() {
  const pop = annDpEl();
  if (pop) pop.classList.add('hidden');
}

function annDpToggle() {
  const pop = annDpEl();
  if (pop && !pop.classList.contains('hidden')) annDpClose();
  else annDpOpen();
}

document.getElementById('ann-date-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  annDpToggle();
});
document.addEventListener('click', (e) => {
  const pop = annDpEl();
  if (!pop || pop.classList.contains('hidden')) return;
  const btn = document.getElementById('ann-date-btn');
  if (pop.contains(e.target) || btn.contains(e.target)) return;
  annDpClose();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') annDpClose(); });

// ---------------------------------------------------------------------------
// 关于
// ---------------------------------------------------------------------------
async function initAbout() {
  try {
    const ver = await window.__TAURI__.app.getVersion();
    document.getElementById('about-version').textContent = 'v' + ver;
  } catch (e) { /* 保持默认值 */ }

  document.getElementById('about-github').addEventListener('click', () => {
    window.__TAURI__.shell.open('https://github.com/polimao/rixing').catch(() => { });
  });
}


// ---------------------------------------------------------------------------
// 轻听面板（内嵌到设置面板 focus 标签页）
// ---------------------------------------------------------------------------
(function () {
  const fmPRESETS = {
    vibe: [
      { title: 'Lo-fi 深夜书房', prompt: 'lo-fi hip hop, mellow, late night study vibes', desc: '温暖节拍 · 放松专注' },
      { title: '雨天的爵士咖啡馆', prompt: 'soft jazz piano trio, rainy cafe atmosphere', desc: '钢琴三重奏 · 慵懒惬意' },
      { title: '冥想空灵氛围', prompt: 'ambient meditation, ethereal pads, slow evolving textures', desc: '合成器铺底 · 深度放松' },
      { title: '海边日出的钢琴', prompt: 'gentle piano, warm sunrise by the ocean', desc: '温柔琴键 · 宁静舒缓' },
      { title: '林间清晨', prompt: 'acoustic guitar, birdsong atmosphere, morning forest', desc: '木吉他 · 清新自然' },
      { title: '深夜代码', prompt: 'electronic chill, minimal beats, coding focus', desc: '极简电子 · 深度专注' },
    ],
    genre: [
      { title: 'Lo-fi 嘻哈', prompt: 'lo-fi hip hop, chill beats, study music', desc: '经典专注伴奏' },
      { title: '氛围电子 Ambient', prompt: 'ambient electronic, spacious, slow pads', desc: '空间感 · 无节奏干扰' },
      { title: '古典弦乐四重奏', prompt: 'classical string quartet, elegant, flowing', desc: '优雅弦乐 · 创造力' },
      { title: '爵士钢琴三重奏', prompt: 'jazz piano trio, walking bass, brush drums', desc: '经典爵士 · 灵感' },
      { title: '后摇 Post-rock', prompt: 'post-rock, clean guitar, building crescendos', desc: '渐强 · 情绪推升' },
      { title: 'Bossa Nova', prompt: 'bossa nova, nylon guitar, light percussion', desc: '轻松拉丁 · 愉悦' },
    ],
    instrument: [
      { title: '钢琴独奏', prompt: 'solo piano, gentle and slow, minimal', desc: '温柔 · 极简' },
      { title: '大提琴', prompt: 'solo cello, deep and warm, legato', desc: '深沉 · 悠长' },
      { title: '木吉他指弹', prompt: 'fingerstyle acoustic guitar, light and melodic', desc: '轻快 · 旋律感' },
      { title: '古筝流水', prompt: 'chinese guzheng, flowing water imagery, pentatonic', desc: '东方韵味 · 禅意' },
      { title: '萨克斯', prompt: 'smooth saxophone, breathy, late night', desc: '醇厚 · 感性' },
      { title: '合成器浪潮', prompt: 'synthwave, retro synthesizer, dreamy', desc: '复古 · 梦幻' },
    ],
  };

  let fmBridgeReady = false;
  let fmPlaying = false;
  let fmCurrentPrompt = '';
  let fmDrumsOn = true;
  let fmVolume = 0.8;

  function fmQ(s) { return document.querySelector(s); }

  function fmT(key) {
    return (window.I18N && window.I18N.t(key)) || key;
  }

  function fmSetStatus(stage, message) {
    const dot = fmQ('#status-dot');
    const txt = fmQ('#status-text');
    if (dot) dot.className = 'status-dot ' + stage;
    if (message && txt) txt.textContent = message;
  }

  function fmUpdatePlayBtn() {
    const btn = fmQ('#play-btn');
    if (!btn) return;
    btn.textContent = fmPlaying ? '⏸' : '▶';
    btn.classList.toggle('playing', fmPlaying);
  }

  function fmUpdateDrumsUI() {
    const check = fmQ('#drums-check');
    const track = fmQ('#drums-track');
    if (check) check.checked = fmDrumsOn;
    if (track) track.classList.toggle('on', fmDrumsOn);
  }

  function fmBuildPresets() {
    for (const [group, items] of Object.entries(fmPRESETS)) {
      const grid = fmQ('#preset-' + group);
      if (!grid) continue;
      items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'preset-card';
        card.innerHTML =
          '<div class="preset-title">' + item.title + '</div>' +
          '<div class="preset-desc">' + item.desc + '</div>';
        card.addEventListener('click', () => fmSelectPreset(item.prompt, card, grid));
        grid.appendChild(card);
      });
    }
  }

  function fmSelectPreset(prompt, cardEl, grid) {
    grid.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));
    cardEl.classList.add('active');
    const cp = fmQ('#custom-prompt');
    if (cp) cp.value = '';

    fmCurrentPrompt = prompt;
    const np = fmQ('#now-playing');
    if (np) np.innerHTML = '<strong>' + cardEl.querySelector('.preset-title').textContent + '</strong>';

    if (fmBridgeReady && fmPlaying) {
      invoke('focus_set_prompt', { text: prompt });
    } else if (fmBridgeReady) {
      fmStartMusic(prompt);
    }
  }

  async function fmTogglePlay() {
    if (!fmBridgeReady) {
      await fmInitBridge();
      return;
    }
    if (fmPlaying) {
      await invoke('focus_stop');
    } else {
      const prompt = fmCurrentPrompt || fmPRESETS.vibe[0].prompt;
      await fmStartMusic(prompt);
    }
  }

  async function fmStartMusic(prompt) {
    fmCurrentPrompt = prompt;
    await invoke('focus_start', { prompt: prompt, drums: fmDrumsOn });
  }

  function fmOnDrumsToggle() {
    fmDrumsOn = !fmDrumsOn;
    fmUpdateDrumsUI();
    invoke('focus_set_drums', { on: fmDrumsOn });
  }

  function fmOnVolumeChange() {
    fmVolume = parseInt(fmQ('#volume-slider').value) / 100;
    invoke('focus_set_volume', { level: fmVolume });
  }

  function fmApplyCustomPrompt() {
    const text = fmQ('#custom-prompt').value.trim();
    if (!text) return;
    fmCurrentPrompt = text;
    const np = fmQ('#now-playing');
    if (np) np.innerHTML = '<strong>' + text + '</strong>';
    document.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));

    if (fmBridgeReady && fmPlaying) {
      invoke('focus_set_prompt', { text: text });
    } else if (fmBridgeReady) {
      fmStartMusic(text);
    }
  }

  async function fmInitBridge() {
    fmSetStatus('loading', '正在加载 MRT2 模型…');
    const banner = fmQ('#setup-banner');
    const main = fmQ('#main-ui');
    if (banner) banner.classList.add('hidden');
    if (main) { main.classList.remove('hidden'); main.style.display = 'flex'; }

    try {
      await Promise.race([
        invoke('focus_init'),
        new Promise((_, reject) => setTimeout(() => reject('初始化超时，请检查网络连接后重试'), 300000))
      ]);
    } catch (e) {
      fmSetStatus('error', '加载失败: ' + e);
      if (banner) banner.classList.remove('hidden');
      if (main) main.classList.add('hidden');
    }
  }

  function fmOnBridgeStatus(payload) {
    const stage = payload && payload.stage;
    const message = payload && payload.message;

    switch (stage) {
      case 'loading':
        fmSetStatus('loading', message || '加载中…');
        break;
      case 'ready':
        fmBridgeReady = true;
        fmQ('#setup-banner').classList.add('hidden');
        const main = fmQ('#main-ui');
        if (main) { main.classList.remove('hidden'); main.style.display = 'flex'; }
        fmSetStatus('ready', '模型就绪 — 选择预设或输入提示词开始');
        break;
      case 'playing':
        fmPlaying = true;
        fmUpdatePlayBtn();
        fmSetStatus('playing', '正在生成…');
        break;
      case 'stopped':
        fmPlaying = false;
        fmUpdatePlayBtn();
        const np = fmQ('#now-playing');
        if (np) np.innerHTML = '<span>' + fmT('focus_ready') + '</span>';
        fmSetStatus('ready', '已停止');
        break;
      case 'error':
        fmSetStatus('error', message || '出错');
        break;
    }
  }

  function initFocusMusic() {
    const playBtn = fmQ('#play-btn');
    if (!playBtn) return; // focus tab not present in this page

    fmBuildPresets();
    fmUpdateDrumsUI();

    playBtn.addEventListener('click', fmTogglePlay);
    const drumsCheck = fmQ('#drums-check');
    if (drumsCheck) drumsCheck.addEventListener('change', fmOnDrumsToggle);
    const drumsToggle = fmQ('#drums-toggle');
    if (drumsToggle) drumsToggle.addEventListener('click', function (e) {
      if (e.target === drumsCheck) return;
      fmOnDrumsToggle();
    });
    const volSlider = fmQ('#volume-slider');
    if (volSlider) volSlider.addEventListener('input', fmOnVolumeChange);
    const applyBtn = fmQ('#apply-prompt-btn');
    if (applyBtn) applyBtn.addEventListener('click', fmApplyCustomPrompt);
    const customPrompt = fmQ('#custom-prompt');
    if (customPrompt) customPrompt.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') fmApplyCustomPrompt();
    });

    const setupBtn = fmQ('#setup-btn');
    if (setupBtn) setupBtn.addEventListener('click', fmInitBridge);
    const docsBtn = fmQ('#open-docs-btn');
    if (docsBtn) docsBtn.addEventListener('click', function () {
      window.__TAURI__.shell.open('https://magenta.github.io/magenta-realtime/').catch(() => { });
    });

    if (appEvent && typeof appEvent.listen === 'function') {
      appEvent.listen('focus-music-status', function (e) {
        fmOnBridgeStatus(e.payload);
      });
    }

    // check if already running
    invoke('focus_get_status').then(function (s) {
      if (s && s.playing) {
        fmPlaying = true;
        fmBridgeReady = true;
        fmUpdatePlayBtn();
        const banner = fmQ('#setup-banner');
        const main = fmQ('#main-ui');
        if (banner) banner.classList.add('hidden');
        if (main) { main.classList.remove('hidden'); main.style.display = 'flex'; }
        fmSetStatus('playing', '正在生成…');
      }
    }).catch(function () { });
  }

  initFocusMusic();
})();

init();
initAbout();
initTranslate();
