// 所有窗口共用：启动时读取设置里的语言/主题并套用，监听跨窗口的“设置已变更”事件。
// 需在 i18n.js 之后、各页面自身脚本之前引入。
(function () {
  const core = window.__TAURI__ && window.__TAURI__.core;
  const event = window.__TAURI__ && window.__TAURI__.event;

  function resolveTheme(theme) {
    if (theme === 'dark' || theme === 'light') return theme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', resolveTheme(theme || 'system'));
    try { localStorage.setItem('todos.theme', theme || 'system'); } catch (e) {}
  }

  function resolveLang(settings) {
    if ((settings && settings.langMode) === 'system' || !(settings && settings.lang)) {
      return window.I18N.normalizeLang(navigator.language || 'en');
    }
    return window.I18N.normalizeLang(settings.lang);
  }

  function applyLang(lang) {
    if (window.I18N) {
      window.I18N.setLang(lang);
      window.I18N.applyI18n(document);
      document.documentElement.setAttribute('lang', lang);
    }
    try { localStorage.setItem('todos.lang', lang); } catch (e) {}
  }

  let currentTheme = 'system';

  async function loadAndApply() {
    let settings = {};
    try { settings = (core && (await core.invoke('load_settings'))) || {}; } catch (e) {}
    currentTheme = settings.theme || 'system';
    applyTheme(currentTheme);
    applyLang(resolveLang(settings));
    document.dispatchEvent(new CustomEvent('app-settings-updated'));
  }

  // 脚本加载即套用缓存值，尽量减少首屏闪烁
  try {
    const ct = localStorage.getItem('todos.theme');
    if (ct) document.documentElement.setAttribute('data-theme', resolveTheme(ct));
    const cl = localStorage.getItem('todos.lang');
    if (cl && window.I18N) window.I18N.setLang(cl);
  } catch (e) {}

  // “随系统”时跟随系统明暗变化
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => { if (currentTheme === 'system') applyTheme('system'); });
  }

  function start() {
    loadAndApply();
    if (event) event.listen('settings-updated', () => loadAndApply());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.AppUI = { applyTheme, applyLang, resolveTheme, reload: loadAndApply };
})();
