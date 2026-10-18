(() => {
  'use strict';
  const STORAGE_KEY = 'youxu.tasks.v1';
  const statuses = ['未开始', '进行中', '已完成'];
  const $ = (selector) => document.querySelector(selector);
  const form = $('#task-form');
  const dialog = $('#task-dialog');
  let editingId = null;
  const demoTasks = () => [
    { id: 'demo-1', title: '整理产品体验反馈', owner: '小林', due: '2026-11-05', status: '进行中' },
    { id: 'demo-2', title: '准备创意分享会提纲', owner: '小夏', due: '2026-11-08', status: '未开始' },
    { id: 'demo-3', title: '更新项目素材清单', owner: '小周', due: '2026-11-10', status: '未开始' },
    { id: 'demo-4', title: '完成网站配色方案', owner: '小林', due: '2026-11-02', status: '已完成' },
    { id: 'demo-5', title: '汇总本周协作进展', owner: '小夏', due: '2026-11-06', status: '进行中' }
  ];
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validTask(task) {
    return task && typeof task.id === 'string' && task.id.length > 0 &&
      typeof task.title === 'string' && task.title.trim().length > 0 && task.title.length <= 100 &&
      typeof task.owner === 'string' && task.owner.trim().length > 0 && task.owner.length <= 40 &&
      validDate(task.due) && statuses.includes(task.status);
  }
  function notify(message) { $('#notice').textContent = message; }
  function persist(next) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return true; }
    catch {
      const message = '保存失败：浏览器存储不可用或空间不足。当前操作未保存，请检查浏览器设置后重试。';
      notify(message);
      if (dialog.open) {
        $('#form-error').textContent = message;
        $('#form-error').hidden = false;
      }
      return false;
    }
  }
  function loadTasks() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) {
        const initial = demoTasks();
        if (persist(initial)) notify('已添加虚构演示任务，你可以随时编辑或删除。');
        return initial;
      }
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(validTask) || new Set(parsed.map(t => t.id)).size !== parsed.length) throw new Error('Invalid task data');
      return parsed;
    } catch {
      // Keep the original data intact: never silently overwrite unreadable storage.
      $('#add-task').disabled = true;
      notify('无法读取本地任务，已暂停修改以保护原数据。请检查浏览器存储设置；如数据已损坏，请先备份，再清除此站点的存储并刷新。');
      return [];
    }
  }
  let tasks = loadTasks();
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function render() {
    $('#total-count').textContent = tasks.length;
    $('#progress-count').textContent = tasks.filter(t => t.status === '进行中').length;
    $('#done-count').textContent = tasks.filter(t => t.status === '已完成').length;
    const query = $('#search').value.trim().toLocaleLowerCase();
    const status = $('#status-filter').value;
    const visible = tasks.filter(t => (status === 'all' || t.status === status) && `${t.title} ${t.owner}`.toLocaleLowerCase().includes(query));
    const list = $('#task-list');
    list.replaceChildren();
    for (const task of visible) {
      const row = element('article', `task-row${task.status === '已完成' ? ' completed' : ''}`);
      const title = element('div', 'task-title');
      title.append(element('span', 'task-marker'), element('span', '', task.title));
      const owner = element('div', 'owner');
      const avatar = element('span', 'avatar', Array.from(task.owner)[0]);
      avatar.setAttribute('aria-hidden', 'true');
      owner.append(avatar, element('span', '', task.owner));
      const date = element('time', 'date', task.due.replaceAll('-', '.'));
      date.dateTime = task.due;
      const statusCell = element('div');
      statusCell.append(element('span', `status-badge ${task.status === '进行中' ? 'active' : task.status === '已完成' ? 'finished' : ''}`, task.status));
      const actions = element('div', 'row-actions');
      const edit = element('button', 'text-button', '编辑');
      edit.setAttribute('aria-label', `编辑任务：${task.title}`);
      edit.addEventListener('click', () => openForm(task));
      const remove = element('button', 'text-button delete', '删除');
      remove.setAttribute('aria-label', `删除任务：${task.title}`);
      remove.addEventListener('click', () => {
        if (!confirm(`确定删除任务“${task.title}”吗？此操作无法撤销。`)) return;
        const next = tasks.filter(t => t.id !== task.id);
        if (persist(next)) { tasks = next; render(); notify('任务已删除。'); }
      });
      actions.append(edit, remove);
      row.append(title, owner, date, statusCell, actions);
      list.append(row);
    }
    $('#empty-state').hidden = visible.length > 0;
    $('#empty-state h3').textContent = tasks.length ? '没有找到匹配的任务' : '这里还没有任务';
    $('#empty-text').textContent = tasks.length ? '试试其他关键词，或切换任务状态。' : '点击“新建任务”，开始安排你的工作。';
    $('#result-count').textContent = `显示 ${visible.length} 项，共 ${tasks.length} 项任务`;
  }
  function openForm(task = null) {
    editingId = task ? task.id : null;
    form.reset();
    $('#form-error').hidden = true;
    for (const field of ['title', 'owner', 'due', 'status']) {
      form.elements[field].setCustomValidity('');
      if (task) form.elements[field].value = task[field];
    }
    $('#dialog-title').textContent = task ? '编辑任务' : '新建任务';
    dialog.showModal();
    form.elements.title.focus();
  }
  $('#add-task').addEventListener('click', () => openForm());
  $('#close-dialog').addEventListener('click', () => dialog.close());
  $('#cancel-dialog').addEventListener('click', () => dialog.close());
  $('#search').addEventListener('input', render);
  $('#status-filter').addEventListener('change', render);
  for (const name of ['title', 'owner', 'due']) form.elements[name].addEventListener('input', () => form.elements[name].setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    for (const name of ['title', 'owner']) {
      form.elements[name].setCustomValidity(form.elements[name].value.trim() ? '' : '请填写非空白内容');
    }
    form.elements.due.setCustomValidity(validDate(form.elements.due.value) ? '' : '请选择有效的截止日期');
    if (!form.reportValidity()) return;
    const task = {
      id: editingId || crypto.randomUUID(),
      title: form.elements.title.value.trim(), owner: form.elements.owner.value.trim(),
      due: form.elements.due.value, status: form.elements.status.value
    };
    const next = editingId ? tasks.map(t => t.id === editingId ? task : t) : [task, ...tasks];
    if (!persist(next)) return;
    tasks = next;
    dialog.close();
    render();
    notify(editingId ? '任务修改已保存。' : '新任务已保存。如未显示，请检查搜索关键词和状态筛选。');
  });
  render();
})();
