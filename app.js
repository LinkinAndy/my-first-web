(() => {
  'use strict';
  const KEY = 'youxu.todos.v1';
  const OLD_KEY = 'youxu.tasks.v1';
  const quadrants = { q1: '重要且紧急', q2: '重要不紧急', q3: '紧急不重要', q4: '不重要不紧急' };
  const $ = selector => document.querySelector(selector);
  let locked = false;
  function notice(message) { $('#notice').textContent = message; }
  function valid(items) {
    return Array.isArray(items) && items.every(t => t && typeof t.id === 'string' && t.id &&
      typeof t.title === 'string' && t.title.trim() && t.title.length <= 100 && typeof t.done === 'boolean' &&
      (t.quadrant === undefined || Object.hasOwn(quadrants, t.quadrant))) &&
      new Set(items.map(t => t.id)).size === items.length;
  }
  function load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved !== null) {
        const items = JSON.parse(saved);
        if (!valid(items)) throw new Error('Invalid data');
        return items.map(t => ({ ...t, quadrant: t.quadrant || 'q2' }));
      }
      const old = localStorage.getItem(OLD_KEY);
      if (old === null) return [];
      const tasks = JSON.parse(old);
      if (!Array.isArray(tasks) || !tasks.every(t => t && ['未开始', '进行中', '已完成'].includes(t.status))) throw new Error('Invalid legacy data');
      const migrated = tasks.map(t => ({ id: t.id, title: t.title, done: t.status === '已完成', quadrant: 'q2' }));
      if (!valid(migrated)) throw new Error('Invalid legacy data');
      // Keep the complete old records untouched for recovery.
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    } catch {
      locked = true;
      notice('无法读取或保存本地数据，已暂停操作以保护原记录。请检查浏览器存储设置；清理存储前请先备份。');
      return [];
    }
  }
  let todos = load();
  function save(next) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      todos = next;
      notice('');
      render();
      return true;
    } catch {
      notice('保存失败，操作未生效。请检查浏览器存储空间或设置后重试。');
      return false;
    }
  }
  function render() {
    const list = $('#todos');
    for (const key of Object.keys(quadrants)) $(`#${key}`).replaceChildren();
    for (const todo of todos) {
      const row = document.createElement('li');
      row.classList.toggle('done', todo.done);
      row.dataset.id = todo.id;
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = todo.done;
      check.addEventListener('change', () => {
        if (!save(todos.map(t => t.id === todo.id ? { ...t, done: check.checked } : t))) check.checked = todo.done;
        else focusRow(todo.id, 'input');
      });
      const title = document.createElement('span');
      title.textContent = todo.title;
      label.append(check, title);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `删除：${todo.title}`);
      remove.addEventListener('click', () => {
        const index = todos.findIndex(t => t.id === todo.id);
        if (save(todos.filter(t => t.id !== todo.id))) {
          const buttons = list.querySelectorAll('button');
          (buttons[Math.min(index, buttons.length - 1)] || $('#title')).focus();
        }
      });
      const move = document.createElement('select');
      move.className = 'move';
      move.setAttribute('aria-label', `移动：${todo.title}`);
      for (const [key, name] of Object.entries(quadrants)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = name;
        move.append(option);
      }
      move.value = todo.quadrant;
      move.addEventListener('change', () => {
        if (!save(todos.map(t => t.id === todo.id ? { ...t, quadrant: move.value } : t))) move.value = todo.quadrant;
        else focusRow(todo.id, 'select');
      });
      row.append(label, move, remove);
      $(`#${todo.quadrant}`).append(row);
    }
    $('#quadrant').disabled = locked;
    $('#title').disabled = locked;
    $('#add-form button').disabled = locked;
  }
  function focusRow(id, selector) {
    Array.from($('#todos').querySelectorAll('li')).find(row => row.dataset.id === id)?.querySelector(selector)?.focus();
  }
  $('#title').addEventListener('input', () => $('#title').setCustomValidity(''));
  $('#add-form').addEventListener('submit', event => {
    event.preventDefault();
    if (locked) return;
    const input = $('#title');
    const title = input.value.trim();
    input.setCustomValidity(title ? '' : '请写下待办内容');
    if (!input.reportValidity()) return;
    if (save([...todos, { id: crypto.randomUUID(), title, done: false, quadrant: $('#quadrant').value }])) {
      input.value = '';
      input.focus();
    }
  });
  render();
})();
