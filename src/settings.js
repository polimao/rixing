const { invoke } = window.__TAURI__.core;
const appEvent = window.__TAURI__ && window.__TAURI__.event;

const elAutostart = document.getElementById('autostart');
const elShowCount = document.getElementById('show-count');
const elThemeSeg = document.getElementById('theme-seg');
const elFlags = document.getElementById('language-flags');

let settings = {};   // 完整 settings 对象（合并保存，避免覆盖 sortRule 等）
let syncing = false; // 回写控件时避免触发 change

async function loadSettings() {
  try { settings = (await invoke('load_settings')) || {}; } catch (e) { settings = {}; }
  if (typeof settings !== 'object' || Array.isArray(settings)) settings = {};
}
async function saveSettings() {
  try { await invoke('save_settings', { settings }); } catch (e) { console.error('save settings failed:', e); }
}

// 语言国旗：第一项“跟随系统”（地球），其余为各语言国旗
const FLAGS = { 'zh-CN': '🇨🇳', en: '🇬🇧', ja: '🇯🇵', ko: '🇰🇷', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', ru: '🇷🇺' };
function buildFlags() {
  elFlags.innerHTML = '';
  const make = (value, glyph, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'flag-btn';
    b.dataset.value = value;
    b.textContent = glyph;
    b.title = title;
    elFlags.appendChild(b);
  };
  make('system', '🌐', window.I18N.t('language_system'));
  window.I18N.SUPPORTED.forEach((code) => make(code, FLAGS[code] || code, window.I18N.DICT[code].lang_name));
}

function currentLangSelection() {
  if (settings.langMode === 'system') return 'system';
  return settings.lang && window.I18N.DICT[settings.lang] ? settings.lang : 'system';
}

function syncControls() {
  const lang = currentLangSelection();
  elFlags.querySelectorAll('.flag-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === lang));
  const theme = settings.theme || 'system';
  elThemeSeg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
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
  resizeToContent();
}

function setupTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchTab(btn.dataset.tab);
  });
  // 托盘右键菜单项点击后由后端发来目标标签页（念日/窗口分屏/通用设置/关于）
  if (appEvent) {
    appEvent.listen('settings-open-tab', (e) => {
      if (typeof e.payload === 'string') switchTab(e.payload);
    });
  }
}

// 让设置窗口高度自适应内容，从而不出现滚动条（宽度保持不变）
function resizeToContent() {
  requestAnimationFrame(() => {
    const wrap = document.querySelector('.wrap');
    if (!wrap) return;
    const h = Math.ceil(wrap.getBoundingClientRect().height) + 40; // 额外留 40px
    invoke('resize_settings', { height: h }).catch(() => { });
  });
}

// 设置窗口有原生标题栏：让标题随界面语言本地化（中文版「设置」/ 国际版 Settings…）
async function applyWindowTitle() {
  try {
    await window.__TAURI__.window.getCurrentWindow().setTitle(window.I18N.t('settings_title'));
  } catch (e) { /* ignore */ }
}

async function init() {
  await loadSettings();
  setupTabs();
  buildFlags();
  applyWindowTitle();
  try {
    const st = await invoke('get_settings_state');
    syncing = true; elAutostart.checked = !!(st && st.autostart); syncing = false;
  } catch (e) { console.error(e); }
  syncing = true; elShowCount.checked = !!settings.showCount; syncing = false;
  syncControls();
  await initTiling();
  renderAnnList();
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
  applyWindowTitle(); // 标题栏跟随新语言
  buildFlags();       // 用新语言重写”跟随系统”等 title
  syncControls();
  renderAnnList();
  resizeToContent();  // 译文长度变化可能改变高度
  // 通知其它窗口刷新 + 让后端按新语言重建托盘文案
  if (appEvent) appEvent.emit('settings-updated');
  try { await invoke('relocalize_tray'); } catch (e) { console.error(e); }
}

elFlags.addEventListener('click', (e) => {
  const b = e.target.closest('.flag-btn');
  if (b) selectLanguage(b.dataset.value);
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
const kbdBtns = Array.from(document.querySelectorAll('.kbd[data-key]'));

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
  const btn = recordingBtn;
  recordingBtn = null;
  btn.classList.remove('recording');
  btn.textContent = labelFor(btn);
  try { await invoke('apply_tiling_shortcuts'); } catch (e) { /* ignore */ }
}

kbdBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (recordingBtn === btn) { endRecording(); return; }
    if (recordingBtn) {
      // 切换到另一个：保持挂起状态，只改目标
      recordingBtn.classList.remove('recording');
      recordingBtn.textContent = labelFor(recordingBtn);
      recordingBtn = btn;
      btn.classList.add('recording');
      btn.classList.remove('warn');
      btn.textContent = window.I18N.t('tidy_record');
    } else {
      startRecording(btn);
    }
  });
});

window.addEventListener('keydown', async (e) => {
  if (!recordingBtn) return;
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

// 失焦/关闭设置窗口时若仍在录制，务必恢复码放快捷键，避免一直处于挂起状态
window.addEventListener('blur', () => { if (recordingBtn) endRecording(); });

// 每次窗口被显示/聚焦（从托盘”设置”打开）时重新贴合高度
window.addEventListener('focus', () => resizeToContent());

// ---------------------------------------------------------------------------
// 念日（重要日期倒计时）
// ---------------------------------------------------------------------------

function getAnns() {
  return Array.isArray(settings.anniversaries) ? settings.anniversaries : [];
}

// 当前正在行内编辑的念日 id（null 表示无）
let editingId = null;

// 操作按钮图标
const ANN_ICON = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
};

function repeatLabel(on) {
  return on ? window.I18N.t('ann_repeat_yearly_short') : window.I18N.t('ann_once');
}

// 重复药丸：同步开关样式与文案（展示行只读、编辑/新增行可点切换）
function setChip(btn, on) {
  btn.classList.toggle('on', !!on);
  btn.textContent = repeatLabel(!!on);
}

// 念日 date 字段：每年重复存 MM-DD，一次性存 YYYY-MM-DD；编辑时补全成 input[type=date] 需要的 YYYY-MM-DD
function annDateToInput(ann) {
  if (typeof ann.date === 'string' && ann.date.length === 5) {
    return `${new Date().getFullYear()}-${ann.date}`;
  }
  return ann.date || '';
}

// 倒计时（与 calendar.js 同一套算法，保证两处一致）
function annNextOccurrence(ann) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!ann.repeat) {
    const [yy, mo, dy] = String(ann.date).split('-').map(Number);
    return new Date(yy, mo - 1, dy);
  }
  const [mm, dd] = String(ann.date).split('-').map(Number);
  let d = new Date(today.getFullYear(), mm - 1, dd);
  if (d < today) d = new Date(today.getFullYear() + 1, mm - 1, dd);
  return d;
}

function annDaysUntil(next) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(next); t.setHours(0, 0, 0, 0);
  return Math.round((t - today) / 86400000);
}

function annCountdownLabel(days) {
  const tl = (k, n) => window.I18N.t(k).replace('{n}', n);
  const ti = (k) => window.I18N.t(k);
  if (days === 0) return ti('ann_today');
  if (days === 1) return ti('ann_tomorrow');
  if (days < 7) return tl('ann_days_later', days);
  if (days === 7) return ti('ann_next_week');
  if (days < 30) return tl('ann_weeks_later', Math.floor(days / 7));
  if (days < 60) return ti('ann_next_month');
  if (days < 365) return tl('ann_months_later', Math.round(days / 30));
  if (days < 730) return ti('ann_next_year');
  return tl('ann_years_later', Math.floor(days / 365));
}

function renderAnnList() {
  const list = document.getElementById('ann-list');
  if (!list) return;
  list.innerHTML = '';
  getAnns().forEach((ann) => {
    const row = document.createElement('div');
    row.className = 'ann-row';
    if (ann.id === editingId) {
      // 行内编辑：标题 · 日期 · 重复 · 保存/取消
      row.innerHTML = `
        <input type="text" class="ann-input ann-name-cell">
        <input type="date" class="ann-input ann-date-input">
        <button type="button" class="ann-rep" title="${window.I18N.t('ann_repeat')}"></button>
        <button class="mini-btn ann-save-btn">${window.I18N.t('ann_save')}</button>
        <button class="ann-iconbtn ann-cancel-btn" title="${window.I18N.t('ann_cancel')}">${ANN_ICON.cancel}</button>
      `;
      row.classList.add('editing');
      const nameEl = row.querySelector('.ann-name-cell');
      const dateEl = row.querySelector('.ann-date-input');
      const chip = row.querySelector('.ann-rep');
      nameEl.value = ann.name;
      dateEl.value = annDateToInput(ann);
      setChip(chip, ann.repeat);
      chip.addEventListener('click', () => setChip(chip, !chip.classList.contains('on')));
      row.querySelector('.ann-save-btn').addEventListener('click', () => saveEdit(ann.id, nameEl, dateEl, chip));
      row.querySelector('.ann-cancel-btn').addEventListener('click', () => { editingId = null; renderAnnList(); });
      nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveEdit(ann.id, nameEl, dateEl, chip); });
    } else {
      // 展示行：日期色块 + 名称 + 倒计时 · 重复 + 编辑/删除
      const next = annNextOccurrence(ann);
      const valid = !isNaN(next.getTime());
      const days = valid ? annDaysUntil(next) : NaN;
      const urg = !valid || days < 0 ? 'past' : days === 0 ? 'today' : days <= 7 ? 'soon' : '';
      const loc = (settings && settings.lang) || 'zh-CN';
      const mon = valid ? next.toLocaleDateString(loc, { month: 'short' }) : '';
      const day = valid ? next.getDate() : '';
      const cdText = !valid ? ann.date : days < 0 ? ann.date : annCountdownLabel(days);
      const repeatTxt = ann.repeat ? window.I18N.t('ann_repeat_yearly_short') : window.I18N.t('ann_once');
      row.innerHTML = `
        <div class="ann-badge ${urg}"><span class="mon"></span><span class="day"></span></div>
        <div class="ann-main">
          <div class="ann-title"></div>
          <div class="ann-meta"><span class="cd ${urg}"></span> · <span class="rep"></span></div>
        </div>
        <button class="ann-iconbtn ann-edit-btn" title="${window.I18N.t('ann_edit')}">${ANN_ICON.edit}</button>
        <button class="ann-iconbtn danger ann-del-btn" title="${window.I18N.t('ann_delete')}">${ANN_ICON.del}</button>
      `;
      // 全部用 textContent 注入，避免名称里的 HTML 被注入执行
      row.querySelector('.ann-badge .mon').textContent = mon;
      row.querySelector('.ann-badge .day').textContent = day;
      const titleEl = row.querySelector('.ann-title');
      titleEl.textContent = ann.name;
      titleEl.title = ann.name;
      row.querySelector('.ann-meta .cd').textContent = cdText;
      row.querySelector('.ann-meta .rep').textContent = repeatTxt;
      row.querySelector('.ann-edit-btn').addEventListener('click', () => { editingId = ann.id; renderAnnList(); });
      row.querySelector('.ann-del-btn').addEventListener('click', () => deleteAnn(ann.id));
    }
    list.appendChild(row);
  });
  // 新增行的重复药丸文案随语言刷新
  const addChip = document.getElementById('ann-repeat');
  if (addChip) addChip.textContent = repeatLabel(addChip.classList.contains('on'));
  resizeToContent();
}

async function saveEdit(id, nameEl, dateEl, chip) {
  const name = nameEl.value.trim();
  const dateStr = dateEl.value;
  const repeat = chip.classList.contains('on');
  if (!name) { shakeEl(nameEl); nameEl.focus(); return; }
  if (!dateStr) { shakeEl(dateEl); dateEl.focus(); return; }
  const dateVal = repeat ? dateStr.slice(5) : dateStr;
  const anns = getAnns();
  const item = anns.find((a) => a.id === id);
  if (item) { item.name = name; item.date = dateVal; item.repeat = repeat; }
  settings.anniversaries = anns;
  await saveSettings();
  if (appEvent) appEvent.emit('settings-updated');
  editingId = null;
  renderAnnList();
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
  const dateEl = document.getElementById('ann-date');
  const repeatEl = document.getElementById('ann-repeat');

  const name = nameEl.value.trim();
  const repeat = repeatEl.classList.contains('on');
  const dateStr = dateEl.value; // 原生日期选择器保证合法（不会出现 2 月 31 日）；格式为 YYYY-MM-DD 或空

  if (!name) { shakeEl(nameEl); nameEl.focus(); return; }
  if (!dateStr) { shakeEl(dateEl); dateEl.focus(); return; }

  // 每年重复只存月日（MM-DD）；一次性保留完整年月日（YYYY-MM-DD）
  const dateVal = repeat ? dateStr.slice(5) : dateStr;

  if (!Array.isArray(settings.anniversaries)) settings.anniversaries = [];
  settings.anniversaries.push({ id: annId(), name, date: dateVal, repeat });
  await saveSettings();
  if (appEvent) appEvent.emit('settings-updated');

  nameEl.value = '';
  dateEl.value = '';
  setChip(repeatEl, true); // 重置为「每年」
  renderAnnList();
}

document.getElementById('ann-add-btn').addEventListener('click', addAnn);
document.getElementById('ann-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addAnn(); });
// 新增行的重复药丸：初始「每年」+ 点击切换
(() => {
  const addChip = document.getElementById('ann-repeat');
  if (!addChip) return;
  setChip(addChip, true);
  addChip.addEventListener('click', () => setChip(addChip, !addChip.classList.contains('on')));
})();

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

init();
initAbout();
