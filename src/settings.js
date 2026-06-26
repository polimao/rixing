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
    await window.__TAURI__.window.getCurrentWindow().setTitle(window.I18N.t('settings'));
  } catch (e) { /* ignore */ }
}

async function init() {
  await loadSettings();
  buildFlags();
  applyWindowTitle();
  try {
    const st = await invoke('get_settings_state');
    syncing = true; elAutostart.checked = !!(st && st.autostart); syncing = false;
  } catch (e) { console.error(e); }
  syncing = true; elShowCount.checked = !!settings.showCount; syncing = false;
  syncControls();
  await initTiling();
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
  buildFlags();       // 用新语言重写“跟随系统”等 title
  syncControls();
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
