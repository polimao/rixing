// 轻听 — MRT2 AI 实时音乐生成前端
(function () {
  const core = window.__TAURI__ && window.__TAURI__.core;
  const event = window.__TAURI__ && window.__TAURI__.event;

  // ── presets ──
  const PRESETS = {
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

  // 安装阶段的友好文案（与后端 emit 的 step 对应）
  const STAGE_LABELS = {
    venv: '创建 Python 环境',
    install: '安装依赖',
    resources: '下载共享资源',
    model: '下载 MRT2 模型',
  };

  // ── state ──
  let bridgeReady = false;
  let playing = false;
  let currentPrompt = '';
  let drumsOn = true;
  let volume = 0.8;
  let settingUp = false;
  // setup 完成后自动用这个 prompt 开始播放（点播放按钮触发 setup 时设上）
  let pendingPlayPrompt = null;

  // ── DOM refs ──
  const $ = (s) => document.querySelector(s);
  const playBtn = $('#play-btn');
  const nowPlaying = $('#now-playing');
  const setupBanner = $('#setup-banner');
  const mainUi = $('#main-ui');
  const statusDot = $('#status-dot');
  const statusText = $('#status-text');
  const customPrompt = $('#custom-prompt');
  const drumsToggle = $('#drums-toggle');
  const drumsTrack = $('#drums-track');
  const volumeSlider = $('#volume-slider');
  const progressSection = $('#progress-section');
  const progressStage = $('#progress-stage');
  const progressFill = $('#progress-fill');
  const progressText = $('#progress-text');
  const errorBanner = $('#error-banner');
  const errorText = $('#error-text');

  // ── helpers ──
  function t(key) {
    return (window.I18N && window.I18N.t(key)) || key;
  }

  function setStatus(stage, message) {
    statusDot.className = 'status-dot ' + stage;
    if (message) statusText.textContent = message;
  }

  function updatePlayBtn() {
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.classList.toggle('playing', playing);
  }

  function updateDrumsUI() {
    drumsTrack.classList.toggle('on', drumsOn);
    if (drumsToggle) drumsToggle.setAttribute('aria-checked', drumsOn ? 'true' : 'false');
  }

  // 显示流式安装进度（loading 阶段）
  function showProgress(label, message) {
    errorBanner.classList.add('hidden');
    setupBanner.classList.add('hidden');
    mainUi.classList.add('hidden');
    mainUi.style.display = 'none';
    progressSection.classList.remove('hidden');
    if (label) progressStage.textContent = label;
    if (message) progressText.textContent = message;
    // 默认不定进度（动画），有 percent 时由 setProgressPercent 切确定值
    progressFill.classList.add('animated');
    progressFill.style.width = '';
  }

  function setProgressPercent(percent, message) {
    progressFill.classList.remove('animated');
    progressFill.style.width = Math.max(0, Math.min(100, percent)) + '%';
    if (message) {
      progressText.textContent = percent >= 0
        ? percent + '% · ' + message
        : message;
    }
  }

  function hideProgress() {
    progressSection.classList.add('hidden');
    progressFill.classList.remove('animated');
    progressFill.style.width = '0%';
    progressText.textContent = '';
  }

  function showError(message) {
    hideProgress();
    setupBanner.classList.add('hidden');
    mainUi.classList.add('hidden');
    mainUi.style.display = 'none';
    errorText.textContent = message || '未知错误';
    errorBanner.classList.remove('hidden');
    setStatus('error', message ? String(message).slice(0, 60) : '出错');
  }

  function showMainUi() {
    setupBanner.classList.add('hidden');
    errorBanner.classList.add('hidden');
    hideProgress();
    mainUi.classList.remove('hidden');
    mainUi.style.display = 'flex';
  }

  // ── build preset cards ──
  function buildPresets() {
    for (const [group, items] of Object.entries(PRESETS)) {
      const grid = $('#preset-' + group);
      if (!grid) continue;
      items.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'preset-card';
        card.innerHTML =
          '<div class="preset-title">' + item.title + '</div>' +
          '<div class="preset-desc">' + item.desc + '</div>';
        card.addEventListener('click', () => selectPreset(item.prompt, card, grid));
        grid.appendChild(card);
      });
    }
  }

  function selectPreset(prompt, cardEl, grid) {
    // highlight active
    grid.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));
    cardEl.classList.add('active');
    customPrompt.value = '';

    currentPrompt = prompt;
    nowPlaying.innerHTML = '<strong>' + cardEl.querySelector('.preset-title').textContent + '</strong>';

    if (bridgeReady && playing) {
      core.invoke('focus_set_prompt', { text: prompt });
    } else if (bridgeReady) {
      startMusic(prompt);
    } else {
      // 桥接未就绪：触发 setup，完成后用该 prompt 自动播放
      pendingPlayPrompt = prompt;
      initBridge(prompt);
    }
  }

  // ── transport ──
  async function togglePlay() {
    if (settingUp) return;
    if (!bridgeReady) {
      const prompt = currentPrompt || PRESETS.vibe[0].prompt;
      pendingPlayPrompt = prompt;
      await initBridge(prompt);
      return;
    }
    if (playing) {
      await core.invoke('focus_stop');
    } else {
      const prompt = currentPrompt || PRESETS.vibe[0].prompt;
      await startMusic(prompt);
    }
  }

  async function startMusic(prompt) {
    currentPrompt = prompt;
    try {
      await core.invoke('focus_start', { prompt: prompt, drums: drumsOn });
    } catch (e) {
      showError(String(e));
    }
  }

  // ── controls ──
  function onDrumsToggle() {
    drumsOn = !drumsOn;
    updateDrumsUI();
    if (bridgeReady) core.invoke('focus_set_drums', { on: drumsOn });
  }

  function onVolumeChange() {
    volume = parseInt(volumeSlider.value) / 100;
    if (bridgeReady) core.invoke('focus_set_volume', { level: volume });
  }

  function applyCustomPrompt() {
    const text = customPrompt.value.trim();
    if (!text) return;
    currentPrompt = text;
    nowPlaying.innerHTML = '<strong>' + text + '</strong>';
    // clear preset highlight
    document.querySelectorAll('.preset-card').forEach((c) => c.classList.remove('active'));

    if (bridgeReady && playing) {
      core.invoke('focus_set_prompt', { text: text });
    } else if (bridgeReady) {
      startMusic(text);
    } else {
      pendingPlayPrompt = text;
      initBridge(text);
    }
  }

  // ── bridge lifecycle ──
  // autoStartPrompt: setup 完成后自动用该 prompt 开始播放
  async function initBridge(autoStartPrompt) {
    settingUp = true;
    pendingPlayPrompt = autoStartPrompt || null;
    showProgress('正在准备环境…', '正在检查 Python 环境与模型…');
    setStatus('loading', '正在准备…');
    playBtn.disabled = true;

    try {
      await core.invoke('focus_init');
      // 后续状态由 focus-music-status 事件驱动（loading/ready/error/progress）
    } catch (e) {
      settingUp = false;
      playBtn.disabled = false;
      showError(String(e));
    }
  }

  // ── event listener: bridge status updates ──
  function onBridgeStatus(payload) {
    const stage = payload && payload.stage;
    const type = payload && payload.type;
    const message = payload && payload.message;
    const step = payload && payload.step;

    // 流式进度（百分比）— 来自 tqdm 解析
    if (type === 'progress') {
      const percent = payload.percent;
      if (typeof percent === 'number') {
        setProgressPercent(percent, message);
      }
      return;
    }

    switch (stage) {
      case 'loading': {
        // 用 step 映射友好的阶段标题，否则沿用上一次标题
        const label = (step && STAGE_LABELS[step]) || progressStage.textContent || '正在准备…';
        showProgress(label, message || progressText.textContent || '');
        setStatus('loading', message || '正在准备…');
        break;
      }
      case 'ready':
        bridgeReady = true;
        settingUp = false;
        playBtn.disabled = false;
        showMainUi();
        setStatus('ready', '模型就绪 — 选择预设或输入提示词开始');
        // 如果是用户点播放/预设触发的 setup，完成后自动播放
        if (pendingPlayPrompt) {
          const p = pendingPlayPrompt;
          pendingPlayPrompt = null;
          startMusic(p);
        }
        break;
      case 'playing':
        playing = true;
        updatePlayBtn();
        setStatus('playing', '正在生成…');
        break;
      case 'stopped':
        playing = false;
        updatePlayBtn();
        nowPlaying.innerHTML = '<span>' + t('focus_ready') + '</span>';
        setStatus('ready', '已停止');
        break;
      case 'error':
        settingUp = false;
        playBtn.disabled = false;
        showError(message || '出错');
        break;
    }
  }

  // ── init ──
  async function init() {
    buildPresets();
    updateDrumsUI();

    playBtn.addEventListener('click', togglePlay);
    // 鼓点开关：用 div + 单一 click 处理器，不再用 <label>+<input>。
    // 原生 label/checkbox 在 WebKit 下点击会触发 change 两次（False→True 抵消），
    // 改为单一处理器保证一次点击只切换一次。
    drumsToggle.addEventListener('click', function (e) {
      // 点 knob/track 等子元素时也归到 div 处理，避免重复
      onDrumsToggle();
    });
    drumsToggle.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onDrumsToggle();
      }
    });
    volumeSlider.addEventListener('input', onVolumeChange);
    $('#apply-prompt-btn').addEventListener('click', applyCustomPrompt);
    customPrompt.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') applyCustomPrompt();
    });

    document.getElementById('setup-btn').addEventListener('click', () => initBridge(null));
    document.getElementById('retry-btn').addEventListener('click', () => initBridge(pendingPlayPrompt));
    document.getElementById('open-docs-btn').addEventListener('click', function () {
      if (core) core.invoke('open_url', { url: 'https://magenta.github.io/magenta-realtime/' });
    });

    // listen for bridge status events
    if (event) {
      event.listen('focus-music-status', function (e) {
        onBridgeStatus(e.payload);
      });
    }

    // 打开时检查环境是否已就绪，决定显示横幅还是主 UI
    if (core) {
      try {
        const s = await core.invoke('focus_setup_status');
        if (s && s.bridge_running) {
          // 桥接已在跑（上次启动残留或已 init），等事件同步状态
          bridgeReady = true;
          showMainUi();
          setStatus('ready', '模型就绪');
        } else if (s && s.ready) {
          // 环境齐备但桥接未跑：直接显示主 UI，点播放时再 init（init 会跳过安装直接拉起桥接）
          bridgeReady = false;
          showMainUi();
          setStatus('ready', '就绪 — 点播放开始');
        } else {
          // 需要安装：显示横幅
          setupBanner.classList.remove('hidden');
          mainUi.classList.add('hidden');
          mainUi.style.display = 'none';
          setStatus('loading', '需要先准备环境');
        }
      } catch (e) {
        // 后端命令异常：退回显示横幅
        setupBanner.classList.remove('hidden');
      }

      // 同步当前播放状态（如果桥接已在跑）
      try {
        const st = await core.invoke('focus_get_status');
        if (st && st.playing) {
          playing = true;
          updatePlayBtn();
          setStatus('playing', '正在生成…');
        }
      } catch (e) { /* ignore */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
