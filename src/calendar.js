// Retrieve Lunar and HolidayUtil from the global object populated by vendor/lunar.js
const { Lunar, HolidayUtil } = window;

// Tauri API
const { invoke } = window.__TAURI__.core;

let isExpanded = false;

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

  // Calculate new height: 
  // Container paddings: top 20, bottom 20 = 40
  // Header: 30 + 4(mt) + 16(mb) = 50
  // Divider: 1 + 16(mb) = 17
  // Weekdays: 15(approx 20) + 12(mb) = 32
  // Arrow: 10
  // Window padding (new): 50 (top 10, bottom 40)
  // Expand button: approx 32
  // Row: 44 + 4 gap = 48
  // Total base height approx 231
  const baseHeight = 231;
  const rowHeight = 48;
  const targetHeight = baseHeight + rows * rowHeight;

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

  el.innerHTML = `
    ${badgeHtml}
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

// Initial render
renderWeekdays();
renderCalendar(currentViewDate);

// 语言/主题变更（ui-common 在套用后派发）：重建星期表头并按新语言重渲染
document.addEventListener('app-settings-updated', () => {
  renderWeekdays();
  renderCalendar(currentViewDate);
});

// Refresh every minute to check if day changed
setInterval(() => {
  renderCalendar(currentViewDate);
}, 60000);
