'use strict';

// Mirrors the .c-* classes in styles.css.
const PROJECT_COLORS = [
  'slate', 'red', 'orange', 'yellow', 'green',
  'teal', 'blue', 'purple', 'pink', 'brown'
];

const VIEWS = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'upcoming', label: 'Upcoming', icon: 'upcoming' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'all', label: 'All Tasks', icon: 'all' },
  { id: 'completed', label: 'Completed', icon: 'completed' }
];

const SORTS = ['manual', 'due', 'priority', 'alpha'];

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = {
  body: document.body,
  app: document.querySelector('.app'),
  sidebar: document.querySelector('.sidebar'),
  views: document.getElementById('views'),
  projects: document.getElementById('projects'),
  navIndicator: document.getElementById('nav-indicator'),
  headText: document.getElementById('head-text'),
  viewTitle: document.getElementById('view-title'),
  viewSubtitle: document.getElementById('view-subtitle'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progress-bar'),
  composer: document.getElementById('composer'),
  composerField: document.getElementById('composer-field'),
  quickAdd: document.getElementById('quick-add'),
  composerHint: document.getElementById('composer-hint'),
  listWrap: document.getElementById('list-wrap'),
  taskList: document.getElementById('task-list'),
  calendarView: document.getElementById('calendar-view'),
  boardView: document.getElementById('board-view'),
  layoutBtn: document.getElementById('layout-btn'),
  layoutDot: document.getElementById('layout-dot'),
  empty: document.getElementById('empty'),
  completedSection: document.getElementById('completed-section'),
  detail: document.getElementById('detail'),
  detailInner: document.getElementById('detail-inner'),
  detailResizer: document.getElementById('detail-resizer'),
  search: document.getElementById('search'),
  searchWrap: document.getElementById('search-wrap'),
  themeBtn: document.getElementById('theme-btn'),
  addProjectBtn: document.getElementById('add-project-btn'),
  quickOverlay: document.getElementById('quick-overlay'),
  quickCard: document.getElementById('quick-card'),
  quickInput: document.getElementById('quick-input'),
  quickHint: document.getElementById('quick-hint'),
  quickPlus: document.getElementById('quick-plus'),
  quickClose: document.getElementById('quick-close'),
  quickSubmit: document.getElementById('quick-submit'),
  toast: document.getElementById('toast'),
  addTaskBtn: document.getElementById('add-task-btn'),
  backdrop: document.getElementById('dialog-backdrop'),
  dialog: document.getElementById('dialog')
};

const MODES = ['list', 'board', 'calendar', 'table'];

const BOARD_COLUMNS = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' }
];

/** Everything the Layout panel controls, with its default value. */
const LAYOUT_DEFAULTS = {
  mode: 'list',
  showCompleted: false,
  group: 'auto',
  sort: 'manual',
  filters: { date: 'all', created: 'all', priority: 'all', label: 'all' }
};

const ui = {
  view: 'today',
  projectId: null,
  selectedId: null,
  search: '',
  sort: 'manual',
  mode: 'list',
  group: 'auto',
  filters: { ...LAYOUT_DEFAULTS.filters },
  calMonth: null,      // first of the month the calendar is showing
  showCompleted: false
};

let state = { projects: [], tasks: [], settings: { theme: 'system' } };

// Render bookkeeping: what the DOM currently reflects, so we only touch the
// parts that actually changed.
let lastListKey = null;
let lastDetailSig = null;
let detailClearTimer = null;

const wait = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));

const DETAIL_WIDTH = { min: 280, max: 640, default: 328 };

/* ========================================================================= */
/* Dates                                                                     */
/* ========================================================================= */

const todayISO = () => NLP.toISO(NLP.startOfToday());

function formatDue(iso) {
  const date = NLP.fromISO(iso);
  if (!date) return '';
  const today = NLP.startOfToday();
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  const opts = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
}

function dueClass(iso, completed) {
  if (!iso || completed) return '';
  if (iso < todayISO()) return 'overdue';
  if (iso === todayISO()) return 'today';
  return '';
}

function isToday(ms) {
  if (!ms) return false;
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return NLP.toISO(d) === todayISO();
}

/* ========================================================================= */
/* Helpers                                                                   */
/* ========================================================================= */

function projectById(id) {
  return state.projects.find((p) => p.id === id) || null;
}

function inboxId() {
  const inbox = state.projects.find((p) => p.inbox);
  return inbox ? inbox.id : null;
}

/** Walks the palette so new projects don't all come out the same colour. */
function nextColor() {
  const used = state.projects.filter((p) => !p.inbox).length;
  const palette = PROJECT_COLORS.filter((c) => c !== 'slate');
  return palette[used % palette.length];
}

function colorClass(project) {
  const name = project && project.color;
  return `c-${PROJECT_COLORS.includes(name) ? name : 'slate'}`;
}

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Tasks for a view, before the search filter. */
function tasksFor(view, projectId) {
  const open = state.tasks.filter((t) => !t.completed);
  switch (view) {
    case 'today':
      return open.filter((t) => t.due && t.due <= todayISO());
    case 'upcoming':
      return open.filter((t) => t.due && t.due > todayISO());
    case 'inbox':
      return open.filter((t) => t.projectId === inboxId());
    case 'all':
      return open;
    case 'completed':
      return state.tasks.filter((t) => t.completed);
    case 'project':
      return open.filter((t) => t.projectId === projectId);
    default:
      return open;
  }
}

function applySearch(tasks) {
  const q = ui.search.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) => {
    const project = projectById(t.projectId);
    const haystack = [t.title, t.notes, (t.labels || []).join(' '), project ? project.name : '']
      .join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/** The Layout panel's filters, applied on top of the view and the search. */
function applyFilters(tasks) {
  const f = ui.filters;
  const today = todayISO();
  const weekEnd = NLP.toISO(NLP.addDays(NLP.startOfToday(), 7));

  return tasks.filter((task) => {
    if (f.priority !== 'all' && task.priority !== Number(f.priority)) return false;
    if (f.label !== 'all' && !(task.labels || []).includes(f.label)) return false;

    switch (f.date) {
      case 'overdue': if (!task.due || task.due >= today) return false; break;
      case 'today': if (task.due !== today) return false; break;
      case 'week': if (!task.due || task.due < today || task.due > weekEnd) return false; break;
      case 'none': if (task.due) return false; break;
      default: break;
    }

    if (f.created !== 'all') {
      const since = NLP.addDays(NLP.startOfToday(), -(Number(f.created) - 1)).getTime();
      if (!task.createdAt || task.createdAt < since) return false;
    }
    return true;
  });
}

/** Tasks for the current view after search and filters. */
function visibleTasks() {
  return applyFilters(applySearch(tasksFor(ui.view, ui.projectId)));
}

function sortTasks(tasks) {
  const copy = [...tasks];
  switch (ui.sort) {
    case 'due':
      return copy.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')
        || a.priority - b.priority);
    case 'priority':
      return copy.sort((a, b) => a.priority - b.priority
        || (a.due || '9999').localeCompare(b.due || '9999'));
    case 'alpha':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return copy.sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
  }
}

/* ========================================================================= */
/* Actions                                                                   */
/* ========================================================================= */

async function commit(promise) {
  const { state: next } = await promise;
  state = next;
  render();
}

async function refresh() {
  state = await window.api.getState();
  applyTheme();
  applyDetailWidth(state.settings.detailWidth);
  loadLayout(state.settings);
  render();
  requestAnimationFrame(() => el.body.classList.remove('booting'));
}

/**
 * The one path that turns typed text into a task, shared by the inline
 * composer and the floating quick-add card.
 */
async function addTaskFromText(text, fallbackDue, status) {
  const clean = (text || '').trim();
  if (!clean) return null;
  const parsed = NLP.parse(clean, state.projects);

  let projectId = parsed.projectId;
  // A #name that matches nothing becomes a new project, like Todoist does.
  if (!projectId && parsed.projectName) {
    const { result } = await window.api.addProject({
      name: parsed.projectName,
      color: nextColor()
    });
    state = await window.api.getState();
    projectId = result.id;
  }
  if (!projectId) {
    projectId = ui.view === 'project' ? ui.projectId : inboxId();
  }

  // An explicit date wins, then a date the card was opened with (a calendar
  // day), then the Today view's implied "due today".
  const due = parsed.due || fallbackDue || (ui.view === 'today' ? todayISO() : null);

  const { result, state: next } = await window.api.addTask({
    title: parsed.title || clean,
    due,
    priority: parsed.priority,
    projectId,
    labels: parsed.labels,
    status: status || 'todo'
  });
  state = next;
  render();
  return result;
}

async function addFromQuickAdd() {
  const text = el.quickAdd.value.trim();
  if (!text) return;
  el.quickAdd.value = '';
  setHint(el.composerHint, '');
  pulse(el.composerField, 'added', 340);
  await addTaskFromText(text);
}

/** Describes what the parser will make of the typed text. */
function hintFor(text) {
  const parsed = NLP.parse(text, state.projects);
  const bits = [];
  if (parsed.due) bits.push(`due <b>${esc(formatDue(parsed.due))}</b>`);
  if (parsed.priority < 4) bits.push(`priority <b>P${parsed.priority}</b>`);
  if (parsed.projectName) {
    bits.push(parsed.projectId
      ? `in <b>${esc(parsed.projectName)}</b>`
      : `in new project <b>${esc(parsed.projectName)}</b>`);
  }
  for (const label of parsed.labels) bits.push(`label <b>@${esc(label)}</b>`);
  if (!parsed.due && quickAddDue) bits.unshift(`due <b>${esc(friendlyDate(quickAddDue))}</b>`);
  return bits.length
    ? `<b>${esc(parsed.title || text)}</b> — ${bits.join(', ')}`
    : 'Tip: “tomorrow”, “next friday”, “p1”, “#Project”, “@label”';
}

/* ------------------------------------------------------- floating quick add */

let quickCloseTimer = null;
let quickAddDue = null;      // set when the card is opened from a calendar day
let quickAddStatus = null;   // set when opened from a board column

function quickAddOpen() {
  return !el.quickOverlay.hidden;
}

function openQuickAdd(options) {
  quickAddDue = options && typeof options.due === 'string' ? options.due : null;
  quickAddStatus = options && typeof options.status === 'string' ? options.status : null;
  clearTimeout(quickCloseTimer);
  if (!quickAddOpen()) {
    el.quickInput.value = '';
    setHint(el.quickHint, quickAddDue ? `New task due <b>${esc(friendlyDate(quickAddDue))}</b>` : '');
    el.quickCard.classList.remove('ready');
    el.quickOverlay.hidden = false;
    requestAnimationFrame(() => el.quickOverlay.classList.add('open'));
  }
  el.quickInput.focus();
}

function closeQuickAdd() {
  quickAddDue = null;
  quickAddStatus = null;
  if (!quickAddOpen()) return;
  el.quickOverlay.classList.remove('open');
  quickCloseTimer = setTimeout(() => {
    el.quickOverlay.hidden = true;
  }, REDUCED ? 0 : 200);
}

async function submitQuickAdd() {
  const text = el.quickInput.value.trim();
  if (!text) return;
  const due = quickAddDue;
  const status = quickAddStatus;
  el.quickInput.value = '';
  setHint(el.quickHint, '');
  el.quickCard.classList.remove('ready');
  closeQuickAdd();

  const task = await addTaskFromText(text, due, status);
  if (task) toast(`${ICONS.check}<span>Added <b>${esc(task.title)}</b></span>`);
}

/**
 * Ticks the box first, lets the animation read, then persists. A repeating
 * task rolls forward to its next occurrence instead of being filed away.
 */
async function toggleTask(task) {
  if (task.completed) {
    await commit(window.api.updateTask(task.id, { completed: false }));
    return;
  }

  const node = document.querySelector(`.task[data-id="${task.id}"]`);
  if (node) {
    node.classList.add('done', 'just-done');
    await wait(240);
  }

  const { result, state: next } = await window.api.completeTask(task.id);
  state = next;
  render();

  if (result && result.recurred) {
    toast(`${ICONS.repeat}<span>Next: <b>${esc(friendlyDate(result.task.due))}</b></span>`);
  }
}

let toastTimer = null;

function toast(html) {
  el.toast.innerHTML = html;
  el.toast.hidden = false;
  requestAnimationFrame(() => el.toast.classList.add('visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('visible');
    setTimeout(() => { el.toast.hidden = true; }, 220);
  }, 2600);
}

/** Restarts a one-shot CSS animation class. */
function pulse(node, className, ms) {
  if (!node || REDUCED) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  setTimeout(() => node.classList.remove(className), ms);
}

/* ========================================================================= */
/* Rendering                                                                 */
/* ========================================================================= */

function render() {
  renderSidebar();
  renderHeader();
  renderList();
  renderDetail();
}

function renderSidebar() {
  const counts = {};
  for (const v of VIEWS) counts[v.id] = tasksFor(v.id).length;

  el.views.innerHTML = VIEWS.map((v) => {
    const active = ui.view === v.id ? ' active' : '';
    const count = counts[v.id] && v.id !== 'completed'
      ? `<span class="nav-count">${counts[v.id]}</span>` : '';
    return `<button class="nav-item${active}" data-view="${v.id}">
      <span class="nav-icon">${ICONS[v.icon]}</span>
      <span class="nav-label">${esc(v.label)}</span>${count}
    </button>`;
  }).join('');

  const custom = state.projects.filter((p) => !p.inbox);
  el.projects.innerHTML = custom.length
    ? custom.map((p) => {
      const active = ui.view === 'project' && ui.projectId === p.id ? ' active' : '';
      const n = state.tasks.filter((t) => t.projectId === p.id && !t.completed).length;
      return `<div class="nav-row">
        <button class="nav-item${active}" data-project="${p.id}">
          <span class="dot ${colorClass(p)}"></span>
          <span class="nav-label">${esc(p.name)}</span>
          ${n ? `<span class="nav-count">${n}</span>` : ''}
        </button>
        <button class="nav-more" data-more="${p.id}" title="Project options"
                aria-label="Options for ${esc(p.name)}">${ICONS.more}</button>
      </div>`;
    }).join('')
    : '<p class="sidebar-note">No projects yet</p>';

  const theme = state.settings.theme || 'system';
  el.themeBtn.innerHTML = `${ICONS.theme}<span>${theme[0].toUpperCase()}${theme.slice(1)}</span>`;

  moveIndicator();
}

/** Slides the highlight pill to whichever sidebar row is active. */
function moveIndicator() {
  const active = document.querySelector('.sidebar .nav-item.active');
  if (!active) {
    el.navIndicator.classList.remove('visible');
    return;
  }
  // Measured against the sidebar itself: the nav lists are positioned, so
  // offsetTop would be relative to those instead.
  const sidebar = el.sidebar.getBoundingClientRect();
  const row = active.getBoundingClientRect();
  const top = row.top - sidebar.top + el.sidebar.scrollTop;

  const first = !el.navIndicator.classList.contains('visible');
  if (first) el.navIndicator.style.transition = 'none';
  el.navIndicator.style.height = `${row.height}px`;
  el.navIndicator.style.transform = `translateY(${top}px)`;
  el.navIndicator.classList.add('visible');
  if (first) {
    void el.navIndicator.offsetWidth;
    el.navIndicator.style.removeProperty('transition');
  }
}

function renderHeader() {
  const title = ui.view === 'project'
    ? (projectById(ui.projectId) || {}).name || 'Project'
    : (VIEWS.find((v) => v.id === ui.view) || {}).label || 'Tasks';

  if (el.viewTitle.textContent !== title) pulse(el.headText, 'swap', 340);
  el.viewTitle.textContent = title;

  const open = visibleTasks();
  const plural = (n) => `${n} task${n === 1 ? '' : 's'}`;

  if (ui.view === 'today') {
    const overdue = open.filter((t) => t.due < todayISO()).length;
    const date = new Date().toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    el.viewSubtitle.textContent = overdue
      ? `${date} · ${plural(open.length)}, ${overdue} overdue`
      : `${date} · ${plural(open.length)}`;
  } else if (ui.view === 'completed') {
    el.viewSubtitle.textContent = `${open.length} completed`;
  } else {
    el.viewSubtitle.textContent = plural(open.length);
  }

  renderProgress(open.length);
  el.composer.classList.toggle('hidden', ui.view === 'completed');

  el.layoutDot.hidden = !layoutChanged();
}

function renderProgress(openCount) {
  const doneToday = state.tasks.filter((t) => t.completed && isToday(t.completedAt)).length;
  const total = openCount + doneToday;
  const show = ui.view === 'today' && total > 0;
  el.progress.classList.toggle('visible', show);
  el.progressBar.style.width = show ? `${Math.round((doneToday / total) * 100)}%` : '0%';
}

/* ------------------------------------------------------------------- rows */

function taskSignature(task) {
  return [
    task.title, task.notes, task.due, task.dueTime || '', task.deadline || '',
    JSON.stringify(task.repeat || null),
    (task.reminders || []).map((r) => r.at).join('\u0001'),
    task.priority, task.projectId,
    (task.labels || []).join('\u0001'), task.completed ? 1 : 0,
    (task.comments || []).map((c) => `${c.id}:${c.editedAt || 0}:${(c.attachments || []).length}`).join('\u0001'),
    ui.view, ui.projectId || '', todayISO()
  ].join('\u0000');
}

/** Every label in use, for the label picker's suggestions. */
function allLabels() {
  const set = new Set();
  for (const task of state.tasks) for (const label of task.labels || []) set.add(label);
  return [...set].sort();
}

function taskInner(task) {
  const project = projectById(task.projectId);
  const showProject = project && !project.inbox
    && !(ui.view === 'project' && ui.projectId === task.projectId);
  const meta = [];

  if (task.due) {
    const time = task.dueTime ? ` ${task.dueTime}` : '';
    meta.push(`<span class="chip due ${dueClass(task.due, task.completed)}">${esc(formatDue(task.due) + time)}</span>`);
  }
  if (task.repeat) {
    meta.push(`<span class="chip repeat" title="${esc(repeatLabel(task.repeat))}">${ICONS.repeat}</span>`);
  }
  if ((task.reminders || []).length) {
    meta.push(`<span class="chip" title="${esc(task.reminders.map((r) => formatReminder(r.at)).join(', '))}">${ICONS.bell}${task.reminders.length > 1 ? task.reminders.length : ''}</span>`);
  }
  if (task.deadline) {
    const late = !task.completed && task.deadline < todayISO();
    meta.push(`<span class="chip deadline${late ? ' overdue' : ''}" title="Deadline">${ICONS.deadline}${esc(shortDate(task.deadline))}</span>`);
  }
  if (task.priority < 4) {
    meta.push(`<span class="chip prio-${task.priority}">P${task.priority}</span>`);
  }
  const comments = (task.comments || []).length;
  if (comments) {
    const files = (task.comments || []).reduce((n, c) => n + (c.attachments || []).length, 0);
    meta.push(`<span class="chip row-comments" title="${comments} comment${comments === 1 ? '' : 's'}${files ? `, ${files} attachment${files === 1 ? '' : 's'}` : ''}">${files ? ICONS.paperclip : ICONS.comment}${comments}</span>`);
  }
  if (showProject) {
    meta.push(`<span class="chip"><span class="dot ${colorClass(project)}"></span>${esc(project.name)}</span>`);
  }
  for (const label of task.labels || []) {
    meta.push(`<span class="label-chip">@${esc(label)}</span>`);
  }

  const notes = task.notes
    ? `<div class="task-notes-peek">${esc(task.notes.split('\n')[0])}</div>`
    : '';

  return `<button class="check${task.priority < 4 ? ` p${task.priority}` : ''}"
      data-check="${task.id}" title="Toggle complete" aria-label="Toggle complete">${ICONS.tick}</button>
    <div class="task-body">
      <span class="task-title">${esc(task.title)}</span>
      ${notes}
      ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
    </div>
    <div class="task-actions">
      <button class="icon-btn" data-delete="${task.id}" title="Delete task" aria-label="Delete task">${ICONS.close}</button>
    </div>`;
}

function taskItem(task) {
  const classes = ['task'];
  if (task.completed) classes.push('done');
  if (ui.selectedId === task.id) classes.push('selected');
  return {
    key: `t:${task.id}`,
    id: task.id,
    className: classes.join(' '),
    sig: taskSignature(task),
    html: taskInner(task)
  };
}

function groupItem(key, label, overdue) {
  return {
    key: `g:${key}`,
    className: `group-head${overdue ? ' overdue' : ''}`,
    sig: label,
    html: esc(label)
  };
}

/** Group key/label/order for the Layout panel's grouping choice. */
function groupOf(task) {
  switch (ui.group) {
    case 'date':
      return task.due
        ? { key: task.due, label: formatDue(task.due), order: task.due, overdue: task.due < todayISO() }
        : { key: 'none', label: 'No date', order: '9999', overdue: false };
    case 'priority':
      return { key: `p${task.priority}`, label: `Priority ${task.priority}`, order: String(task.priority) };
    case 'project': {
      const project = projectById(task.projectId);
      const index = state.projects.findIndex((p) => p.id === task.projectId);
      return {
        key: task.projectId || 'none',
        label: project ? project.name : 'No project',
        order: String(index < 0 ? 99 : index).padStart(3, '0')
      };
    }
    default:
      return null;
  }
}

/** The ordered list of headers + rows the current view should show. */
function buildItems(tasks) {
  const items = [];

  if (ui.group === 'none') {
    for (const t of sortTasks(tasks)) items.push(taskItem(t));
    return items;
  }

  if (ui.group !== 'auto') {
    const groups = new Map();
    for (const task of sortTasks(tasks)) {
      const info = groupOf(task);
      if (!groups.has(info.key)) groups.set(info.key, { ...info, tasks: [] });
      groups.get(info.key).tasks.push(task);
    }
    const ordered = [...groups.values()].sort((a, b) => String(a.order).localeCompare(String(b.order)));
    for (const group of ordered) {
      items.push(groupItem(group.key, group.label, Boolean(group.overdue)));
      for (const task of group.tasks) items.push(taskItem(task));
    }
    return items;
  }

  if (ui.view === 'today') {
    const overdue = sortTasks(tasks.filter((t) => t.due < todayISO()));
    const due = sortTasks(tasks.filter((t) => t.due === todayISO()));
    if (overdue.length) {
      items.push(groupItem('overdue', 'Overdue', true));
      for (const t of overdue) items.push(taskItem(t));
    }
    if (due.length) {
      if (overdue.length) items.push(groupItem('today', 'Today', false));
      for (const t of due) items.push(taskItem(t));
    }
    return items;
  }

  if (ui.view === 'upcoming') {
    const groups = new Map();
    for (const task of sortTasks(tasks).sort((a, b) => (a.due || '').localeCompare(b.due || ''))) {
      const key = task.due || 'none';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }
    for (const [key, group] of groups) {
      items.push(groupItem(key, key === 'none' ? 'No date' : formatDue(key), key !== 'none' && key < todayISO()));
      for (const t of group) items.push(taskItem(t));
    }
    return items;
  }

  for (const t of sortTasks(tasks)) items.push(taskItem(t));
  return items;
}

/**
 * Keyed reconcile: existing nodes are kept (and only re-filled when their
 * signature changes), new ones animate in, departing ones are lifted out of
 * the flow and animated away, and anything that shifted gets a FLIP tween.
 */
function reconcile(container, items, fresh) {
  if (fresh) container.replaceChildren();

  const live = [...container.children].filter((n) => !n.dataset.exiting);
  const byKey = new Map(live.map((n) => [n.dataset.key, n]));
  const wanted = new Set(items.map((i) => i.key));

  // FLIP, step 1: where is everything right now?
  const firstTop = new Map();
  if (!fresh && !REDUCED) {
    for (const [key, node] of byKey) firstTop.set(key, node.getBoundingClientRect().top);
  }

  for (const [key, node] of byKey) {
    if (!wanted.has(key)) exitNode(container, node);
  }

  const nodes = [];
  let entering = 0;
  for (const item of items) {
    let node = byKey.get(item.key);
    if (node) {
      if (node.dataset.sig !== item.sig) {
        node.innerHTML = item.html;
        node.dataset.sig = item.sig;
      }
      if (node.className !== item.className) node.className = item.className;
    } else {
      node = document.createElement('div');
      node.className = item.className;
      node.dataset.key = item.key;
      node.dataset.sig = item.sig;
      if (item.id) node.dataset.id = item.id;
      node.innerHTML = item.html;
      if (!REDUCED) {
        node.classList.add('enter');
        node.style.setProperty('--i', String(Math.min(entering++, 14)));
        node.addEventListener('animationend', () => {
          node.classList.remove('enter');
          node.style.removeProperty('--i');
        }, { once: true });
      }
    }
    nodes.push(node);
  }

  // Re-append in order; appendChild moves nodes that are already here.
  for (const node of nodes) container.appendChild(node);

  // FLIP, step 2: play the difference.
  if (!fresh && !REDUCED) {
    for (const node of nodes) {
      const before = firstTop.get(node.dataset.key);
      if (before == null) continue;
      const delta = before - node.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      node.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: 'none' }],
        { duration: 280, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
      );
    }
  }
}

/** Lifts a departing row out of layout so the rows above it can close up. */
function exitNode(container, node) {
  node.dataset.exiting = '1';
  node.removeAttribute('data-key');

  if (REDUCED) {
    node.remove();
    return;
  }

  const box = node.getBoundingClientRect();
  const parent = container.getBoundingClientRect();
  node.style.position = 'absolute';
  node.style.top = `${box.top - parent.top}px`;
  node.style.left = `${box.left - parent.left}px`;
  node.style.width = `${box.width}px`;
  node.classList.add('exiting');

  const animation = node.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateX(14px) scale(0.98)' }
    ],
    { duration: 220, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' }
  );
  animation.onfinish = () => node.remove();
  animation.oncancel = () => node.remove();
}

/**
 * Board and calendar step outside the date-bounded views — a month grid or a
 * set of columns filtered to "due today" would be nearly empty — so they take
 * the project scope and the Layout filters, but not the view's date window.
 */
function scopedTasks(includeCompleted) {
  let tasks = state.tasks;
  if (ui.view === 'project') tasks = tasks.filter((t) => t.projectId === ui.projectId);
  else if (ui.view === 'inbox') tasks = tasks.filter((t) => t.projectId === inboxId());
  if (!includeCompleted) tasks = tasks.filter((t) => !t.completed);
  return applyFilters(applySearch(tasks));
}

function tasksForCalendar() {
  return scopedTasks(ui.view === 'completed' || ui.showCompleted);
}

function renderList() {
  const mode = ui.mode;
  el.calendarView.hidden = mode !== 'calendar';
  el.boardView.hidden = mode !== 'board';
  el.taskList.hidden = mode === 'calendar' || mode === 'board';
  el.taskList.classList.toggle('mode-table', mode === 'table');

  if (mode === 'calendar' || mode === 'board') {
    el.empty.classList.add('hidden');
    el.taskList.replaceChildren();
    lastListKey = null;
    el.completedSection.innerHTML = '';
    if (mode === 'calendar') renderCalendar();
    else renderBoard();
    return;
  }

  const tasks = visibleTasks();
  const items = ui.mode === 'table' ? buildTableItems(tasks) : buildItems(tasks);
  const listKey = `${ui.view}:${ui.projectId || ''}:${ui.sort}:${ui.mode}`;
  const fresh = lastListKey !== listKey;
  lastListKey = listKey;

  reconcile(el.taskList, items, fresh);

  const isEmpty = tasks.length === 0;
  el.empty.classList.toggle('hidden', !isEmpty);
  if (isEmpty) {
    el.taskList.replaceChildren();
    lastListKey = null;
    const next = emptyMessage();
    if (el.empty.innerHTML !== next) el.empty.innerHTML = next;
  }

  renderCompletedSection();
}

/* --------------------------------------------------------------- table mode */

const TABLE_COLUMNS = [
  { key: 'title', label: 'Task', sort: 'alpha' },
  { key: 'project', label: 'Project' },
  { key: 'due', label: 'Date', sort: 'due' },
  { key: 'priority', label: 'Priority', sort: 'priority' },
  { key: 'labels', label: 'Labels' },
  { key: 'deadline', label: 'Deadline' }
];

function tableRowInner(task) {
  const project = projectById(task.projectId);
  const deadlineLate = task.deadline && !task.completed && task.deadline < todayISO();
  const due = task.due
    ? `<span class="${dueClass(task.due, task.completed)}">${esc(formatDue(task.due))}${task.dueTime ? ` ${esc(task.dueTime)}` : ''}</span>`
    : '<span class="tdim">—</span>';

  return `<button class="check${task.priority < 4 ? ` p${task.priority}` : ''}"
      data-check="${task.id}" title="Toggle complete" aria-label="Toggle complete">${ICONS.tick}</button>
    <span class="tcell tcell-title"><span class="task-title">${esc(task.title)}</span>${
      task.repeat ? `<span class="trepeat" title="${esc(repeatLabel(task.repeat))}">${ICONS.repeat}</span>` : ''}</span>
    <span class="tcell">${project && !project.inbox
      ? `<span class="chip"><span class="dot dot-inline ${colorClass(project)}"></span>${esc(project.name)}</span>`
      : '<span class="tdim">Inbox</span>'}</span>
    <span class="tcell">${due}</span>
    <span class="tcell">${task.priority < 4
      ? `<span class="prio-${task.priority}">P${task.priority}</span>`
      : '<span class="tdim">—</span>'}</span>
    <span class="tcell tcell-labels">${(task.labels || []).length
      ? task.labels.map((l) => `<span class="label-chip">@${esc(l)}</span>`).join('')
      : '<span class="tdim">—</span>'}</span>
    <span class="tcell">${task.deadline
      ? `<span class="${deadlineLate ? 'overdue' : ''}">${esc(shortDate(task.deadline))}</span>`
      : '<span class="tdim">—</span>'}</span>
    <span class="task-actions">
      <button class="icon-btn" data-delete="${task.id}" title="Delete task" aria-label="Delete task">${ICONS.close}</button>
    </span>`;
}

function buildTableItems(tasks) {
  const head = TABLE_COLUMNS.map((col) => (col.sort
    ? `<button class="thcell${ui.sort === col.sort ? ' active' : ''}" data-sort="${col.sort}">${col.label}</button>`
    : `<span class="thcell">${col.label}</span>`)).join('');

  const items = [{
    key: 'thead',
    className: 'thead',
    sig: `${ui.sort}`,
    html: `<span class="thcell"></span>${head}<span class="thcell"></span>`
  }];

  for (const task of sortTasks(tasks)) {
    const classes = ['task'];
    if (task.completed) classes.push('done');
    if (ui.selectedId === task.id) classes.push('selected');
    items.push({
      key: `t:${task.id}`,
      id: task.id,
      className: classes.join(' '),
      sig: `table\u0000${taskSignature(task)}`,
      html: tableRowInner(task)
    });
  }
  return items;
}

/* --------------------------------------------------------------- board mode */

function boardCard(task) {
  const project = projectById(task.projectId);
  const meta = [];

  if (task.due) {
    meta.push(`<span class="chip due ${dueClass(task.due, task.completed)}">${esc(formatDue(task.due))}${task.dueTime ? ` ${esc(task.dueTime)}` : ''}</span>`);
  }
  if (task.priority < 4) meta.push(`<span class="chip prio-${task.priority}">P${task.priority}</span>`);
  if (project && !project.inbox) {
    meta.push(`<span class="chip"><span class="dot dot-inline ${colorClass(project)}"></span>${esc(project.name)}</span>`);
  }
  if (task.repeat) meta.push(`<span class="chip" title="${esc(repeatLabel(task.repeat))}">${ICONS.repeat}</span>`);
  if ((task.reminders || []).length) meta.push(`<span class="chip">${ICONS.bell}</span>`);
  for (const label of task.labels || []) meta.push(`<span class="label-chip">@${esc(label)}</span>`);

  return `<article class="bcard${task.completed ? ' done' : ''}${ui.selectedId === task.id ? ' selected' : ''}"
      draggable="true" data-id="${task.id}">
    <div class="bcard-top">
      <button class="check${task.priority < 4 ? ` p${task.priority}` : ''}"
        data-check="${task.id}" title="Toggle complete" aria-label="Toggle complete">${ICONS.tick}</button>
      <span class="bcard-title"><span class="task-title">${esc(task.title)}</span></span>
      <button class="icon-btn bcard-del" data-delete="${task.id}" title="Delete task" aria-label="Delete task">${ICONS.close}</button>
    </div>
    ${meta.length ? `<div class="bcard-meta">${meta.join('')}</div>` : ''}
  </article>`;
}

function renderBoard() {
  const tasks = scopedTasks(true);

  const columns = BOARD_COLUMNS.map((col) => {
    const list = col.id === 'done'
      ? tasks.filter((t) => t.completed)
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        .slice(0, 50)
      : sortTasks(tasks.filter((t) => !t.completed && (t.status || 'todo') === col.id));
    return { ...col, list };
  });

  el.boardView.innerHTML = columns.map((col) => `
    <section class="bcol" data-col="${col.id}">
      <header class="bcol-head">
        <span class="bcol-title">${col.label}</span>
        <span class="bcol-count">${col.list.length}</span>
      </header>
      <div class="bcol-body" data-drop="${col.id}">
        ${col.list.length
          ? col.list.map(boardCard).join('')
          : `<p class="bcol-empty">${col.id === 'done' ? 'Nothing finished yet' : 'Drop a task here'}</p>`}
      </div>
      ${col.id === 'done' ? '' : `
        <button class="bcol-add" data-add-col="${col.id}">${ICONS.plus}<span>Add task</span></button>`}
    </section>`).join('');
}

/** Dropping a card into a column: Done completes it, the others set status. */
async function moveCard(taskId, column) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (column === 'done') {
    if (!task.completed) await toggleTask(task);
    return;
  }

  if (!task.completed && (task.status || 'todo') === column) return;
  await commit(window.api.updateTask(task.id, {
    status: column,
    ...(task.completed ? { completed: false } : {})
  }));
}

/* ------------------------------------------------------------ calendar mode */

function calendarMonth() {
  if (!ui.calMonth) {
    const now = NLP.startOfToday();
    ui.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return ui.calMonth;
}

function renderCalendar() {
  const month = calendarMonth();
  const year = month.getFullYear();
  const index = month.getMonth();
  const monthName = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const byDate = new Map();
  for (const task of tasksForCalendar()) {
    if (!task.due) continue;
    if (!byDate.has(task.due)) byDate.set(task.due, []);
    byDate.get(task.due).push(task);
  }

  const first = new Date(year, index, 1);
  const lead = (first.getDay() + 6) % 7;          // Monday-first
  const start = NLP.addDays(first, -lead);
  const weeks = Math.ceil((lead + new Date(year, index + 1, 0).getDate()) / 7);
  const today = todayISO();

  let cells = '';
  for (let i = 0; i < weeks * 7; i += 1) {
    const date = NLP.addDays(start, i);
    const value = NLP.toISO(date);
    const items = (byDate.get(value) || []).sort((a, b) => a.priority - b.priority);
    const shown = items.slice(0, 3);
    const classes = ['cal-cell'];
    if (date.getMonth() !== index) classes.push('is-outside');
    if (value === today) classes.push('is-today');

    cells += `<div class="${classes.join(' ')}" data-date="${value}">
      <span class="cal-cell-date">${date.getDate()}</span>
      <div class="cal-cell-items">
        ${shown.map((t) => `<button class="cal-chip${t.completed ? ' done' : ''} prio-border-${t.priority}"
            data-id="${t.id}" title="${esc(t.title)}">${esc(t.title)}</button>`).join('')}
        ${items.length > shown.length
          ? `<span class="cal-more">+${items.length - shown.length} more</span>` : ''}
      </div>
    </div>`;
  }

  const undated = tasksForCalendar().filter((t) => !t.due).length;

  el.calendarView.innerHTML = `
    <div class="cal-view-head">
      <strong>${esc(monthName)}</strong>
      <div class="cal-view-nav">
        <button class="icon-btn" data-cal-nav="prev" aria-label="Previous month">${ICONS.chevronLeft}</button>
        <button class="ghost-btn" data-cal-nav="today">Today</button>
        <button class="icon-btn" data-cal-nav="next" aria-label="Next month">${ICONS.chevronRight}</button>
      </div>
    </div>
    <div class="cal-view-weekdays">
      ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span>${d}</span>`).join('')}
    </div>
    <div class="cal-view-grid">${cells}</div>
    ${undated ? `<p class="cal-view-note">${undated} task${undated === 1 ? '' : 's'} with no date ${undated === 1 ? 'is' : 'are'} not shown here.</p>` : ''}`;
}

function renderCompletedSection() {
  if (ui.view === 'completed') {
    const done = applySearch(state.tasks.filter((t) => t.completed));
    el.completedSection.innerHTML = done.length
      ? `<div class="completed-head">
           <span class="group-head flush">${done.length} completed</span>
           <button class="ghost-btn" id="clear-completed">Clear all</button>
         </div>`
      : '';
    return;
  }

  const scope = ui.view === 'project'
    ? state.tasks.filter((t) => t.completed && t.projectId === ui.projectId)
    : state.tasks.filter((t) => t.completed);

  if (!scope.length) {
    el.completedSection.innerHTML = '';
    return;
  }

  const recent = [...scope]
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 25);

  el.completedSection.innerHTML = `
    <div class="completed-head">
      <button class="ghost-btn" id="toggle-completed">
        ${ui.showCompleted ? 'Hide' : 'Show'} completed (${scope.length})
      </button>
    </div>
    ${ui.showCompleted
      ? `<div class="completed-list">${recent.map((t) => `<div class="task done" data-id="${t.id}">${taskInner(t)}</div>`).join('')}</div>`
      : ''}`;
}

function emptyMessage() {
  if (ui.search.trim()) {
    return `${ICONS.search}<h3>No matches</h3><p>Nothing matches “${esc(ui.search.trim())}”.</p>`;
  }
  const messages = {
    today: [ICONS.emptyCheck, 'Nothing due today', 'Add something above, or enjoy the quiet.'],
    upcoming: [ICONS.upcoming, 'Nothing scheduled', 'Tasks with a future due date land here.'],
    inbox: [ICONS.inbox, 'Inbox empty', 'New tasks without a project arrive here.'],
    all: [ICONS.emptyBox, 'No tasks', 'Add your first one above.'],
    completed: [ICONS.emptyCheck, 'Nothing completed yet', 'Finished tasks are logged here.'],
    project: [ICONS.emptyBox, 'No tasks in this project', 'Add one above.']
  };
  const [icon, title, body] = messages[ui.view] || messages.all;
  return `${icon}<h3>${title}</h3><p>${body}</p>`;
}

/* ------------------------------------------------------------------ detail */

function detailRow(key, label, valueHTML) {
  return `<button class="drow" data-row="${key}">
    <span class="drow-label">${label}</span>
    <span class="drow-value">${valueHTML || `<span class="drow-add">${ICONS.plus}</span>`}</span>
  </button>`;
}

/* ========================================================================= */
/* Comments and attachments                                                  */
/* ========================================================================= */

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'];

/** A draft survives a re-render, so a half-written comment is never lost. */
let commentDraft = { taskId: null, text: '', paths: [] };

function draftFor(taskId) {
  if (commentDraft.taskId !== taskId) commentDraft = { taskId, text: '', paths: [] };
  return commentDraft;
}

function fileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function commentTime(ts) {
  const date = new Date(ts);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = new Date(ts).toISOString().slice(0, 10);
  if (day === todayISO()) return `Today ${time}`;
  return `${shortDate(day)} ${time}`;
}

function isImage(attachment) {
  return IMAGE_EXT.includes(String(attachment.ext || '').toLowerCase());
}

function attachmentNode(comment, attachment) {
  const name = esc(attachment.name);
  const meta = fileSize(attachment.size);
  const remove = `<button class="att-x" data-rm-att="${attachment.id}" data-rm-comment="${comment.id}"
      title="Remove ${name}" aria-label="Remove ${name}">${ICONS.close}</button>`;

  if (isImage(attachment)) {
    return `<div class="att att-image">
      <button class="att-open" data-open="${esc(attachment.file)}" title="Open ${name}">
        <img src="attachment://f/${encodeURIComponent(attachment.file)}" alt="${name}" />
      </button>
      <span class="att-cap">${name}</span>${remove}
    </div>`;
  }

  return `<div class="att att-file">
    <button class="att-open" data-open="${esc(attachment.file)}" title="Open ${name}">
      <span class="att-icon">${ICONS.file}</span>
      <span class="att-text"><span class="att-name">${name}</span><span class="att-size">${meta}</span></span>
    </button>${remove}
  </div>`;
}

function commentNode(comment) {
  const attachments = comment.attachments || [];
  return `<article class="comment" data-comment="${comment.id}">
    <header class="comment-head">
      <time>${esc(commentTime(comment.at))}</time>
      ${comment.editedAt ? '<span class="comment-edited">edited</span>' : ''}
      <span class="comment-tools">
        ${comment.text ? `<button class="icon-btn" data-edit="${comment.id}" title="Edit">${ICONS.pencil}</button>` : ''}
        <button class="icon-btn" data-del-comment="${comment.id}" title="Delete">${ICONS.trash}</button>
      </span>
    </header>
    ${comment.text ? `<p class="comment-text">${esc(comment.text)}</p>` : ''}
    ${attachments.length ? `<div class="att-grid">${attachments.map((a) => attachmentNode(comment, a)).join('')}</div>` : ''}
  </article>`;
}

function commentsSection(task) {
  const comments = task.comments || [];
  const draft = draftFor(task.id);

  return `<section class="comments">
    <h3 class="comments-head">
      ${ICONS.comment}<span>Comments</span>
      ${comments.length ? `<span class="comments-n">${comments.length}</span>` : ''}
    </h3>

    <div class="comment-list">
      ${comments.length
        ? comments.map(commentNode).join('')
        : '<p class="comments-empty">No comments yet. Add a note to your future self, or attach a file.</p>'}
    </div>

    <div class="composer" id="c-composer">
      <textarea id="c-text" placeholder="Write a comment…">${esc(draft.text)}</textarea>
      <div class="composer-pending" id="c-pending">${pendingChips(draft.paths)}</div>
      <div class="composer-actions">
        <button class="icon-btn" id="c-attach" title="Attach files">${ICONS.paperclip}</button>
        <span class="composer-hint">Drop files here · ⌘↵ to send</span>
        <button class="primary-btn" id="c-send">${ICONS.send}<span>Comment</span></button>
      </div>
      <div class="composer-drop"><span>Drop to attach</span></div>
    </div>
  </section>`;
}

function pendingChips(paths) {
  return paths.map((full, i) => {
    const name = esc(full.split('/').pop());
    return `<span class="pending-chip">${ICONS.paperclip}<span class="t">${name}</span>
      <button class="att-x" data-unpend="${i}" title="Remove ${name}" aria-label="Remove ${name}">${ICONS.close}</button></span>`;
  }).join('');
}

function renderDetail() {
  const task = ui.selectedId ? state.tasks.find((t) => t.id === ui.selectedId) : null;

  if (!task) {
    lastDetailSig = null;
    el.app.classList.remove('has-detail');
    clearTimeout(detailClearTimer);
    detailClearTimer = setTimeout(() => {
      if (!el.app.classList.contains('has-detail')) el.detailInner.innerHTML = '';
    }, 320);
    return;
  }

  clearTimeout(detailClearTimer);
  el.app.classList.add('has-detail');

  // Only rebuild when something the panel shows actually changed, so typing
  // in a field is never interrupted by an unrelated re-render.
  const sig = `${task.id}\u0000${taskSignature(task)}\u0000${state.projects.map((p) => p.id + p.name).join()}`;
  if (sig === lastDetailSig) return;
  lastDetailSig = sig;

  const project = projectById(task.projectId);
  const labels = task.labels || [];
  const reminders = task.reminders || [];
  const dateText = dateSummary(task.due, task.dueTime, task.repeat);
  const deadlineLate = task.deadline && !task.completed && task.deadline < todayISO();

  el.detailInner.innerHTML = `
    <div class="detail-head">
      <h2>Task</h2>
      <button class="icon-btn" id="d-close" title="Close (Esc)" aria-label="Close">${ICONS.close}</button>
    </div>

    <div class="field">
      <label for="d-title">Title</label>
      <input id="d-title" type="text" value="${esc(task.title)}" />
    </div>
    <div class="field">
      <label for="d-notes">Notes</label>
      <textarea id="d-notes" placeholder="Add details…">${esc(task.notes)}</textarea>
    </div>

    <div class="drows">
      ${detailRow('project', 'Project',
        `<span class="drow-chip"><span class="dot ${colorClass(project)}"></span><span class="t">${esc(project ? project.name : 'Inbox')}</span></span>`)}
      ${detailRow('date', 'Date', dateText
        ? `<span class="drow-chip ${dueClass(task.due, task.completed)}" title="${esc(dateText)}"><span class="t">${esc(dateText)}</span></span>`
        : null)}
      ${detailRow('deadline', 'Deadline', task.deadline
        ? `<span class="drow-chip${deadlineLate ? ' overdue' : ''}">${ICONS.deadline}<span class="t">${esc(shortDate(task.deadline))}</span></span>`
        : null)}
      ${detailRow('priority', 'Priority',
        `<span class="drow-chip prio-${task.priority}">${ICONS.flag}<span class="t">P${task.priority}</span></span>`)}
      ${detailRow('labels', 'Labels', labels.length
        ? labels.map((l) => `<span class="drow-chip"><span class="t">@${esc(l)}</span></span>`).join('')
        : null)}
      ${detailRow('reminders', 'Reminders', reminders.length
        ? `<span class="drow-chip" title="${esc(reminders.map((r) => formatReminder(r.at)).join(', '))}">${ICONS.bell}<span class="t">${esc(formatReminder(reminders[0].at))}${reminders.length > 1 ? ` +${reminders.length - 1}` : ''}</span></span>`
        : null)}
    </div>

    ${commentsSection(task)}

    <div class="detail-foot">
      <button class="danger-btn" id="d-delete">Delete task</button>
    </div>

    <p class="detail-meta">
      Created ${new Date(task.createdAt).toLocaleString()}
      ${task.completions ? `<br />Completed ${task.completions} time${task.completions === 1 ? '' : 's'}` : ''}
      ${task.completedAt ? `<br />Completed ${new Date(task.completedAt).toLocaleString()}` : ''}
    </p>`;

  wireDetail(task);
}

function wireDetail(task) {
  const save = (patch) => commit(window.api.updateTask(task.id, patch));
  const title = document.getElementById('d-title');
  const notes = document.getElementById('d-notes');

  title.addEventListener('change', () => save({ title: title.value }));
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
  });
  notes.addEventListener('change', () => save({ notes: notes.value }));

  document.getElementById('d-close').addEventListener('click', () => {
    ui.selectedId = null;
    render();
  });

  document.getElementById('d-delete').addEventListener('click', async () => {
    ui.selectedId = null;
    await commit(window.api.deleteTask(task.id));
  });

  for (const row of el.detailInner.querySelectorAll('[data-row]')) {
    row.addEventListener('click', () => openRowPicker(row.dataset.row, row, task));
  }

  wireComments(task);
}

function wireComments(task) {
  const draft = draftFor(task.id);
  const composer = document.getElementById('c-composer');
  const text = document.getElementById('c-text');
  const pending = document.getElementById('c-pending');

  const grow = () => {
    text.style.height = 'auto';
    text.style.height = `${Math.min(text.scrollHeight, 220)}px`;
  };
  grow();

  text.addEventListener('input', () => { draft.text = text.value; grow(); });

  const redrawPending = () => { pending.innerHTML = pendingChips(draft.paths); };

  const attach = (paths) => {
    for (const p of paths) if (p && !draft.paths.includes(p)) draft.paths.push(p);
    redrawPending();
  };

  pending.addEventListener('click', (e) => {
    const button = e.target.closest('[data-unpend]');
    if (!button) return;
    draft.paths.splice(Number(button.dataset.unpend), 1);
    redrawPending();
  });

  document.getElementById('c-attach').addEventListener('click', async () => {
    attach(await window.api.pickAttachments());
    text.focus();
  });

  const send = async () => {
    const body = text.value.trim();
    if (!body && !draft.paths.length) return;
    const paths = draft.paths.slice();
    commentDraft = { taskId: task.id, text: '', paths: [] };
    const { state: next, result } = await window.api.addComment(task.id, { text: body, paths });
    state = next;
    render();
    if (result && result.failed && result.failed.length) {
      toast(`Could not attach ${esc(result.failed.join(', '))}`);
    }
    const again = document.getElementById('c-text');
    if (again) again.focus();
  };

  document.getElementById('c-send').addEventListener('click', send);
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
  });

  // Dropping files anywhere on the composer attaches them.
  let depth = 0;
  composer.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth += 1;
    composer.classList.add('dropping');
  });
  composer.addEventListener('dragover', (e) => { e.preventDefault(); });
  composer.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) composer.classList.remove('dropping');
  });
  composer.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    composer.classList.remove('dropping');
    const paths = [...(e.dataTransfer.files || [])]
      .map((file) => window.api.pathForFile(file))
      .filter(Boolean);
    if (paths.length) attach(paths);
    else toast('That could not be attached — try the paperclip.');
  });

  wireCommentList(task);
}

function wireCommentList(task) {
  const list = el.detailInner.querySelector('.comment-list');
  if (!list) return;

  list.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      const error = await window.api.openAttachment(open.dataset.open);
      if (error) toast('That file could not be opened — it may have been removed.');
      return;
    }

    const rm = e.target.closest('[data-rm-att]');
    if (rm) {
      await commit(window.api.deleteAttachment(task.id, rm.dataset.rmComment, rm.dataset.rmAtt));
      return;
    }

    const del = e.target.closest('[data-del-comment]');
    if (del) {
      await commit(window.api.deleteComment(task.id, del.dataset.delComment));
      return;
    }

    const edit = e.target.closest('[data-edit]');
    if (edit) startCommentEdit(task, edit.dataset.edit);
  });

  // Right-click an attachment to show it in the Finder.
  list.addEventListener('contextmenu', (e) => {
    const open = e.target.closest('[data-open]');
    if (!open) return;
    e.preventDefault();
    openOptionMenu(open, [
      { value: 'open', label: 'Open', icon: ICONS.file },
      { value: 'reveal', label: 'Show in Finder', icon: ICONS.search }
    ], (value) => {
      if (value === 'open') window.api.openAttachment(open.dataset.open);
      else window.api.revealAttachment(open.dataset.open);
    });
  });
}

function startCommentEdit(task, commentId) {
  const node = el.detailInner.querySelector(`[data-comment="${commentId}"]`);
  const comment = (task.comments || []).find((c) => c.id === commentId);
  const body = node && node.querySelector('.comment-text');
  if (!comment || !body || node.querySelector('.comment-edit')) return;

  body.hidden = true;
  const editor = document.createElement('div');
  editor.className = 'comment-edit';
  editor.innerHTML = `
    <textarea class="comment-edit-text"></textarea>
    <div class="comment-edit-actions">
      <button class="ghost-btn" data-cancel>Cancel</button>
      <button class="primary-btn" data-save>Save</button>
    </div>`;
  node.insertBefore(editor, body.nextSibling);

  const field = editor.querySelector('textarea');
  field.value = comment.text;
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);

  const cancel = () => { editor.remove(); body.hidden = false; };
  const save = async () => {
    const value = field.value.trim();
    if (value === comment.text) return cancel();
    editor.remove();
    await commit(window.api.updateComment(task.id, commentId, value));
  };

  editor.querySelector('[data-cancel]').addEventListener('click', cancel);
  editor.querySelector('[data-save]').addEventListener('click', save);
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  });
}

/** Opens the right picker for a detail row. */
function openRowPicker(kind, anchor, task) {
  switch (kind) {
    case 'date':
      openDatePicker(anchor, {
        date: task.due,
        time: task.dueTime,
        repeat: task.repeat,
        onChange: ({ date, time, repeat }) =>
          commit(window.api.updateTask(task.id, { due: date, dueTime: time, repeat }))
      });
      break;

    case 'deadline':
      openDatePicker(anchor, {
        date: task.deadline,
        allowTime: false,
        allowRepeat: false,
        onChange: ({ date }) => commit(window.api.updateTask(task.id, { deadline: date }))
      });
      break;

    case 'labels':
      openLabelPicker(anchor, {
        labels: task.labels || [],
        allLabels: allLabels(),
        onChange: (labels) => commit(window.api.updateTask(task.id, { labels }))
      });
      break;

    case 'reminders':
      openReminderPicker(anchor, {
        reminders: task.reminders || [],
        due: task.due,
        dueTime: task.dueTime,
        onChange: (reminders) => commit(window.api.updateTask(task.id, { reminders }))
      });
      break;

    case 'priority':
      openOptionMenu(anchor, [1, 2, 3, 4].map((p) => ({
        value: String(p),
        label: `<span class="prio-${p}">Priority ${p}</span>`,
        icon: `<span class="prio-${p}">${ICONS.flag}</span>`,
        selected: task.priority === p
      })), (value) => commit(window.api.updateTask(task.id, { priority: Number(value) })));
      break;

    case 'project':
      openOptionMenu(anchor, state.projects.map((p) => ({
        value: p.id,
        label: esc(p.name),
        icon: `<span class="dot ${colorClass(p)}"></span>`,
        selected: p.id === task.projectId
      })), (value) => commit(window.api.updateTask(task.id, { projectId: value })));
      break;

    default:
      break;
  }
}

/* ========================================================================= */
/* Dialogs                                                                   */
/* ========================================================================= */

function openDialog(html, onMount) {
  clearTimeout(closeDialog.timer);
  el.dialog.innerHTML = html;
  el.backdrop.hidden = false;
  requestAnimationFrame(() => el.backdrop.classList.add('open'));
  if (onMount) onMount();
}

function closeDialog() {
  if (el.backdrop.hidden) return;
  el.backdrop.classList.remove('open');
  closeDialog.timer = setTimeout(() => {
    el.backdrop.hidden = true;
    el.dialog.innerHTML = '';
  }, REDUCED ? 0 : 200);
}

/** The ⋯ menu on a project row: the only obvious way to edit or delete one. */
function projectMenu(anchor, project) {
  if (!project) return;
  anchor.classList.add('menu-open');
  openOptionMenu(anchor, [
    { value: 'edit', label: 'Edit project', icon: ICONS.pencil },
    { value: 'delete', label: 'Delete project', icon: ICONS.trash, danger: true }
  ], (value) => {
    if (value === 'edit') projectDialog(project);
    else confirmDeleteProject(project);
  }, { onClose: () => anchor.classList.remove('menu-open') });
}

/** Deleting is destructive enough to be worth one question first. */
function confirmDeleteProject(project) {
  const n = state.tasks.filter((t) => t.projectId === project.id && !t.completed).length;
  const fate = n
    ? `Its ${n} unfinished ${n === 1 ? 'task moves' : 'tasks move'} to Inbox — nothing is lost.`
    : 'It has no unfinished tasks.';

  openDialog(`
    <h3>Delete “${esc(project.name)}”?</h3>
    <p class="dialog-note">${fate}</p>
    <div class="dialog-actions">
      <button class="ghost-btn" id="d-cancel">Cancel</button>
      <button class="danger-btn" id="d-confirm">Delete project</button>
    </div>`, () => {
    const confirm = document.getElementById('d-confirm');
    confirm.focus();
    document.getElementById('d-cancel').addEventListener('click', closeDialog);
    confirm.addEventListener('click', async () => {
      closeDialog();
      await deleteProject(project);
    });
  });
}

async function deleteProject(project) {
  if (ui.view === 'project' && ui.projectId === project.id) {
    ui.view = 'today';
    ui.projectId = null;
  }
  const { state: next, result } = await window.api.deleteProject(project.id);
  state = next;
  render();
  const moved = result && result.moved
    ? ` · ${result.moved} ${result.moved === 1 ? 'task' : 'tasks'} moved to Inbox`
    : '';
  toast(`Deleted <b>${esc(project.name)}</b>${moved}`);
}

function projectDialog(existing) {
  let color = existing ? existing.color : nextColor();

  openDialog(`
    <h3>${existing ? 'Edit project' : 'New project'}</h3>
    <div class="field">
      <label for="p-name">Name</label>
      <input id="p-name" type="text" value="${existing ? esc(existing.name) : ''}" placeholder="Project name" />
    </div>
    <div class="field">
      <label>Color</label>
      <div class="color-grid">
        ${PROJECT_COLORS.map((name) => `<button data-color="${name}" class="c-${name}${name === color ? ' active' : ''}" title="${name}" aria-label="${name}"></button>`).join('')}
      </div>
    </div>
    <div class="dialog-actions">
      ${existing && !existing.inbox ? '<button class="danger-btn" id="p-delete">Delete</button>' : ''}
      <button class="ghost-btn" id="p-cancel">Cancel</button>
      <button class="primary-btn" id="p-save">${existing ? 'Save' : 'Create'}</button>
    </div>`, () => {
    const name = document.getElementById('p-name');
    name.focus();
    name.select();

    for (const button of el.dialog.querySelectorAll('[data-color]')) {
      button.addEventListener('click', () => {
        color = button.dataset.color;
        for (const b of el.dialog.querySelectorAll('[data-color]')) b.classList.remove('active');
        button.classList.add('active');
      });
    }

    const submit = async () => {
      const value = name.value.trim();
      if (!value) { name.focus(); return; }
      closeDialog();
      if (existing) {
        await commit(window.api.updateProject(existing.id, { name: value, color }));
      } else {
        const { state: next, result } = await window.api.addProject({ name: value, color });
        state = next;
        ui.view = 'project';
        ui.projectId = result.id;
        ui.selectedId = null;
        render();
      }
    };

    document.getElementById('p-save').addEventListener('click', submit);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    document.getElementById('p-cancel').addEventListener('click', closeDialog);

    const del = document.getElementById('p-delete');
    if (del) {
      del.addEventListener('click', () => {
        closeDialog();
        setTimeout(() => confirmDeleteProject(existing), REDUCED ? 0 : 210);
      });
    }
  });
}

/* ========================================================================= */
/* Theme                                                                     */
/* ========================================================================= */

function applyTheme() {
  const theme = state.settings.theme || 'system';
  const dark = theme === 'dark'
    || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/* ========================================================================= */
/* Layout panel                                                              */
/* ========================================================================= */

const LAYOUT_FIELDS = {
  group: {
    label: 'Grouping',
    options: [['auto', 'Default'], ['none', 'None'], ['date', 'Date'],
      ['priority', 'Priority'], ['project', 'Project']]
  },
  sort: {
    label: 'Sorting',
    options: [['manual', 'Manual'], ['due', 'Date'], ['priority', 'Priority'], ['alpha', 'Name']]
  },
  'filters.date': {
    label: 'Date',
    options: [['all', 'All'], ['overdue', 'Overdue'], ['today', 'Today'],
      ['week', 'Next 7 days'], ['none', 'No date']]
  },
  'filters.created': {
    label: 'Created',
    options: [['all', 'All'], ['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']]
  },
  'filters.priority': {
    label: 'Priority',
    options: [['all', 'All'], ['1', 'P1'], ['2', 'P2'], ['3', 'P3'], ['4', 'P4']]
  }
};

function layoutValue(path) {
  return path.startsWith('filters.') ? ui.filters[path.slice(8)] : ui[path];
}

function setLayoutValue(path, value) {
  if (path.startsWith('filters.')) ui.filters[path.slice(8)] = value;
  else ui[path] = value;
}

/** True when anything in the panel is off its default — drives the dot. */
function layoutChanged() {
  return ui.mode !== LAYOUT_DEFAULTS.mode
    || ui.showCompleted !== LAYOUT_DEFAULTS.showCompleted
    || ui.group !== LAYOUT_DEFAULTS.group
    || ui.sort !== LAYOUT_DEFAULTS.sort
    || Object.keys(LAYOUT_DEFAULTS.filters).some((k) => ui.filters[k] !== LAYOUT_DEFAULTS.filters[k]);
}

function loadLayout(settings = {}) {
  if (MODES.includes(settings.viewMode)) ui.mode = settings.viewMode;
  if (typeof settings.showCompleted === 'boolean') ui.showCompleted = settings.showCompleted;
  if (LAYOUT_FIELDS.group.options.some(([v]) => v === settings.group)) ui.group = settings.group;
  if (SORTS.includes(settings.sort)) ui.sort = settings.sort;
  if (settings.filters && typeof settings.filters === 'object') {
    for (const key of Object.keys(LAYOUT_DEFAULTS.filters)) {
      if (typeof settings.filters[key] === 'string') ui.filters[key] = settings.filters[key];
    }
  }
}

async function saveLayout() {
  const { state: next } = await window.api.updateSettings({
    viewMode: ui.mode,
    showCompleted: ui.showCompleted,
    group: ui.group,
    sort: ui.sort,
    filters: { ...ui.filters }
  });
  state = next;
}

function layoutPanelHTML() {
  const labels = allLabels();
  const field = (path) => {
    const spec = LAYOUT_FIELDS[path];
    const value = layoutValue(path);
    return `<label class="lay-field">
      <span>${spec.label}</span>
      <select data-layout="${path}">
        ${spec.options.map(([v, text]) =>
          `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(text)}</option>`).join('')}
      </select>
    </label>`;
  };

  return `
    <div class="lay-top">
      <div class="lay-title">Layout${layoutChanged() ? ' <span class="lay-dot"></span>' : ''}</div>
      <div class="lay-tiles">
        ${MODES.map((mode) => `
          <button class="lay-tile${mode === ui.mode ? ' active' : ''}" data-layout-mode="${mode}">
            ${ICONS[`view${mode[0].toUpperCase()}${mode.slice(1)}`]}
            <span>${mode[0].toUpperCase()}${mode.slice(1)}</span>
          </button>`).join('')}
      </div>
      <div class="lay-row">
        <span>Completed tasks</span>
        <button class="switch${ui.showCompleted ? ' on' : ''}" data-layout-toggle="showCompleted"
          role="switch" aria-checked="${ui.showCompleted}" aria-label="Show completed tasks">
          <span class="switch-knob"></span>
        </button>
      </div>
    </div>

    <div class="lay-group">
      <h4>Sort</h4>
      ${field('group')}
      ${field('sort')}
    </div>

    <div class="lay-group">
      <h4>Filter</h4>
      ${field('filters.date')}
      ${field('filters.created')}
      ${field('filters.priority')}
      <label class="lay-field">
        <span>Label</span>
        <select data-layout="filters.label">
          <option value="all"${ui.filters.label === 'all' ? ' selected' : ''}>All</option>
          ${labels.map((l) => `<option value="${esc(l)}"${ui.filters.label === l ? ' selected' : ''}>@${esc(l)}</option>`).join('')}
        </select>
      </label>
    </div>

    <div class="lay-foot">
      <button class="lay-reset" data-layout-reset="1">Reset all</button>
    </div>`;
}

function openLayoutPanel() {
  Popover.open(el.layoutBtn, layoutPanelHTML(), {
    width: 320,
    className: 'pop-layout',
    onMount: (node) => {
      const refresh = () => {
        node.innerHTML = layoutPanelHTML();
      };

      node.addEventListener('click', async (event) => {
        const tile = event.target.closest('[data-layout-mode]');
        if (tile) {
          if (tile.dataset.layoutMode !== ui.mode) {
            ui.mode = tile.dataset.layoutMode;
            ui.calMonth = null;
            el.listWrap.scrollTop = 0;
            render();
            await saveLayout();
          }
          refresh();
          return;
        }

        const toggle = event.target.closest('[data-layout-toggle]');
        if (toggle) {
          ui.showCompleted = !ui.showCompleted;
          render();
          await saveLayout();
          refresh();
          return;
        }

        if (event.target.closest('[data-layout-reset]')) {
          ui.mode = LAYOUT_DEFAULTS.mode;
          ui.showCompleted = LAYOUT_DEFAULTS.showCompleted;
          ui.group = LAYOUT_DEFAULTS.group;
          ui.sort = LAYOUT_DEFAULTS.sort;
          ui.filters = { ...LAYOUT_DEFAULTS.filters };
          ui.calMonth = null;
          render();
          await saveLayout();
          refresh();
        }
      });

      node.addEventListener('change', async (event) => {
        const select = event.target.closest('[data-layout]');
        if (!select) return;
        setLayoutValue(select.dataset.layout, select.value);
        render();
        await saveLayout();
        const dot = node.querySelector('.lay-title .lay-dot');
        if (layoutChanged() && !dot) refresh();
        else if (!layoutChanged() && dot) refresh();
      });
    }
  });
}

/* ========================================================================= */
/* Detail panel width                                                        */
/* ========================================================================= */

/** Clamps and applies the width; returns what was actually used. */
function applyDetailWidth(px) {
  const width = Math.round(Math.min(DETAIL_WIDTH.max,
    Math.max(DETAIL_WIDTH.min, Number(px) || DETAIL_WIDTH.default)));
  document.documentElement.style.setProperty('--detail-w', `${width}px`);
  return width;
}

async function saveDetailWidth(width) {
  const { state: next } = await window.api.updateSettings({ detailWidth: width });
  state = next;
}

el.detailResizer.addEventListener('mousedown', (event) => {
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = el.detail.getBoundingClientRect().width;

  el.app.classList.add('resizing');
  el.body.classList.add('resizing-x');

  // The panel is on the right, so dragging left (smaller clientX) widens it.
  const onMove = (move) => applyDetailWidth(startWidth + (startX - move.clientX));

  const onUp = (up) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    el.app.classList.remove('resizing');
    el.body.classList.remove('resizing-x');
    saveDetailWidth(applyDetailWidth(startWidth + (startX - up.clientX)));
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

el.detailResizer.addEventListener('dblclick', () => {
  saveDetailWidth(applyDetailWidth(DETAIL_WIDTH.default));
});

/* ========================================================================= */
/* Events                                                                    */
/* ========================================================================= */

function goTo(view, projectId) {
  ui.view = view;
  ui.projectId = projectId || null;
  ui.selectedId = null;
  ui.calMonth = null;
  el.listWrap.scrollTop = 0;
  render();
}

el.views.addEventListener('click', (e) => {
  const button = e.target.closest('[data-view]');
  if (button) goTo(button.dataset.view);
});

el.projects.addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) {
    projectMenu(more, projectById(more.dataset.more));
    return;
  }
  const button = e.target.closest('[data-project]');
  if (button) goTo('project', button.dataset.project);
});

el.projects.addEventListener('dblclick', (e) => {
  const button = e.target.closest('[data-project]');
  if (button) projectDialog(projectById(button.dataset.project));
});

el.projects.addEventListener('contextmenu', (e) => {
  const button = e.target.closest('[data-project]');
  if (!button) return;
  e.preventDefault();
  projectDialog(projectById(button.dataset.project));
});

el.taskList.addEventListener('click', onTaskAreaClick);
el.completedSection.addEventListener('click', onTaskAreaClick);

async function onTaskAreaClick(e) {
  const check = e.target.closest('[data-check]');
  if (check) {
    e.stopPropagation();
    const task = state.tasks.find((t) => t.id === check.dataset.check);
    if (task) await toggleTask(task);
    return;
  }

  const sortHeader = e.target.closest('[data-sort]');
  if (sortHeader) {
    ui.sort = sortHeader.dataset.sort;
    render();
    return;
  }

  const del = e.target.closest('[data-delete]');
  if (del) {
    e.stopPropagation();
    if (ui.selectedId === del.dataset.delete) ui.selectedId = null;
    await commit(window.api.deleteTask(del.dataset.delete));
    return;
  }

  if (e.target.closest('#toggle-completed')) {
    ui.showCompleted = !ui.showCompleted;
    render();
    return;
  }

  if (e.target.closest('#clear-completed')) {
    await commit(window.api.clearCompleted());
    return;
  }

  const row = e.target.closest('[data-id]');
  if (row) {
    ui.selectedId = ui.selectedId === row.dataset.id ? null : row.dataset.id;
    render();
  }
}

function setHint(node, html) {
  node.innerHTML = html;
  node.classList.toggle('visible', Boolean(html));
}

el.quickAdd.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addFromQuickAdd();
  } else if (e.key === 'Escape') {
    el.quickAdd.value = '';
    setHint(el.composerHint, '');
    el.quickAdd.blur();
  }
});

el.quickAdd.addEventListener('input', () => {
  const text = el.quickAdd.value.trim();
  setHint(el.composerHint, text ? hintFor(text) : '');
});

/* ------------------------------------------------- floating quick-add wiring */

el.quickPlus.innerHTML = ICONS.plus;
el.quickClose.innerHTML = ICONS.close;
el.quickSubmit.innerHTML = ICONS.check;

el.quickClose.addEventListener('click', closeQuickAdd);
el.quickSubmit.addEventListener('click', submitQuickAdd);

el.quickOverlay.addEventListener('mousedown', (event) => {
  if (event.target === el.quickOverlay) closeQuickAdd();
});

el.quickInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitQuickAdd();
  }
});

el.quickInput.addEventListener('input', () => {
  const text = el.quickInput.value.trim();
  el.quickCard.classList.toggle('ready', Boolean(text));
  setHint(el.quickHint, text ? hintFor(text) : '');
});

el.search.addEventListener('input', () => {
  ui.search = el.search.value;
  render();
});

el.search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    el.search.value = '';
    ui.search = '';
    el.search.blur();
    render();
  }
});

el.layoutBtn.querySelector('.layout-icon').innerHTML = ICONS.layout;
el.layoutBtn.addEventListener('click', () => {
  if (Popover.depth) Popover.closeAll();
  else openLayoutPanel();
});

/* ------------------------------------------------------------ board events */

el.boardView.addEventListener('click', onTaskAreaClick);

el.boardView.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add-col]');
  if (add) openQuickAdd({ status: add.dataset.addCol });
});

let draggingId = null;

el.boardView.addEventListener('dragstart', (event) => {
  const card = event.target.closest('.bcard');
  if (!card) return;
  draggingId = card.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggingId);
  card.classList.add('dragging');
});

el.boardView.addEventListener('dragend', () => {
  draggingId = null;
  for (const node of el.boardView.querySelectorAll('.dragging, .drag-over')) {
    node.classList.remove('dragging', 'drag-over');
  }
});

el.boardView.addEventListener('dragover', (event) => {
  const body = event.target.closest('[data-drop]');
  if (!body) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  for (const node of el.boardView.querySelectorAll('.drag-over')) node.classList.remove('drag-over');
  body.classList.add('drag-over');
});

el.boardView.addEventListener('dragleave', (event) => {
  const body = event.target.closest('[data-drop]');
  if (body && !body.contains(event.relatedTarget)) body.classList.remove('drag-over');
});

el.boardView.addEventListener('drop', async (event) => {
  const body = event.target.closest('[data-drop]');
  if (!body) return;
  event.preventDefault();
  body.classList.remove('drag-over');
  const id = draggingId || event.dataTransfer.getData('text/plain');
  draggingId = null;
  if (id) await moveCard(id, body.dataset.drop);
});

el.calendarView.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-cal-nav]');
  if (nav) {
    const month = calendarMonth();
    ui.calMonth = nav.dataset.calNav === 'today'
      ? null
      : new Date(month.getFullYear(), month.getMonth() + (nav.dataset.calNav === 'next' ? 1 : -1), 1);
    render();
    return;
  }

  const chip = event.target.closest('.cal-chip[data-id]');
  if (chip) {
    ui.selectedId = ui.selectedId === chip.dataset.id ? null : chip.dataset.id;
    render();
    return;
  }

  // Clicking empty space in a day starts a task on that date.
  const cell = event.target.closest('.cal-cell');
  if (cell) openQuickAdd({ due: cell.dataset.date });
});

el.themeBtn.addEventListener('click', async () => {
  const order = ['system', 'light', 'dark'];
  const current = state.settings.theme || 'system';
  const next = order[(order.indexOf(current) + 1) % order.length];
  const { state: updated } = await window.api.updateSettings({ theme: next });
  state = updated;

  el.body.classList.add('theming');
  applyTheme();
  render();
  setTimeout(() => el.body.classList.remove('theming'), 260);
});

el.addTaskBtn.querySelector('.add-task-icon').innerHTML = ICONS.plus;
el.addTaskBtn.addEventListener('click', openQuickAdd);

el.addProjectBtn.innerHTML = ICONS.plus;
el.addProjectBtn.addEventListener('click', () => projectDialog(null));

el.searchWrap.insertAdjacentHTML('afterbegin', ICONS.search);
el.composerField.insertAdjacentHTML('afterbegin', `<span class="plus">${ICONS.plus}</span>`);

el.backdrop.addEventListener('mousedown', (e) => {
  if (e.target === el.backdrop) closeDialog();
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
window.addEventListener('resize', moveIndicator);

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

  if (e.key === 'Escape') {
    if (!el.backdrop.hidden) { closeDialog(); return; }
    if (quickAddOpen()) { closeQuickAdd(); return; }
    if (ui.selectedId) { ui.selectedId = null; render(); }
    return;
  }

  if (typing || e.metaKey || e.ctrlKey) return;

  if (e.key === 'q' || e.key === 'a') {
    e.preventDefault();
    openQuickAdd();
  } else if (e.key === '/') {
    e.preventDefault();
    el.search.focus();
  }
});

// Reminders fire in the main process, which pushes the updated state back.
window.api.onStateChange((next) => {
  state = next;
  render();
});

// A file dropped anywhere but the composer would otherwise make the window
// navigate to it, replacing the whole app with the file's contents.
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (e) => {
    if (e.target.closest && e.target.closest('#c-composer')) return;
    e.preventDefault();
  });
}

window.api.onMenu((channel, payload) => {
  if (channel === 'menu:focus-task') {
    const task = state.tasks.find((t) => t.id === payload);
    if (task) {
      goTo(task.completed ? 'completed' : 'all');
      ui.selectedId = task.id;
      render();
    }
    return;
  }
  if (channel === 'menu:new-task') openQuickAdd();
  else if (channel === 'menu:new-project') projectDialog(null);
  else if (channel === 'menu:search') el.search.focus();
  else if (channel === 'menu:view') goTo(payload);
});

refresh();
