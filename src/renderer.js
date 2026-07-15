// Tauri v2: 通过 withGlobalTauri 暴露的全局对象调用后端命令
const { invoke } = window.__TAURI__.core;
// Chart 由 vendor/chart.umd.min.js 以全局变量形式提供（UMD 全量构建已自动注册所有组件）

// 数据值的显示翻译（分类/状态/优先级）：存储值不变，仅显示按语言切换
const dlabel = (v) => (window.I18N && window.I18N.dataLabel ? window.I18N.dataLabel(v) : v);
// 界面文案翻译（注意不要叫 t——renderer 里 t 被大量用作 lambda 形参）
const tr = (k) => (window.I18N && window.I18N.t ? window.I18N.t(k) : k);

// ---------------------------------------------------------------------------
// 窗口事件
// ---------------------------------------------------------------------------

// 监听 Tauri 窗口事件
window.addEventListener('DOMContentLoaded', () => {
  // 可以在这里添加一些初始化逻辑
});

// 从本地文件读取数据---------------------------------------------------------------------------
// 数据持久化：全部委托给 Rust 后端命令（读写 iCloud Drive 中的 JSON 文件，
// legacy 路径迁移逻辑也已搬到 Rust 端）。
// ---------------------------------------------------------------------------

// 写入数据（异步，fire-and-forget），并顺带刷新托盘标题
function saveTodos() {
  invoke('save_todos', { todos }).catch((e) => console.error('Failed to save data:', e));
  const pending = todos.filter((t) => !t.completed).length;
  const completed = todos.filter((t) => t.completed).length;
  invoke('update_tray_title', { pending, completed }).catch(() => { });
}

// 写入设置（异步）
function saveSettings(s) {
  invoke('save_settings', { settings: s }).catch((e) => console.error('Failed to save settings:', e));
}

let todos = [];
let settings = { sortRule: 'default' };
let currentSortRule = settings.sortRule;
let chartInstance = null;

// Toast Logic
let toastTimeout = null;
const toastContainer = document.getElementById('toast-container');
const toastMessage = document.getElementById('toast-message');
const toastUndoBtn = document.getElementById('toast-undo-btn');

function showToast(message, undoCallback, anchorRect) {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  toastMessage.textContent = message || '';
  // 无文案时只显示操作按钮（如「撤销」），隐藏文案占位
  toastMessage.style.display = message ? '' : 'none';

  toastUndoBtn.onclick = () => {
    if (undoCallback) undoCallback();
    toastContainer.classList.add('hidden');
    clearTimeout(toastTimeout);
  };

  // 定位：传入锚点矩形则贴在触发元素附近，否则底部居中
  // 先定位（此时仍 hidden，可测量尺寸且不产生位移动画），再显示
  if (anchorRect) {
    toastContainer.classList.add('toast-anchored');
    const tw = toastContainer.getBoundingClientRect();
    let left = anchorRect.left + anchorRect.width / 2 - tw.width / 2;
    let top = anchorRect.bottom + 8;
    const maxLeft = window.innerWidth - tw.width - 8;
    const maxTop = window.innerHeight - tw.height - 8;
    left = Math.min(Math.max(8, left), Math.max(8, maxLeft));
    top = Math.min(Math.max(8, top), Math.max(8, maxTop));
    toastContainer.style.left = left + 'px';
    toastContainer.style.top = top + 'px';
    toastContainer.style.bottom = 'auto';
  } else {
    toastContainer.classList.remove('toast-anchored');
    toastContainer.style.left = '';
    toastContainer.style.top = '';
    toastContainer.style.bottom = '';
  }

  toastContainer.classList.remove('hidden');

  toastTimeout = setTimeout(() => {
    toastContainer.classList.add('hidden');
  }, 4000);
}

// 排序设置逻辑
const sortDropdown = document.getElementById('sort-dropdown');
const titleSortBtn = document.getElementById('title-sort-btn');

// 统一控制排序菜单的展开/收起，并同步标题三角的翻转状态
function setSortMenuOpen(open) {
  if (!sortDropdown) return;
  sortDropdown.classList.toggle('hidden', !open);
  if (titleSortBtn) titleSortBtn.classList.toggle('open', open);
}

if (sortDropdown) {
  // 初始化高亮
  updateSortOptionsHighlight();

  // 绑定选项点击事件
  sortDropdown.querySelectorAll('.dropdown-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // 阻止事件冒泡以防止关闭菜单等其他操作冲突
      e.stopPropagation();
      currentSortRule = e.target.dataset.sort;
      settings.sortRule = currentSortRule;
      saveSettings(settings);
      updateSortOptionsHighlight();
      render();
      // 选择后自动关闭下拉菜单
      setSortMenuOpen(false);
    });
  });
}

function updateSortOptionsHighlight() {
  if (!sortDropdown) return;
  sortDropdown.querySelectorAll('.dropdown-item').forEach(btn => {
    if (btn.dataset.sort === currentSortRule) {
      btn.style.color = '#409eff';
      btn.style.backgroundColor = '#ecf5ff';
      btn.style.fontWeight = 'bold';
    } else {
      btn.style.color = '';
      btn.style.backgroundColor = '';
      btn.style.fontWeight = 'normal';
    }
  });
}

// 权重用于排序
const catWeight = { '工作': 1, '生活': 2 };
const priWeight = { '高': 1, '中': 2, '低': 3 };

function sortTodos(list) {
  return list.sort((a, b) => {
    if (currentSortRule === 'time') {
      return b.createdAt - a.createdAt;
    } else if (currentSortRule === 'priority') {
      if (priWeight[a.priority] !== priWeight[b.priority]) {
        return priWeight[a.priority] - priWeight[b.priority];
      }
      return b.createdAt - a.createdAt;
    } else {
      // default: category -> priority -> time
      if (catWeight[a.category] !== catWeight[b.category]) {
        return catWeight[a.category] - catWeight[b.category];
      }
      if (priWeight[a.priority] !== priWeight[b.priority]) {
        return priWeight[a.priority] - priWeight[b.priority];
      }
      return b.createdAt - a.createdAt;
    }
  });
}

function render() {
  const pending = todos.filter(t => !t.completed);
  const completed = todos.filter(t => t.completed);

  // 待办标题旁的统计数字：仅在“显示待办统计”开启时显示（默认关闭）
  const showCount = !!settings.showCount;
  const pendingCountEl = document.getElementById('pending-count');
  if (pendingCountEl) {
    pendingCountEl.textContent = pending.length;
    pendingCountEl.style.display = showCount ? '' : 'none';
  }

  const completedCountEl = document.getElementById('completed-count');
  if (completedCountEl) {
    completedCountEl.textContent = completed.length;
  }

  // 通知后端更新菜单栏托盘标题
  invoke('update_tray_title', { pending: pending.length, completed: completed.length }).catch(() => { });

  // 如果已完成弹窗处于打开状态，则实时更新图表
  const modal = document.getElementById('completed-modal');
  if (modal && !modal.classList.contains('hidden')) {
    updateChart();
  }

  // 创建组 Header 的方法
  const createGroupHeader = (category, priority) => {
    const header = document.createElement('div');
    header.className = 'group-header';

    const titleArea = document.createElement('div');
    titleArea.className = 'group-title';

    if (currentSortRule !== 'time') {
      if (currentSortRule === 'default' || currentSortRule === 'category') {
        const catBadge = document.createElement('span');
        catBadge.className = 'group-badge category-badge';
        catBadge.dataset.val = category || '工作';
        catBadge.textContent = dlabel(category || '工作');
        titleArea.appendChild(catBadge);
      }

      const priBadge = document.createElement('span');
      priBadge.className = 'group-badge priority-badge';
      priBadge.dataset.val = priority || '中';
      priBadge.textContent = dlabel(priority || '中');
      titleArea.appendChild(priBadge);
    } else {
      // 按时间排序时，可以显示类似 "全部任务" 的标题
      const timeBadge = document.createElement('span');
      timeBadge.className = 'group-badge';
      timeBadge.style.color = '#909399';
      timeBadge.style.background = '#f4f4f5';
      timeBadge.textContent = tr('all_todos');
      titleArea.appendChild(timeBadge);
    }

    const addBtn = document.createElement('div');
    addBtn.className = 'group-add-btn custom-tooltip tooltip-left';
    addBtn.dataset.tooltip = tr('add_here');
    addBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';

    addBtn.onclick = () => {
      const newId = Date.now();
      todos.push({
        id: newId,
        text: '',
        category: category || '工作',
        priority: priority || '中',
        status: '待办',
        completed: false,
        createdAt: Date.now()
      });
      saveTodos();
      render();

      setTimeout(() => {
        const el = document.querySelector(`.todo-item[data-id="${newId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          const input = el.querySelector('.text');
          if (input) requestAnimationFrame(() => input.focus());
          el.classList.add('shake-animation');
          setTimeout(() => el.classList.remove('shake-animation'), 600);
        }
      }, 50);
    };

    header.appendChild(titleArea);
    header.appendChild(addBtn);
    return header;
  };

  const list = document.getElementById('todo-list');
  list.innerHTML = '';
  if (pending.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    // 根据时间显示不同的问候语
    const hour = new Date().getHours();
    let greeting = '';
    let icon = '🎉';
    if (hour >= 5 && hour < 12) {
      greeting = tr('greet_morning');
      icon = '🌅';
    } else if (hour >= 12 && hour < 14) {
      greeting = tr('greet_noon');
      icon = '🍱';
    } else if (hour >= 14 && hour < 19) {
      greeting = tr('greet_afternoon');
      icon = '☕️';
    } else if (hour >= 19 && hour < 24) {
      greeting = tr('greet_evening');
      icon = '🌙';
    } else {
      greeting = tr('greet_night');
      icon = '💤';
    }

    emptyState.innerHTML = `<div class="empty-icon">${icon}</div><div class="empty-text">${greeting}</div>`;
    list.appendChild(emptyState);

    // 如果列表为空，添加一个默认的添加按钮
    const addBtn = createGroupHeader('工作', '中');
    addBtn.style.marginTop = '16px';
    emptyState.appendChild(addBtn);
  } else {
    const sortedPending = sortTodos(pending);
    let prevTodo = null;
    let currentGroup = null;

    sortedPending.forEach((todo, index) => {
      let isGroupChange = false;
      if (prevTodo) {
        if (currentSortRule === 'default') {
          isGroupChange = (prevTodo.category !== todo.category) || (prevTodo.priority !== todo.priority);
        } else if (currentSortRule === 'priority') {
          isGroupChange = prevTodo.priority !== todo.priority;
        } else if (currentSortRule === 'time') {
          isGroupChange = false; // 按时间排序不需要分组
        }

        if (isGroupChange) {
          // 不再插入简单的虚线，由新的 header 自带样式
        }
      }

      // 如果是列表的第一项，或者是新的一组，则添加包含标题的 Header
      if (index === 0 || isGroupChange) {
        currentGroup = document.createElement('div');
        currentGroup.className = 'todo-group';
        currentGroup.appendChild(createGroupHeader(todo.category, todo.priority));
        list.appendChild(currentGroup);
      }

      currentGroup.appendChild(createTodoElement(todo, index + 1, false));
      prevTodo = todo;
    });
  }

  const completedList = document.getElementById('completed-list');
  completedList.innerHTML = '';
  if (completed.length === 0) {
    const emptyCompletedState = document.createElement('div');
    emptyCompletedState.className = 'empty-state';
    emptyCompletedState.innerHTML = `<div class="empty-icon">✨</div><div class="empty-text">${tr('no_completed')}</div>`;
    completedList.appendChild(emptyCompletedState);
  } else {
    completed.sort((a, b) => b.completedAt - a.completedAt).forEach((todo, index) => {
      completedList.appendChild(createTodoElement(todo, index + 1, true));
    });
  }

  // 更新完 DOM 后动态计算并调整窗口高度
  setTimeout(updateWindowHeight, 50);
}

function updateWindowHeight() {
  const arrowHeight = 10;
  const padding = 30; // todo-container padding 15px * 2
  const windowPadding = 50; // body padding top 10 + bottom 40
  const bottomArea = document.querySelector('.bottom-area');
  let bottomHeight = bottomArea ? bottomArea.offsetHeight : 0;

  const appHeader = document.querySelector('.app-header');
  let headerHeight = appHeader ? appHeader.offsetHeight + parseInt(window.getComputedStyle(appHeader).marginBottom || 0) : 0;

  const dashboardRow = document.querySelector('.dashboard-row');
  let dashboardHeight = dashboardRow ? dashboardRow.offsetHeight + parseInt(window.getComputedStyle(dashboardRow).marginBottom || 0) : 0;

  const list = document.getElementById('todo-list');
  // 准确计算列表内容的实际高度
  let listHeight = 0;
  if (list) {
    // 暂时取消 flex，强制让容器包裹内容以获取真实的自然高度
    const oldFlex = list.style.flex;
    const oldOverflow = list.style.overflowY;
    list.style.flex = 'none';
    list.style.overflowY = 'hidden'; // 防止滚动条占用空间或干扰
    listHeight = list.scrollHeight;
    list.style.flex = oldFlex;
    list.style.overflowY = oldOverflow;
  }

  let targetHeight = arrowHeight + windowPadding + padding + headerHeight + dashboardHeight + listHeight + bottomHeight + 8;

  // 限制最大和最小高度
  if (targetHeight < 200) targetHeight = 200;
  if (targetHeight > 800) targetHeight = 800; // 最大高度 800px

  invoke('resize_window', { height: Math.round(targetHeight) }).catch(() => { });
}

function createSelect(options, selectedValue, className, onChange) {
  const select = document.createElement('select');
  select.className = `custom-select ${className}`;
  select.dataset.val = selectedValue; // 用于 CSS 颜色绑定
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;                 // 存储值（保持中文，CSS/数据不变）
    option.textContent = dlabel(opt);   // 显示值（按语言翻译）
    if (opt === selectedValue) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener('change', (e) => {
    e.target.dataset.val = e.target.value;
    onChange(e);
  });
  return select;
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function createTodoElement(todo, index, isCompletedView) {
  const item = document.createElement('div');
  item.className = 'todo-item';
  item.dataset.id = todo.id;

  // 移除首列序号显示

  // 已完成列表显示完成时间，待办列表不显示时间
  if (isCompletedView) {
    const compTimeEl = document.createElement('div');
    compTimeEl.className = 'time-label';
    compTimeEl.style.marginLeft = 'auto';
    compTimeEl.textContent = tr('completed_at') + formatDate(todo.completedAt);
    item.appendChild(compTimeEl);
  }

  const catSel = createSelect(['工作', '生活'], todo.category, 'select-category', (e) => {
    todo.category = e.target.value;
    saveTodos();
    render();
  });

  // 输入框包裹层（用于实现绝对定位变两行的效果而不影响布局）
  const textWrapper = document.createElement('div');
  textWrapper.className = 'text-wrapper';

  const input = document.createElement('textarea');
  input.className = 'text';
  // 动态截断文本逻辑
  const truncateText = () => {
    // 展平多行文本，避免因首行过短导致过早截断，最大化利用横向空间
    const flatText = todo.text.replace(/\n/g, ' ');
    input.value = flatText;

    // 借助 scrollWidth 判断单行是否超出可视区域
    requestAnimationFrame(() => {
      // 增加安全校验，防止元素已被销毁时报错
      if (!input.isConnected) return;

      if (input.scrollWidth > input.clientWidth && input.clientWidth > 0) {
        // 使用二分查找法快速截断超长文本，避免性能卡死
        let left = 0;
        let right = flatText.length;
        let bestFit = '';

        while (left <= right) {
          let mid = Math.floor((left + right) / 2);
          input.value = flatText.substring(0, mid) + '...';

          if (input.scrollWidth > input.clientWidth) {
            right = mid - 1; // 截得太长，往左找
          } else {
            bestFit = input.value;
            left = mid + 1; // 还能更长，往右找
          }
        }
        // 确保至少有一个结果，如果还是越界就用原生显示
        input.value = bestFit || (flatText.substring(0, 1) + '...');
      }
    });
  };

  // 初始加载时截断
  truncateText();
  input.placeholder = tr('input_placeholder');
  input.rows = 1;

  // 动态调整高度的函数
  const adjustHeight = () => {
    // 只有在聚焦状态才进行动态调整
    if (document.activeElement === input) {
      input.style.height = '44px'; // 先重置为单行高度
      const scrollHeight = input.scrollHeight;
      if (scrollHeight > 44) {
        // 如果内容超过一行，设置为内容高度，最多限制为三行左右高度 (约84px)
        input.style.height = Math.min(scrollHeight, 84) + 'px';
        input.style.overflowY = scrollHeight > 84 ? 'auto' : 'hidden';
      }
    } else {
      input.style.height = '44px'; // 失去焦点时恢复默认44px
      input.style.overflowY = 'hidden';
    }
  };

  input.addEventListener('blur', () => {
    // 失去焦点时：如果文本为空，直接删除该任务并刷新
    if (!todo.text || todo.text.trim() === '') {
      todos = todos.filter(t => t.id !== todo.id);
      saveTodos();
      render();
      return;
    }

    // 保存并恢复显示单行，若有多行则截取第一行显示
    adjustHeight();
    truncateText();
  });

  input.addEventListener('focus', () => {
    // 获得焦点时：恢复完整文本，并计算高度
    input.value = todo.text;
    setTimeout(adjustHeight, 0);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // 阻止默认的回车换行行为
      input.blur(); // 失去焦点，触发保存和单行省略显示
    }
  });

  input.addEventListener('change', (e) => {
    // change 事件可能在 blur 后触发，此时 input.value 已经被修改为带 ... 的截断版本，
    // 因此在 change 中不能直接取 input.value，而是依赖 input/keydown 等事件实时更新，或者在失焦前更新。
    // 为确保准确，我们在 input 事件中实时保存文本。
  });

  input.addEventListener('input', (e) => {
    // 只有当真正输入时（非失去焦点时的截断）才保存文本
    if (document.activeElement === input) {
      todo.text = e.target.value;
      saveTodos();
    }
    adjustHeight();
  });
  if (isCompletedView) input.disabled = true;

  textWrapper.appendChild(input);
  // 插入到最前面（作为主要内容）
  item.insertBefore(textWrapper, item.firstChild);

  const priSel = createSelect(['高', '中', '低'], todo.priority, 'select-priority', (e) => {
    todo.priority = e.target.value;
    saveTodos();
    render();
  });

  // 将分类和优先级包裹在内部标签容器中，实现浮动在文本框右侧的效果
  const innerTags = document.createElement('div');
  innerTags.className = 'inner-tags';
  innerTags.appendChild(catSel);
  innerTags.appendChild(priSel);
  textWrapper.appendChild(innerTags);

  // 状态圆圈按钮（替代原 select 下拉）
  const checkBtn = document.createElement('div');
  checkBtn.className = 'status-circle';
  checkBtn.setAttribute('role', 'checkbox');
  checkBtn.setAttribute('aria-checked', String(todo.completed));
  if (todo.completed) checkBtn.classList.add('checked');
  checkBtn.setAttribute('tabindex', '0');
  checkBtn.innerHTML = '<svg class="status-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  checkBtn.addEventListener('click', () => {
    if (todo.completed) {
      // 已完成 → 恢复待办（直接操作，无动画）
      todo.completed = false;
      delete todo.completedAt;
      todo.status = '待办';
      saveTodos();
      render();
      return;
    }
    // 待办 → 完成（带动画和撤销 Toast）
    // 先记录圆圈位置（render 后会移除该节点），让撤销提示出现在原处
    const rect = checkBtn.getBoundingClientRect();
    item.classList.add('completing');
    setTimeout(() => {
      todo.completed = true;
      todo.completedAt = Date.now();
      todo.status = '完成';
      saveTodos();
      render();
      showToast('', () => {
        todo.completed = false;
        delete todo.completedAt;
        todo.status = '待办';
        saveTodos();
        render();
      }, rect);
    }, 300);
  });

  checkBtn.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      checkBtn.click();
    }
  });

  item.appendChild(checkBtn);

  // 右侧“更多操作”按钮：点开一个原生 macOS 菜单（专注 / 删除）。
  // 用系统原生菜单而非自绘下拉——它自带「点击别处自动消失」和正确定位，
  // 不会再出现错位或不失焦的问题。
  if (!isCompletedView) {
    const moreWrap = document.createElement('div');
    moreWrap.className = 'more-actions-wrap';
    moreWrap.style.display = 'inline-flex';

    const moreBtn = document.createElement('button');
    moreBtn.className = 'more-actions-btn';
    moreBtn.textContent = '⌵';
    moreBtn.type = 'button';

    moreBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tt = (k, d) => (window.I18N ? window.I18N.t(k) : d);
      try {
        const menu = await window.__TAURI__.menu.Menu.new({
          items: [
            { id: 'focus', text: tt('focus', '专注'), action: () => startPomodoro(todo) },
            {
              id: 'delete', text: tt('delete', '删除'), action: () => {
                const index = todos.findIndex(t => t.id === todo.id);
                const deletedTodo = todo;
                todos = todos.filter(t => t.id !== todo.id);
                saveTodos();
                render();
                showToast(tt('deleted', '已删除任务'), () => {
                  todos.splice(index, 0, deletedTodo);
                  saveTodos();
                  render();
                });
              }
            },
          ],
        });
        await menu.popup();
      } catch (err) {
        console.error('popup menu failed:', err);
      }
    });

    moreWrap.appendChild(moreBtn);
    item.appendChild(moreWrap);
  }

  // 删除重复的已完成时间代码，因为已经移到了输入框旁边
  return item;
}

// 绘制折线图的自定义插件，用于在节点上方显示数字
const dataLabelsPlugin = {
  id: 'dataLabelsPlugin',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((element, index) => {
        const dataString = dataset.data[index].toString();
        // 如果值为 0 也可以选择不显示，这里保留显示以匹配图表参考
        ctx.fillStyle = dataset.borderColor;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // 节点上方偏移
        ctx.fillText(dataString, element.x, element.y - 6);
      });
    });
  }
};

function updateChart() {
  const ctx = document.getElementById('trend-chart').getContext('2d');

  // 获取最近 6 个月
  const labels = [];
  const completedData = [];
  const pendingData = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    labels.push(`${year}-${month}`);

    const cCount = todos.filter(t => {
      if (!t.completed || !t.completedAt) return false;
      const cd = new Date(t.completedAt);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
    }).length;
    completedData.push(cCount);

    const pCount = todos.filter(t => {
      if (t.completed) return false; // 已完成的不算在这个月的待办里
      const cd = new Date(t.createdAt);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
    }).length;
    pendingData.push(pCount);
  }

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: dlabel('完成'),
          data: completedData,
          borderColor: '#67c23a', // 绿色
          backgroundColor: 'rgba(103, 194, 58, 0.1)',
          tension: 0.5,
          cubicInterpolationMode: 'monotone',
          fill: true,
          pointBackgroundColor: '#67c23a',
          pointRadius: 2,
          borderWidth: 2
        },
        {
          label: dlabel('待办'),
          data: pendingData,
          borderColor: '#909399', // 灰色
          backgroundColor: 'rgba(144, 147, 153, 0.05)',
          tension: 0.5,
          cubicInterpolationMode: 'monotone',
          fill: true,
          pointBackgroundColor: '#909399',
          pointRadius: 2,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        y: {
          display: false,
          beginAtZero: true,
          suggestedMax: Math.max(...completedData, ...pendingData) + 2 // 给顶部数字留出空间
        },
        x: {
          display: true,
          grid: { display: false },
          border: { display: false },
          ticks: { font: { size: 10 }, color: '#909399', maxRotation: 0 }
        }
      },
      layout: {
        padding: { top: 12, right: 12, left: 8 }
      }
    },
    plugins: [dataLabelsPlugin]
  });
}

// 弹窗功能
const modal = document.getElementById('completed-modal');
document.getElementById('view-completed-btn').addEventListener('click', () => {
  modal.classList.remove('hidden');
  updateChart(); // 展开弹窗时渲染图表
});
document.getElementById('close-modal-btn').addEventListener('click', () => {
  modal.classList.add('hidden');
});

// 窗内「设置」入口：不再依赖右键托盘菜单也能进设置
const openSettingsBtn = document.getElementById('open-settings-btn');
if (openSettingsBtn) {
  openSettingsBtn.addEventListener('click', () => {
    invoke('open_settings', { tab: 'general' }).catch((e) => console.error('open_settings failed:', e));
  });
}

// 标题（兼作排序下拉按钮）
if (titleSortBtn && sortDropdown) {
  // 点击标题切换菜单
  titleSortBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止冒泡，避免触发 document.click
    setSortMenuOpen(sortDropdown.classList.contains('hidden'));
  });

  // 点击页面其他区域关闭菜单（点到标题或三角内部不关闭）
  document.addEventListener('click', (e) => {
    if (!sortDropdown.contains(e.target) && !titleSortBtn.contains(e.target)) {
      setSortMenuOpen(false);
    }
  });
}

// 页面加载完成后隐藏 Loading 动画
window.addEventListener('DOMContentLoaded', () => {
  const loadingOverlay = document.getElementById('global-loading');
  if (loadingOverlay) {
    // 稍微延迟一点点，确保 DOM 完全渲染完成
    setTimeout(() => {
      loadingOverlay.classList.add('hidden');
    }, 100);
  }
});

// 番茄钟专注模式逻辑
let pomodoroInterval = null;
let pomodoroTimeLeft = 25 * 60; // 默认25分钟
let isPomodoroRunning = false;
let currentPomodoroTodo = null;

const mainContainer = document.getElementById('main-container');
const pomodoroModal = document.getElementById('pomodoro-modal');
const pomodoroTaskTitle = document.getElementById('pomodoro-task-title');
const pomodoroTimerDisplay = document.getElementById('pomodoro-timer');
const pomodoroToggleBtn = document.getElementById('pomodoro-toggle-btn');
const pomodoroExitBtn = document.getElementById('pomodoro-exit-btn');
const pomodoroPlayIcon = document.getElementById('pomodoro-play-icon');
const pomodoroPauseIcon = document.getElementById('pomodoro-pause-icon');

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updatePomodoroDisplay() {
  pomodoroTimerDisplay.textContent = formatTime(pomodoroTimeLeft);
}

function updatePomodoroToggleBtn() {
  if (isPomodoroRunning) {
    pomodoroPlayIcon.classList.add('hidden');
    pomodoroPauseIcon.classList.remove('hidden');
    // 运行状态：浅蓝色
    pomodoroToggleBtn.style.background = '#ecf5ff';
    pomodoroToggleBtn.style.color = '#409eff';
  } else {
    pomodoroPlayIcon.classList.remove('hidden');
    pomodoroPauseIcon.classList.add('hidden');
    // 暂停/初始状态：橙黄色
    pomodoroToggleBtn.style.background = '#fdf6ec';
    pomodoroToggleBtn.style.color = '#e6a23c';
  }
}

function startPomodoro(todo) {
  currentPomodoroTodo = todo;
  pomodoroTaskTitle.textContent = todo.text || tr('untitled_task');
  pomodoroTimeLeft = 25 * 60;
  isPomodoroRunning = false; // 初始为暂停状态，需手动点击开始
  updatePomodoroDisplay();
  updatePomodoroToggleBtn();

  // 切换 UI：保持主容器可见，弹出专注模式模态框
  pomodoroModal.classList.remove('hidden');

  // 此时不需要动态测量高度，因为我们直接强制主窗口变成固定高度的弹窗
  invoke('enter_pomodoro').catch((e) => console.error(e));

  if (pomodoroInterval) clearInterval(pomodoroInterval);
}

function togglePomodoro() {
  isPomodoroRunning = !isPomodoroRunning;
  updatePomodoroToggleBtn();

  if (isPomodoroRunning) {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
    pomodoroInterval = setInterval(() => {
      if (isPomodoroRunning) {
        if (pomodoroTimeLeft > 0) {
          pomodoroTimeLeft--;
          updatePomodoroDisplay();
        } else {
          // 时间到
          clearInterval(pomodoroInterval);
          isPomodoroRunning = false;
          updatePomodoroToggleBtn();
          showToast(tr('toast_focus_done'));
        }
      }
    }, 1000);
  } else {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
  }
}

function exitPomodoro() {
  if (pomodoroInterval) clearInterval(pomodoroInterval);
  isPomodoroRunning = false;
  currentPomodoroTodo = null;

  // 恢复 UI，隐藏模态框
  pomodoroModal.classList.add('hidden');

  // 测量主容器高度并恢复窗口尺寸
  mainContainer.style.height = 'auto';
  const targetHeight = mainContainer.offsetHeight + 10;
  mainContainer.style.height = '';

  invoke('exit_pomodoro', { height: Math.round(Math.max(targetHeight, 200)) }).catch((e) => console.error(e));
}

if (pomodoroToggleBtn) pomodoroToggleBtn.addEventListener('click', togglePomodoro);
if (pomodoroExitBtn) pomodoroExitBtn.addEventListener('click', exitPomodoro);

// ---------------------------------------------------------------------------
// 倒计时
// ---------------------------------------------------------------------------
let countdownInterval = null;
let countdownTotalSeconds = 25 * 60;
let countdownTimeLeft = 25 * 60;
let isCountdownRunning = false;

const countdownModal = document.getElementById('countdown-modal');
const countdownDisplay = document.getElementById('countdown-display');
const countdownInput = document.getElementById('countdown-input');
const countdownToggleBtn = document.getElementById('countdown-toggle-btn');
const countdownResetBtn = document.getElementById('countdown-reset-btn');
const countdownExitBtn = document.getElementById('countdown-exit-btn');
const countdownBtn = document.getElementById('countdown-btn');
const countdownPlayIcon = document.getElementById('countdown-play-icon');
const countdownPauseIcon = document.getElementById('countdown-pause-icon');

function updateCountdownDisplay() {
  countdownDisplay.textContent = formatTime(countdownTimeLeft);
}

function updateCountdownToggleBtn() {
  if (isCountdownRunning) {
    countdownPlayIcon.classList.add('hidden');
    countdownPauseIcon.classList.remove('hidden');
    countdownToggleBtn.style.background = '#ecf5ff';
    countdownToggleBtn.style.color = '#409eff';
  } else {
    countdownPlayIcon.classList.remove('hidden');
    countdownPauseIcon.classList.add('hidden');
    countdownToggleBtn.style.background = '#fdf6ec';
    countdownToggleBtn.style.color = '#e6a23c';
  }
}

function parseCountdownInput(raw) {
  const v = raw.trim();
  if (!v) return null;
  if (v.includes(':')) {
    const [mStr, sStr] = v.split(':');
    const m = parseInt(mStr, 10) || 0;
    const s = parseInt(sStr, 10) || 0;
    return Math.max(1, m * 60 + s);
  }
  const m = parseInt(v, 10);
  return isNaN(m) || m <= 0 ? null : m * 60;
}

function commitCountdownInput() {
  const secs = parseCountdownInput(countdownInput.value);
  if (secs) { countdownTotalSeconds = secs; countdownTimeLeft = secs; }
  countdownInput.style.display = 'none';
  countdownDisplay.style.display = '';
  updateCountdownDisplay();
}

function openCountdownEdit() {
  if (isCountdownRunning) return;
  countdownDisplay.style.display = 'none';
  countdownInput.value = formatTime(countdownTimeLeft);
  countdownInput.style.display = '';
  requestAnimationFrame(() => { countdownInput.select(); countdownInput.focus(); });
}

function openCountdown() {
  if (countdownModal && !countdownModal.classList.contains('hidden')) return;
  if (pomodoroModal && !pomodoroModal.classList.contains('hidden')) return;
  countdownTimeLeft = countdownTotalSeconds;
  isCountdownRunning = false;
  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdownDisplay();
  updateCountdownToggleBtn();
  countdownModal.classList.remove('hidden');
  invoke('enter_pomodoro').catch((e) => console.error(e));
}

function closeCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  isCountdownRunning = false;
  countdownModal.classList.add('hidden');
  mainContainer.style.height = 'auto';
  const targetHeight = mainContainer.offsetHeight + 10;
  mainContainer.style.height = '';
  invoke('exit_pomodoro', { height: Math.round(Math.max(targetHeight, 200)) }).catch((e) => console.error(e));
}

function toggleCountdown() {
  isCountdownRunning = !isCountdownRunning;
  updateCountdownToggleBtn();
  if (isCountdownRunning) {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      if (!isCountdownRunning) return;
      if (countdownTimeLeft > 0) {
        countdownTimeLeft--;
        updateCountdownDisplay();
      } else {
        clearInterval(countdownInterval);
        isCountdownRunning = false;
        updateCountdownToggleBtn();
        showToast(tr('countdown_done'));
      }
    }, 1000);
  } else {
    if (countdownInterval) clearInterval(countdownInterval);
  }
}

function resetCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  isCountdownRunning = false;
  countdownTimeLeft = countdownTotalSeconds;
  updateCountdownDisplay();
  updateCountdownToggleBtn();
}

if (countdownDisplay) {
  countdownDisplay.addEventListener('click', openCountdownEdit);
  countdownDisplay.addEventListener('wheel', (e) => {
    if (isCountdownRunning) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 60 : -60;
    countdownTimeLeft = Math.max(60, Math.min(countdownTimeLeft + delta, 99 * 60 + 59));
    countdownTotalSeconds = countdownTimeLeft;
    updateCountdownDisplay();
  }, { passive: false });
}

if (countdownInput) {
  countdownInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commitCountdownInput(); e.preventDefault(); }
    if (e.key === 'Escape') {
      countdownInput.style.display = 'none';
      countdownDisplay.style.display = '';
    }
  });
  countdownInput.addEventListener('blur', commitCountdownInput);
}

if (countdownToggleBtn) countdownToggleBtn.addEventListener('click', toggleCountdown);
if (countdownResetBtn) countdownResetBtn.addEventListener('click', resetCountdown);
if (countdownExitBtn) countdownExitBtn.addEventListener('click', closeCountdown);
if (countdownBtn) countdownBtn.addEventListener('click', openCountdown);

// ---------------------------------------------------------------------------
// 启动：异步从后端加载数据与设置，必要时写入示例数据，然后首次渲染。
// ---------------------------------------------------------------------------
async function boot() {
  try {
    const loaded = await invoke('load_todos');
    if (Array.isArray(loaded)) todos = loaded;
  } catch (e) {
    console.error('Failed to load todos:', e);
  }
  try {
    const s = await invoke('load_settings');
    if (s && typeof s === 'object' && !Array.isArray(s)) settings = s;
  } catch (e) {
    console.error('Failed to load settings:', e);
  }

  currentSortRule = settings.sortRule || 'default';
  updateSortOptionsHighlight();

  // 如果本地没有数据，才初始化模拟数据（避免覆盖用户真实数据）
  if (!todos || todos.length === 0) {
    const now = Date.now();
    const day = 86400000;
    todos = [
      { id: 1, text: '学习 Electron 和 Chart.js', category: '工作', priority: '高', status: '待办', completed: false, createdAt: now - 5 * day },
      { id: 2, text: '写周报', category: '工作', priority: '中', status: '待办', completed: false, createdAt: now - 2 * day },
      { id: 3, text: '买水果', category: '生活', priority: '低', status: '待办', completed: false, createdAt: now - 1 * day },
      { id: 4, text: '跑步5公里', category: '生活', priority: '中', status: '完成', completed: true, createdAt: now - 4 * day, completedAt: now - 3 * day }
    ];
    saveTodos();
  }

  render();
}

boot();

// 语言/主题/统计开关变更后（ui-common 派发）：重新读取设置并重渲染
document.addEventListener('app-settings-updated', async () => {
  try {
    const s = await invoke('load_settings');
    if (s && typeof s === 'object' && !Array.isArray(s)) settings = s;
  } catch (e) { /* ignore */ }
  if (window.I18N) window.I18N.applyI18n(document);
  render();
});
