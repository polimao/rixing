// translate/translate.js
// 翻译面板逻辑（从 settings.js 拆出，仍作为「设置」窗口的 translate 标签页）
// 依赖全局：window.I18N（i18n.js）、appEvent（ui-common.js）、invoke（Tauri）、theme.css 变量
// 由 settings.html 以 <script src="translate/translate.js"> 在 settings.js 之前加载

const TR_TRANSLATE_PANEL_HTML = `
  <div class="tr-wrap">

      <div class="tr-card src">
        <textarea class="tr-source" id="source-text" data-i18n-placeholder="translate_placeholder"
          placeholder="输入..."></textarea>
      </div>
      <div>
      <button class="tr-fab" id="translate-btn" aria-label="翻译">
        <span class="tr-btn-text" data-i18n="translate_btn">翻译</span>
      </button>
        <button class="tr-copy-btn" id="copy-btn" data-i18n="translate_copy" disabled>复制结果</button>
        </div>
      <div class="tr-card-result tgt">

        <textarea class="tr-result" id="result-text" readonly data-i18n-placeholder="translate_result_placeholder"
          placeholder="结果..."></textarea>
      </div>


    <!-- 以下元素仅因 JS 依赖 DOM 存在，永久隐藏 -->
    <span id="tgt-lang-label" class="tr-hidden">English</span>
    <span id="char-count" class="tr-hidden">0 / 30000</span>
    <span id="model-status" class="tr-hidden"></span>
    <div id="progress-section" class="tr-hidden">
      <div id="progress-fill" style="width:0%"></div>
      <div id="progress-text">0%</div>
    </div>
    <div id="loading-indicator" class="tr-hidden"></div>
  </div>
`;

// 将翻译面板标记注入 #translate-mount（脚本加载时该挂载点已存在于 DOM）
function injectTranslatePanel() {
  const mount = document.getElementById('translate-mount');
  if (!mount || mount.dataset.injected) return;
  mount.innerHTML = TR_TRANSLATE_PANEL_HTML;
  mount.dataset.injected = '1';
  // 注入后立刻翻译本片段的 data-i18n / data-i18n-placeholder
  if (window.I18N && typeof window.I18N.applyI18n === 'function') {
    window.I18N.applyI18n(mount);
  }
}

// 同步注入，确保 settings.js 末尾的 initTranslate() 能找到面板元素
injectTranslatePanel();

// ===== 以下为原 settings.js 的翻译逻辑 =====

let trModelDownloaded = false;
let trModelLoaded = false;
let trIsTranslating = false;
let trIsDownloading = false;
let trIsUnloading = false;
let trCurrentTargetLang = 'English';
const TR_MAX_CHARS = 30000;

function trUpdateButtonStates() {
  const elTranslateBtn = document.getElementById('translate-btn');
  const elSourceText = document.getElementById('source-text');
  const elCopyBtn = document.getElementById('copy-btn');
  const elResultText = document.getElementById('result-text');

  const busy = trIsTranslating || trIsDownloading || trIsUnloading;
  elTranslateBtn.disabled = busy;
  elTranslateBtn.classList.toggle('is-loading', busy);
  const elTrBtnText = elTranslateBtn.querySelector('.tr-btn-text');
  if (trIsTranslating) {
    elTrBtnText.textContent = window.I18N ? window.I18N.t('translate_loading') : '翻译中...';
  } else if (trIsDownloading || trIsUnloading) {
    elTrBtnText.textContent = '准备中...';
  } else {
    elTrBtnText.textContent = window.I18N ? window.I18N.t('translate_btn') : '翻译';
  }
  elSourceText.disabled = busy;
  if (elCopyBtn) elCopyBtn.disabled = !elResultText.value.trim();
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
  // 实时更新目标语言提示（智能检测）
  const elTgt = document.getElementById('tgt-lang-label');
  if (elTgt) elTgt.textContent = trDetectTargetLang(elSourceText.value.trim());
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

// 智能检测目标语言：输入文本中中文占比 > 50% → 译为英文，否则 → 译为中文
function trDetectTargetLang(text) {
  if (!text) return 'English';
  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
  return (cjk / text.length) > 0.5 ? 'English' : 'Chinese';
}

// 单次翻译成功后自动卸载模型，释放显存/内存
async function trAutoUnload() {
  if (!trModelLoaded) return;
  trIsUnloading = true;
  trUpdateButtonStates();
  try {
    await invoke('unload_translate_model');
  } catch (e) { console.warn('auto unload failed:', e); }
  finally {
    trModelLoaded = false;
    trIsUnloading = false;
    trUpdateButtonStates();
    trUpdateModelStatus();
  }
}

// 确保模型可用：未下载则先下载并自动加载，已下载未加载则加载；全程对用户透明
async function trEnsureModel() {
  if (trModelLoaded) return true;
  if (!trModelDownloaded) {
    await trStartDownload();
    return trModelLoaded;
  }
  try {
    await invoke('load_translate_model');
    trModelLoaded = true;
    trUpdateButtonStates();
    trUpdateModelStatus();
    return true;
  } catch (e) {
    trShowError(e);
    await trRefreshStatus();
    return false;
  }
}

async function trStartDownload() {
  trIsDownloading = true;
  trUpdateButtonStates();
  const elProgressFill = document.getElementById('progress-fill');
  const elProgressText = document.getElementById('progress-text');
  elProgressFill.style.width = '0%';
  elProgressText.textContent = '0%';

  try {
    const result = await invoke('download_model');
    if (result.success) {
      trModelDownloaded = true;
      elProgressText.textContent = '100%';
      trUpdateButtonStates();
      trUpdateModelStatus();
      // 下载完成后自动加载模型
      try {
        await invoke('load_translate_model');
        trModelLoaded = true;
        trUpdateButtonStates();
        trUpdateModelStatus();
      } catch (e) { trShowError(e); }
    }
  } catch (e) { trShowError(e); }
  finally {
    trIsDownloading = false;
    trUpdateButtonStates();
  }
}

async function trDoTranslate() {
  const elSourceText = document.getElementById('source-text');
  const elResultText = document.getElementById('result-text');
  const text = elSourceText.value.trim();
  if (!text || trIsTranslating || trIsDownloading || trIsUnloading) return;

  // 智能选择目标语言
  const tgt = trDetectTargetLang(text);
  trCurrentTargetLang = tgt;

  // 点击翻译后自动确保模型就绪（下载/加载对用户透明，无需手动选择）
  const ok = await trEnsureModel();
  if (!ok) return;

  trIsTranslating = true;
  trUpdateButtonStates();
  elResultText.value = '';

  try {
    await invoke('translate_text', { text: text, tgtLang: tgt });
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
      elCopyBtn.textContent = window.I18N ? window.I18N.t('translate_copy') : '复制';
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
  const elCopyBtn = document.getElementById('copy-btn');

  // No translate elements? Skip (tab HTML not present in this page)
  if (!elTranslateBtn) return;

  // 目标语言由输入文本智能决定，初始化时先显示一次
  elTgtLabel.textContent = trDetectTargetLang(elSourceText.value.trim());

  await trRefreshStatus();

  if (appEvent && typeof appEvent.listen === 'function') {
    appEvent.listen('translate-result', (event) => {
      document.getElementById('result-text').value = event.payload.text;
      document.getElementById('copy-btn').disabled = false;
      trIsTranslating = false;
      trUpdateButtonStates();
      // 单次翻译成功后自动卸载模型
      trAutoUnload();
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
      const elProgressFill = document.getElementById('progress-fill');
      const elProgressText = document.getElementById('progress-text');
      const elModelStatus = document.getElementById('model-status');
      if (p.stage === 'ready') {
        trModelLoaded = true;
        trUpdateButtonStates();
        trUpdateModelStatus();
      } else if (p.stage === 'loading') {
        trModelLoaded = false;
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
  }

  elTranslateBtn.addEventListener('click', trDoTranslate);
  elCopyBtn.addEventListener('click', trCopyResult);
  elSourceText.addEventListener('input', trUpdateCharCount);

  elSourceText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      trDoTranslate();
    }
  });
}
