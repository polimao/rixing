const { invoke } = window.__TAURI__.core;
const appEvent = window.__TAURI__ && window.__TAURI__.event;

const elAutostart = document.getElementById('autostart');
const elShowCount = document.getElementById('show-count');
const elThemeSeg = document.getElementById('theme-seg');
const elLangSelect = document.getElementById('language-select');

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
  // 托盘右键菜单项点击后由后端发来目标标签页（倒计时/窗口分屏/通用设置/关于）
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
  buildLangSelect();
  applyWindowTitle();
  try {
    const st = await invoke('get_settings_state');
    syncing = true; elAutostart.checked = !!(st && st.autostart); syncing = false;
  } catch (e) { console.error(e); }
  syncing = true; elShowCount.checked = !!settings.showCount; syncing = false;
  syncControls();
  await initTiling();
  await initTodoHotkey();
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
const kbdBtns = Array.from(document.querySelectorAll('.kbd[data-key]:not([data-key="todo"])'));
const todoKbdBtn = document.querySelector('.kbd[data-key="todo"]');

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
      // 如果之前在录制待办快捷键，先结束它（恢复待办热键）
      if (recordingBtn === todoKbdBtn) { endRecording(); }
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
  const dateEl = document.getElementById('ann-date');
  const repeatEl = document.getElementById('ann-repeat');

  const name = nameEl.value.trim();
  const repeat = repeatEl.checked;
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
  repeatEl.checked = true;
  renderAnnList();
}

document.getElementById('ann-add-btn').addEventListener('click', addAnn);
document.getElementById('ann-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addAnn(); });

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
// 翻译面板（内嵌到设置面板 translate 标签页）
// ---------------------------------------------------------------------------
let trModelDownloaded = false;
let trModelLoaded = false;
let trIsTranslating = false;
let trIsDownloading = false;
let trCurrentTargetLang = 'English';
const TR_MAX_CHARS = 3500;

const I18N_TO_MT_LANG = {
  'zh-CN': 'Chinese',
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'ru': 'Russian',
};

function trUpdateButtonStates() {
  const elModelBtn = document.getElementById('model-btn');
  const elDownloadBtn = document.getElementById('download-btn');
  const elTranslateBtn = document.getElementById('translate-btn');
  const elSourceText = document.getElementById('source-text');
  const elCopyBtn = document.getElementById('copy-btn');
  const elLoading = document.getElementById('loading-indicator');
  const elResultText = document.getElementById('result-text');

  if (!trModelDownloaded) {
    elModelBtn.style.display = 'none';
    elDownloadBtn.style.display = '';
  } else if (trModelLoaded) {
    elModelBtn.textContent = window.I18N ? window.I18N.t('translate_unload_model') : '卸载模型';
    elModelBtn.style.display = '';
    elDownloadBtn.style.display = 'none';
  } else {
    elModelBtn.textContent = window.I18N ? window.I18N.t('translate_load_model') : '加载模型';
    elModelBtn.style.display = '';
    elDownloadBtn.style.display = 'none';
  }
  elTranslateBtn.disabled = !trModelLoaded || trIsTranslating || trIsDownloading;
  if (trIsTranslating) {
    elTranslateBtn.textContent = window.I18N ? window.I18N.t('translate_loading') : '翻译中...';
  } else {
    elTranslateBtn.textContent = window.I18N ? window.I18N.t('translate_btn') : '翻译';
  }
  elSourceText.disabled = !trModelLoaded || trIsTranslating;
  if (elCopyBtn) elCopyBtn.disabled = !elResultText.value.trim();
  elLoading.classList.toggle('hidden', !trIsTranslating);
}

function trUpdateModelStatus() {
  const elModelStatus = document.getElementById('model-status');
  if (trModelLoaded) {
    elModelStatus.innerHTML = `<span class="model-status-tag loaded">${window.I18N ? window.I18N.t('translate_model_ready') : '模型就绪'}</span>`;
  } else if (trModelDownloaded) {
    elModelStatus.innerHTML = `<span class="model-status-tag downloaded">${window.I18N ? window.I18N.t('translate_model_downloaded') : '已下载'}</span>`;
  } else {
    elModelStatus.innerHTML = `<span class="model-status-tag none">${window.I18N ? window.I18N.t('translate_no_model') : '模型未加载'}</span>`;
  }
}

function trUpdateCharCount() {
  const elSourceText = document.getElementById('source-text');
  const elCharCount = document.getElementById('char-count');
  if (!elSourceText || !elCharCount) return;
  const n = elSourceText.value.length;
  elCharCount.textContent = `${n} / ${TR_MAX_CHARS}`;
  elCharCount.classList.toggle('warn', n > TR_MAX_CHARS);
}

async function trRefreshStatus() {
  try {
    const status = await invoke('get_translate_status');
    trModelDownloaded = status.downloaded;
    trModelLoaded = status.loaded;
    trUpdateButtonStates();
    trUpdateModelStatus();
  } catch (e) { console.error('refreshStatus error:', e); }
}

function trShowError(msg) {
  const elResultText = document.getElementById('result-text');
  if (!elResultText) return;
  elResultText.value = typeof msg === 'string' ? msg : (msg.error || 'Unknown error');
  elResultText.style.color = '#ff3b30';
  setTimeout(() => { elResultText.style.color = ''; }, 3000);
}

async function trToggleModel() {
  if (trModelLoaded) {
    try {
      await invoke('unload_translate_model');
      trModelLoaded = false;
      trUpdateButtonStates();
      trUpdateModelStatus();
    } catch (e) { trShowError(e); }
  } else {
    try {
      await invoke('load_translate_model');
      trModelLoaded = true;
      trUpdateButtonStates();
      trUpdateModelStatus();
    } catch (e) {
      trShowError(e);
      await trRefreshStatus();
    }
  }
}

async function trStartDownload() {
  trIsDownloading = true;
  trUpdateButtonStates();
  const elProgressSection = document.getElementById('progress-section');
  const elProgressFill = document.getElementById('progress-fill');
  const elProgressText = document.getElementById('progress-text');
  const elModelBtn = document.getElementById('model-btn');
  const elDownloadBtn = document.getElementById('download-btn');
  elProgressSection.classList.remove('hidden');
  elProgressFill.style.width = '0%';
  elProgressText.textContent = '0%';
  elModelBtn.style.display = 'none';
  elDownloadBtn.style.display = 'none';

  try {
    const result = await invoke('download_model');
    if (result.success) {
      trModelDownloaded = true;
      elProgressText.textContent = '100%';
      trUpdateButtonStates();
      trUpdateModelStatus();
      await trToggleModel();
    }
  } catch (e) { trShowError(e); }
  finally {
    trIsDownloading = false;
    trUpdateButtonStates();
    setTimeout(() => elProgressSection.classList.add('hidden'), 2000);
  }
}

async function trDoTranslate() {
  const elSourceText = document.getElementById('source-text');
  const elResultText = document.getElementById('result-text');
  const text = elSourceText.value.trim();
  if (!text || trIsTranslating) return;
  if (!trModelLoaded) {
    try {
      await invoke('load_translate_model');
      trModelLoaded = true;
      trUpdateButtonStates();
      trUpdateModelStatus();
    } catch (e) {
      trShowError(e);
      await trRefreshStatus();
      return;
    }
  }

  trIsTranslating = true;
  trUpdateButtonStates();
  elResultText.value = '';

  try {
    await invoke('translate_text', { text: text, tgtLang: trCurrentTargetLang });
  } catch (e) {
    trShowError(e);
    trIsTranslating = false;
    trUpdateButtonStates();
  }
}

async function trCopyResult() {
  const elResultText = document.getElementById('result-text');
  const elCopyBtn = document.getElementById('copy-btn');
  const text = elResultText.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    elCopyBtn.textContent = window.I18N ? window.I18N.t('translate_copied') : '已复制';
    setTimeout(() => {
      elCopyBtn.textContent = window.I18N ? window.I18N.t('translate_copy') : '复制结果';
    }, 2000);
  } catch (e) {
    elResultText.select();
    document.execCommand('copy');
  }
}

async function initTranslate() {
  const elTgtLabel = document.getElementById('tgt-lang-label');
  const elSourceText = document.getElementById('source-text');
  const elTranslateBtn = document.getElementById('translate-btn');
  const elModelBtn = document.getElementById('model-btn');
  const elDownloadBtn = document.getElementById('download-btn');
  const elCopyBtn = document.getElementById('copy-btn');

  // No translate elements? Skip (tab HTML not present in this page)
  if (!elTranslateBtn || !elModelBtn) return;

  try {
    const s = await invoke('load_settings');
    const appLang = s.lang || 'zh-CN';
    trCurrentTargetLang = I18N_TO_MT_LANG[appLang] || 'English';
  } catch (e) { }
  elTgtLabel.textContent = trCurrentTargetLang;

  await trRefreshStatus();

  if (appEvent && typeof appEvent.listen === 'function') {
    appEvent.listen('translate-result', (event) => {
      document.getElementById('result-text').value = event.payload.text;
      document.getElementById('copy-btn').disabled = false;
      trIsTranslating = false;
      trUpdateButtonStates();
    });
    appEvent.listen('translate-error', (event) => {
      const payload = typeof event.payload === 'string' ? event.payload : (event.payload.error || 'Translation failed');
      if (payload.indexOf('Model not loaded') !== -1) {
        trModelLoaded = false;
        trUpdateButtonStates();
        trUpdateModelStatus();
      }
      trShowError(payload);
      trIsTranslating = false;
      trUpdateButtonStates();
    });
    appEvent.listen('translate-model-download-progress', (event) => {
      const { downloaded, total } = event.payload;
      const elProgressFill = document.getElementById('progress-fill');
      const elProgressText = document.getElementById('progress-text');
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 100);
        elProgressFill.style.width = pct + '%';
        const mb = (downloaded / 1048576).toFixed(0);
        const totalMb = (total / 1048576).toFixed(0);
        elProgressText.textContent = `${pct}% (${mb} / ${totalMb} MB)`;
      } else {
        const mb = (downloaded / 1048576).toFixed(0);
        elProgressText.textContent = `${mb} MB`;
      }
    });
    appEvent.listen('translate-model-status', (event) => {
      const p = event.payload;
      const elProgressSection = document.getElementById('progress-section');
      const elProgressFill = document.getElementById('progress-fill');
      const elProgressText = document.getElementById('progress-text');
      const elModelStatus = document.getElementById('model-status');
      if (p.stage === 'ready') {
        trModelLoaded = true;
        elProgressSection.classList.add('hidden');
        elProgressFill.classList.remove('animated');
        trUpdateButtonStates();
        trUpdateModelStatus();
      } else if (p.stage === 'loading') {
        trModelLoaded = false;
        elProgressSection.classList.remove('hidden');
        elProgressFill.classList.add('animated');
        elProgressFill.style.width = '';
        const d = p.detail;
        const labels = {
          init_backend: window.I18N ? window.I18N.t('translate_init_backend') : '正在初始化推理引擎…',
          loading_model: window.I18N ? window.I18N.t('translate_loading_model_file') : '正在加载模型文件 (~1.1 GB)…',
          creating_context: window.I18N ? window.I18N.t('translate_creating_context') : '正在创建推理上下文…',
        };
        elProgressText.textContent = labels[d] || (window.I18N ? window.I18N.t('translate_loading_model') : '加载中…');
        elModelStatus.innerHTML = `<span class="model-status-tag none">${window.I18N ? window.I18N.t('translate_loading_model') : '加载中…'}</span>`;
      }
    });
    // Reload target language on settings change
    try {
      appEvent.listen('settings-updated', async () => {
        try {
          const s = await invoke('load_settings');
          const appLang = s.lang || 'zh-CN';
          trCurrentTargetLang = I18N_TO_MT_LANG[appLang] || 'English';
          elTgtLabel.textContent = trCurrentTargetLang;
        } catch (e) { }
      });
    } catch (e) { }
  }

  elTranslateBtn.addEventListener('click', trDoTranslate);
  elModelBtn.addEventListener('click', trToggleModel);
  elDownloadBtn.addEventListener('click', trStartDownload);
  elCopyBtn.addEventListener('click', trCopyResult);
  elSourceText.addEventListener('input', trUpdateCharCount);

  elSourceText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      trDoTranslate();
    }
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
