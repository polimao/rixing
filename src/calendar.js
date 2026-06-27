// Retrieve Lunar and HolidayUtil from the global object populated by vendor/lunar.js
const { Lunar, HolidayUtil } = window;

// Tauri API
const { invoke } = window.__TAURI__.core;

let isExpanded = false;

// ---------------------------------------------------------------------------
// 念日
// ---------------------------------------------------------------------------
let currentAnns = [];

async function loadAnns() {
  try {
    const s = await invoke('load_settings');
    currentAnns = (s && Array.isArray(s.anniversaries)) ? s.anniversaries : [];
  } catch (e) { currentAnns = []; }
}

function nextOccurrence(ann) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!ann.repeat) {
    // 以本地时区构造，避免 new Date('YYYY-MM-DD') 按 UTC 解析导致倒计时差一天
    const [yy, mo, dy] = ann.date.split('-').map(Number);
    return new Date(yy, mo - 1, dy);
  }
  const [mm, dd] = ann.date.split('-').map(Number);
  let d = new Date(today.getFullYear(), mm - 1, dd);
  if (d < today) d = new Date(today.getFullYear() + 1, mm - 1, dd);
  return d;
}

function countdownLabel(targetDate) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(targetDate); t.setHours(0, 0, 0, 0);
  const days = Math.round((t - today) / 86400000);
  const tl = (key, n) => (window.I18N ? window.I18N.t(key) : key).replace('{n}', n);
  const ti = (key) => window.I18N ? window.I18N.t(key) : key;
  if (days === 0) return ti('ann_today');
  if (days === 1) return ti('ann_tomorrow');
  if (days < 7)  return tl('ann_days_later', days);
  if (days === 7) return ti('ann_next_week');
  if (days < 30) return tl('ann_weeks_later', Math.floor(days / 7));
  if (days < 60) return ti('ann_next_month');
  if (days < 365) return tl('ann_months_later', Math.round(days / 30));
  if (days < 730) return ti('ann_next_year');
  return tl('ann_years_later', Math.floor(days / 365));
}

function renderAnniversaryPanel() {
  const panel = document.getElementById('ann-panel');
  const listEl = document.getElementById('ann-panel-list');
  if (!panel || !listEl) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // 显示最近的若干个念日倒计时；一次性且已过期的不再显示
  const upcoming = currentAnns
    .map((ann) => ({ ann, next: nextOccurrence(ann) }))
    .filter(({ ann, next }) => ann.repeat || next >= today)
    .sort((a, b) => a.next - b.next)
    .slice(0, 5);

  if (upcoming.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = '';
  listEl.innerHTML = '';
  upcoming.forEach(({ ann, next }) => {
    const days = Math.round((next - today) / 86400000);
    const isNear = days <= 14;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;font-size:12px';
    row.innerHTML = `
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--cal-text,#444)">${ann.name}</span>
      <span style="white-space:nowrap;margin-left:8px;color:${isNear ? '#cc252c' : '#999'}">· ${countdownLabel(next)}</span>
    `;
    listEl.appendChild(row);
  });
}

// 当前界面语言对应的 BCP-47 locale（用于 Intl 日期格式化），缺省简体中文
function currentLocale() {
  return (window.I18N && window.I18N.getLang && window.I18N.getLang()) || 'zh-CN';
}

// 顶部「年 月」标题：按当前语言本地化（展开时显示「本月 – 次月」）
function monthYearLabel(date) {
  const locale = currentLocale();
  const ym = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(date);
  if (!isExpanded) return ym;
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const m2 = new Intl.DateTimeFormat(locale, { month: 'long' }).format(next);
  return `${ym} – ${m2}`;
}

// 星期表头：从 i18n 的 week 数组取值，按「周一为首列」的网格顺序排列
function renderWeekdays() {
  const container = document.querySelector('.weekdays');
  if (!container) return;
  const week = (window.I18N && window.I18N.t('week')) || ['日', '一', '二', '三', '四', '五', '六'];
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0]; // week 为周日起始，这里重排成周一起始
  container.innerHTML = mondayFirst.map((i) => `<div>${week[i]}</div>`).join('');
}

function renderCalendar(date) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11

  document.getElementById('month-year').innerText = monthYearLabel(date);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // 0 is Sunday, 1 is Monday. We want Monday to be first.
  let firstDayOfWeek = firstDay.getDay();
  if (firstDayOfWeek === 0) firstDayOfWeek = 7;

  const daysGrid = document.getElementById('days-grid');
  daysGrid.innerHTML = '';

  // Previous month days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = firstDayOfWeek - 1; i > 0; i--) {
    const d = prevMonthLastDay - i + 1;
    daysGrid.appendChild(createDayElement(year, month - 1, d, true));
  }

  // Current month days
  const today = new Date();
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === i;
    daysGrid.appendChild(createDayElement(year, month, i, false, isToday));
  }

  let endYear = year;
  let endMonth = month;

  // Next month days if expanded
  if (isExpanded) {
    const nextMonthDate = new Date(year, month + 1, 1);
    const nextYear = nextMonthDate.getFullYear();
    const nextMonth = nextMonthDate.getMonth();
    const lastDay2 = new Date(nextYear, nextMonth + 1, 0).getDate();

    for (let i = 1; i <= lastDay2; i++) {
      const isToday = today.getFullYear() === nextYear && today.getMonth() === nextMonth && today.getDate() === i;
      daysGrid.appendChild(createDayElement(nextYear, nextMonth, i, false, isToday));
    }

    endYear = nextYear;
    endMonth = nextMonth;
  }

  // Next month padding
  const totalCells = daysGrid.children.length;
  const rows = Math.ceil(totalCells / 7);
  const remainingCells = (rows * 7) - totalCells;

  for (let i = 1; i <= remainingCells; i++) {
    daysGrid.appendChild(createDayElement(endYear, endMonth + 1, i, true));
  }

  // 渲染念日面板（在高度计算前）
  renderAnniversaryPanel();

  // Calculate new height:
  // Base (header + divider + weekdays + padding + expand btn) ≈ 231
  // Row: 44px day + 4px gap = 48px
  // Ann panel: measured from DOM if visible
  const baseHeight = 231;
  const rowHeight = 48;
  const annPanel = document.getElementById('ann-panel');
  const annPanelH = (annPanel && annPanel.style.display !== 'none')
    ? Math.ceil(annPanel.getBoundingClientRect().height) + 8
    : 0;
  const targetHeight = baseHeight + rows * rowHeight + annPanelH;

  // Update window size using backend smooth resize command
  invoke('resize_window', { height: targetHeight }).catch(e => console.error(e));
}

function createDayElement(year, month, day, isOtherMonth, isToday = false) {
  // Handle month overflow/underflow correctly
  const actualDate = new Date(year, month, day);
  const y = actualDate.getFullYear();
  const m = actualDate.getMonth() + 1;
  const d = actualDate.getDate();

  const lunar = Lunar.fromDate(actualDate);

  const el = document.createElement('div');
  el.className = 'day';
  if (isOtherMonth) el.classList.add('other-month');
  if (isToday) el.classList.add('today');

  let lunarText = lunar.getDayInChinese();
  if (lunar.getDay() === 1) {
    lunarText = lunar.getMonthInChinese() + '月';
  }

  let isHoliday = false;
  let badge = '';
  let isWeekend = actualDate.getDay() === 0 || actualDate.getDay() === 6;

  // Check lunar festivals
  const festivals = lunar.getFestivals();
  if (festivals.length > 0) {
    lunarText = festivals[0];
  } else {
    // Check solar festivals
    const solarFestivals = lunar.getSolar().getFestivals();
    if (solarFestivals.length > 0) {
      lunarText = solarFestivals[0];
    } else {
      // Check JieQi (solar terms)
      const jieQi = lunar.getJieQi();
      if (jieQi) {
        lunarText = jieQi;
      }
    }
  }

  // Special logic for Spring Festival
  if (lunar.getMonth() === 1 && lunar.getDay() <= 7) {
    isHoliday = true;
  }
  if (lunar.getMonth() === 12 && lunar.getDay() >= 28) {
    isHoliday = true;
  }

  // Use HolidayUtil from lunar-javascript
  const holiday = HolidayUtil.getHoliday(y, m, d);
  if (holiday) {
    if (!holiday.isWork()) {
      isHoliday = true;
      badge = '休';
      // In China, sometimes a festival name is overridden by the holiday name
      if (!festivals.length && !lunar.getSolar().getFestivals().length) {
        lunarText = holiday.getName();
      }
    } else {
      isHoliday = false; // it's a working weekend
      isWeekend = false; // cancel weekend red
      badge = '班';
    }
  }

  if (isHoliday) {
    el.classList.add('holiday');
  } else if (isWeekend) {
    el.classList.add('weekend');
  }

  if (lunarText.length > 4) {
    lunarText = lunarText.substring(0, 3) + '...';
  }

  let badgeHtml = '';
  if (badge) {
    badgeHtml = `<div class="badge ${badge === '休' ? 'badge-rest' : 'badge-work'}">${badge}</div>`;
  }

  let dayNumText = d;
  let dayNumStyle = '';
  if (d === 1) {
    dayNumText = `${m}月`;
    dayNumStyle = 'font-size: 14px;';
  }

  // 检测当日是否有念日
  const mStr = String(m).padStart(2, '0');
  const dStr = String(d).padStart(2, '0');
  const hasAnn = currentAnns.some((ann) => {
    if (ann.repeat) {
      const [am, ad] = ann.date.split('-');
      return am === mStr && ad === dStr;
    }
    return ann.date === `${y}-${mStr}-${dStr}`;
  });
  if (hasAnn) el.classList.add('has-ann');

  el.innerHTML = `
    ${badgeHtml}
    ${hasAnn ? '<div class="ann-mark">♥</div>' : ''}
    <div class="day-num" style="${dayNumStyle}">${dayNumText}</div>
    <div class="day-lunar">${lunarText}</div>
  `;

  return el;
}

let currentViewDate = new Date();
let isAnimating = false;

async function changeMonth(offset) {
  if (isAnimating) return;
  isAnimating = true;

  const grid = document.getElementById('days-grid');
  const direction = offset > 0 ? 'next' : 'prev';
  const outX = direction === 'next' ? -20 : 20;
  const inX = direction === 'next' ? 20 : -20;

  // Animate out
  grid.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
  grid.style.transform = `translateX(${outX}px)`;
  grid.style.opacity = '0';

  await new Promise(r => setTimeout(r, 150));

  // Update date and render
  currentViewDate = new Date(currentViewDate.getFullYear(), currentViewDate.getMonth() + offset, 1);
  renderCalendar(currentViewDate);

  // Prepare animate in
  grid.style.transition = 'none';
  grid.style.transform = `translateX(${inX}px)`;

  // Force reflow
  void grid.offsetWidth;

  // Animate in
  grid.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
  grid.style.transform = 'translateX(0)';
  grid.style.opacity = '1';

  setTimeout(() => {
    isAnimating = false;
  }, 150);
}

document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
document.getElementById('next-month').addEventListener('click', () => changeMonth(1));

// 窗内「设置」入口：不再依赖右键托盘菜单也能进设置
document.getElementById('open-settings-btn').addEventListener('click', () => {
  invoke('open_settings', { tab: 'general' }).catch((e) => console.error('open_settings failed:', e));
});

// Return to today when clicking the month-year header
document.getElementById('month-year').addEventListener('click', async () => {
  if (isAnimating) return;

  const today = new Date();
  if (currentViewDate.getFullYear() === today.getFullYear() && currentViewDate.getMonth() === today.getMonth()) {
    return; // Already on current month
  }

  isAnimating = true;
  const grid = document.getElementById('days-grid');

  // Determine slide direction
  const offset = today.getTime() - currentViewDate.getTime();
  const direction = offset > 0 ? 'next' : 'prev';
  const outX = direction === 'next' ? -20 : 20;
  const inX = direction === 'next' ? 20 : -20;

  // Animate out
  grid.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
  grid.style.transform = `translateX(${outX}px)`;
  grid.style.opacity = '0';

  await new Promise(r => setTimeout(r, 150));

  // Update date and render
  currentViewDate = today;
  renderCalendar(currentViewDate);

  // Prepare animate in
  grid.style.transition = 'none';
  grid.style.transform = `translateX(${inX}px)`;

  // Force reflow
  void grid.offsetWidth;

  // Animate in
  grid.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
  grid.style.transform = 'translateX(0)';
  grid.style.opacity = '1';

  setTimeout(() => {
    isAnimating = false;
  }, 150);
});

// Expand / collapse next month
document.getElementById('expand-btn').addEventListener('click', () => {
  isExpanded = !isExpanded;
  const icon = document.getElementById('expand-icon');
  if (isExpanded) {
    icon.setAttribute('points', '18 15 12 9 6 15'); // up arrow
  } else {
    icon.setAttribute('points', '6 9 12 15 18 9'); // down arrow
  }
  renderCalendar(currentViewDate);
});

// Initial render（先加载念日再渲染，确保圆点和面板首次就正确显示）
renderWeekdays();
loadAnns().then(() => renderCalendar(currentViewDate));

// 语言/主题变更，或设置（含念日）更新：重新加载念日并重渲染
document.addEventListener('app-settings-updated', async () => {
  await loadAnns();
  renderWeekdays();
  renderCalendar(currentViewDate);
});

// Refresh every minute to check if day changed
setInterval(() => {
  renderCalendar(currentViewDate);
}, 60000);
