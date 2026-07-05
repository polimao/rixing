// 翻译窗口逻辑
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event || window.__TAURI__.appEvent || {};

// ── State ──
let modelDownloaded = false;
let modelLoaded = false;
let isTranslating = false;
let isDownloading = false;
let currentTargetLang = 'English';
const MAX_CHARS = 3500;

// i18n lang → HY-MT target language name
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

// ── DOM refs ──
const elSrcLang = document.getElementById('src-lang');
const elTgtLabel = document.getElementById('tgt-lang-label');
const elSourceText = document.getElementById('source-text');
const elResultText = document.getElementById('result-text');
const elTranslateBtn = document.getElementById('translate-btn');
const elModelBtn = document.getElementById('model-btn');
const elDownloadBtn = document.getElementById('download-btn');
const elCopyBtn = document.getElementById('copy-btn');
const elLoading = document.getElementById('loading-indicator');
const elProgressSection = document.getElementById('progress-section');
const elProgressFill = document.getElementById('progress-fill');
const elProgressText = document.getElementById('progress-text');
const elModelStatus = document.getElementById('model-status');
const elCharCount = document.getElementById('char-count');

// ── Helpers ──
function updateButtonStates() {
  // Model button
  if (!modelDownloaded) {
    elModelBtn.style.display = 'none';
    elDownloadBtn.style.display = '';
  } else if (modelLoaded) {
    elModelBtn.textContent = window.I18N ? window.I18N.t('translate_unload_model') : '卸载模型';
    elModelBtn.style.display = '';
    elDownloadBtn.style.display = 'none';
  } else {
    elModelBtn.textContent = window.I18N ? window.I18N.t('translate_load_model') : '加载模型';
    elModelBtn.style.display = '';
    elDownloadBtn.style.display = 'none';
  }

  // Translate button
  elTranslateBtn.disabled = !modelLoaded || isTranslating || isDownloading;
  if (isTranslating) {
    elTranslateBtn.textContent = window.I18N ? window.I18N.t('translate_loading') : '翻译中...';
  } else {
    elTranslateBtn.textContent = window.I18N ? window.I18N.t('translate_btn') : '翻译';
  }

  // Source text
  elSourceText.disabled = !modelLoaded || isTranslating;

  // Copy button
  elCopyBtn.disabled = !elResultText.value.trim();

  // Loading indicator
  elLoading.classList.toggle('hidden', !isTranslating);
}

function updateModelStatus() {
  if (modelLoaded) {
    elModelStatus.innerHTML = `<span class="model-status-tag loaded">${window.I18N ? window.I18N.t('translate_model_ready') : '模型就绪'}</span>`;
  } else if (modelDownloaded) {
    elModelStatus.innerHTML = `<span class="model-status-tag downloaded">${window.I18N ? window.I18N.t('translate_model_downloaded') : '已下载'}</span>`;
  } else {
    elModelStatus.innerHTML = `<span class="model-status-tag none">${window.I18N ? window.I18N.t('translate_no_model') : '模型未加载'}</span>`;
  }
}

function updateCharCount() {
  const n = elSourceText.value.length;
  elCharCount.textContent = `${n} / ${MAX_CHARS}`;
  elCharCount.classList.toggle('warn', n > MAX_CHARS);
}

async function refreshStatus() {
  try {
    const status = await invoke('get_translate_status');
    modelDownloaded = status.downloaded;
    modelLoaded = status.loaded;
    updateButtonStates();
    updateModelStatus();
  } catch (e) {
    console.error('refreshStatus error:', e);
  }
}

function showError(msg) {
  elResultText.value = typeof msg === 'string' ? msg : (msg.error || 'Unknown error');
  elResultText.style.color = '#ff3b30';
  setTimeout(() => { elResultText.style.color = ''; }, 3000);
}

// ── Actions ──
async function toggleModel() {
  if (modelLoaded) {
    try {
      await invoke('unload_translate_model');
      modelLoaded = false;
      updateButtonStates();
      updateModelStatus();
    } catch (e) {
      showError(e);
    }
  } else {
    try {
      await invoke('load_translate_model');
      modelLoaded = true;
      updateButtonStates();
      updateModelStatus();
    } catch (e) {
      showError(e);
      // Check if model needs downloading
      await refreshStatus();
    }
  }
}

async function startDownload() {
  isDownloading = true;
  updateButtonStates();
  elProgressSection.classList.remove('hidden');
  elProgressFill.style.width = '0%';
  elProgressText.textContent = '0%';
  elModelBtn.style.display = 'none';
  elDownloadBtn.style.display = 'none';

  try {
    const result = await invoke('download_model');
    if (result.success) {
      modelDownloaded = true;
      elProgressText.textContent = '100%';
      updateButtonStates();
      updateModelStatus();
      await toggleModel(); // auto-load after download
    }
  } catch (e) {
    showError(e);
  } finally {
    isDownloading = false;
    updateButtonStates();
    setTimeout(() => elProgressSection.classList.add('hidden'), 2000);
  }
}

async function doTranslate() {
  const text = elSourceText.value.trim();
  if (!text || isTranslating) return;
  if (!modelLoaded) {
    try {
      await invoke('load_translate_model');
      modelLoaded = true;
      updateButtonStates();
      updateModelStatus();
    } catch (e) {
      showError(e);
      await refreshStatus();
      return;
    }
  }

  isTranslating = true;
  updateButtonStates();
  elResultText.value = '';

  try {
    await invoke('translate_text', {
      text: text,
      tgtLang: currentTargetLang,
    });
  } catch (e) {
    showError(e);
    isTranslating = false;
    updateButtonStates();
  }
}

async function copyResult() {
  const text = elResultText.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    elCopyBtn.textContent = window.I18N ? window.I18N.t('translate_copied') : '已复制';
    setTimeout(() => {
      elCopyBtn.textContent = window.I18N ? window.I18N.t('translate_copy') : '复制结果';
    }, 2000);
  } catch (e) {
    // fallback
    elResultText.select();
    document.execCommand('copy');
  }
}

// ── Event listeners ──
async function init() {
  // Load target language from settings
  try {
    const settings = await invoke('load_settings');
    const appLang = settings.lang || 'zh-CN';
    currentTargetLang = I18N_TO_MT_LANG[appLang] || 'English';
  } catch (e) {
    // use default
  }
  elTgtLabel.textContent = currentTargetLang;

  // Apply window title
  try {
    await window.__TAURI__.window.getCurrentWindow().setTitle(
      window.I18N ? window.I18N.t('translate_title') : '翻译'
    );
  } catch (e) { /* ignore */ }

  // Check model status
  await refreshStatus();

  // Listen for events
  if (typeof listen === 'function') {
    listen('translate-result', (event) => {
      elResultText.value = event.payload.text;
      elCopyBtn.disabled = false;
      isTranslating = false;
      updateButtonStates();
    });
    listen('translate-error', (event) => {
      const payload = typeof event.payload === 'string' ? event.payload : (event.payload.error || 'Translation failed');
      if (payload.indexOf('Model not loaded') !== -1) {
        modelLoaded = false;
        updateButtonStates();
        updateModelStatus();
      }
      showError(payload);
      isTranslating = false;
      updateButtonStates();
    });
    listen('translate-model-download-progress', (event) => {
      const { downloaded, total } = event.payload;
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
    listen('translate-model-status', (event) => {
      const p = event.payload;
      if (p.stage === 'ready') {
        modelLoaded = true;
        elProgressSection.classList.add('hidden');
        elProgressFill.classList.remove('animated');
        updateButtonStates();
        updateModelStatus();
      } else if (p.stage === 'loading') {
        modelLoaded = false;
        // Show animated indeterminate progress bar with stage-specific text
        elProgressSection.classList.remove('hidden');
        elProgressFill.classList.add('animated');
        elProgressFill.style.width = ''; // reset for animation
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
    // Listen for settings changes (language switch)
    try {
      let appEvent = window.__TAURI__ && window.__TAURI__.event;
      if (appEvent) {
        appEvent.listen('settings-updated', async () => {
          try {
            const settings = await invoke('load_settings');
            const appLang = settings.lang || 'zh-CN';
            currentTargetLang = I18N_TO_MT_LANG[appLang] || 'English';
            elTgtLabel.textContent = currentTargetLang;
          } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { /* ignore */ }
  }

  // Button handlers
  elTranslateBtn.addEventListener('click', doTranslate);
  elModelBtn.addEventListener('click', toggleModel);
  elDownloadBtn.addEventListener('click', startDownload);
  elCopyBtn.addEventListener('click', copyResult);
  elSourceText.addEventListener('input', updateCharCount);

  // Enter key on source text = translate
  elSourceText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      doTranslate();
    }
  });
}

init();
