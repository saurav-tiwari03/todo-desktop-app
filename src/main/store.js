'use strict';

const fs = require('fs');
const path = require('path');
const { nextOccurrence, daysBetween } = require('./recurrence');

const SCHEMA_VERSION = 1;
const STATUSES = ['todo', 'doing', 'done'];

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyData() {
  const inboxId = nextId();
  return {
    version: SCHEMA_VERSION,
    projects: [{ id: inboxId, name: 'Inbox', color: 'slate', inbox: true, createdAt: Date.now() }],
    tasks: [],
    settings: { theme: 'system' }
  };
}

/**
 * Single-file JSON store. Writes go to a temp file first and are renamed into
 * place, so a crash mid-write can never leave a half-written database behind.
 */
class Store {
  constructor(dir) {
    this.file = path.join(dir, 'tasks.json');
    this.backup = path.join(dir, 'tasks.backup.json');
    // Attached files are copied here rather than referenced where they sit, so
    // a task keeps its attachment after the original is moved or deleted.
    this.attachmentsDir = path.join(dir, 'attachments');
    this.data = this.load();
  }

  load() {
    for (const file of [this.file, this.backup]) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        return this.migrate(parsed);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`Could not read ${file}:`, err.message);
        }
      }
    }
    return emptyData();
  }

  migrate(data) {
    if (!data || typeof data !== 'object') return emptyData();
    data.version = data.version || SCHEMA_VERSION;
    data.projects = Array.isArray(data.projects) ? data.projects : [];
    data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    data.settings = data.settings || { theme: 'system' };
    for (const task of data.tasks) {
      if (!('dueTime' in task)) task.dueTime = null;
      if (!('deadline' in task)) task.deadline = null;
      if (!('repeat' in task)) task.repeat = null;
      if (!Array.isArray(task.reminders)) task.reminders = [];
      if (!('completions' in task)) task.completions = 0;
      if (!Array.isArray(task.comments)) task.comments = [];
      if (!STATUSES.includes(task.status)) task.status = task.completed ? 'done' : 'todo';
    }
    if (!data.projects.some((p) => p.inbox)) {
      data.projects.unshift({
        id: nextId(), name: 'Inbox', color: 'slate', inbox: true, createdAt: Date.now()
      });
    }
    return data;
  }

  save() {
    const tmp = `${this.file}.tmp`;
    const json = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(tmp, json, 'utf8');
    try {
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backup);
    } catch (err) {
      console.error('Backup failed:', err.message);
    }
    fs.renameSync(tmp, this.file);
    return this.data;
  }

  snapshot() {
    return this.data;
  }

  get inboxId() {
    const inbox = this.data.projects.find((p) => p.inbox);
    return inbox ? inbox.id : null;
  }

  /* ---------------------------------------------------------------- tasks */

  addTask(input) {
    const now = Date.now();
    const task = {
      id: nextId(),
      title: (input.title || '').trim() || 'Untitled task',
      notes: input.notes || '',
      projectId: this.resolveProject(input.projectId),
      due: input.due || null,
      dueTime: input.dueTime || null,
      status: STATUSES.includes(input.status) ? input.status : 'todo',
      deadline: input.deadline || null,
      repeat: input.repeat || null,
      reminders: Array.isArray(input.reminders) ? input.reminders : [],
      priority: clampPriority(input.priority),
      labels: Array.isArray(input.labels) ? input.labels : [],
      completed: false,
      completedAt: null,
      completions: 0,
      comments: [],
      createdAt: now,
      updatedAt: now,
      order: this.data.tasks.length
    };
    this.data.tasks.push(task);
    this.save();
    return task;
  }

  updateTask(id, patch) {
    const task = this.data.tasks.find((t) => t.id === id);
    if (!task) return null;
    const allowed = ['title', 'notes', 'due', 'dueTime', 'deadline', 'repeat',
      'reminders', 'priority', 'projectId', 'labels', 'order', 'status'];
    for (const key of allowed) {
      if (!(key in patch)) continue;
      if (key === 'priority') task.priority = clampPriority(patch.priority);
      else if (key === 'projectId') task.projectId = this.resolveProject(patch.projectId);
      else task[key] = patch[key];
    }
    if ('status' in patch && !STATUSES.includes(task.status)) task.status = 'todo';
    if ('completed' in patch) {
      task.completed = Boolean(patch.completed);
      task.completedAt = task.completed ? Date.now() : null;
      // A task put back in play shouldn't still be sitting in the Done column.
      if (!task.completed && task.status === 'done') task.status = 'todo';
      if (task.completed) task.status = 'done';
    }
    if (!task.due) task.dueTime = null;
    task.updatedAt = Date.now();
    this.save();
    return task;
  }

  /**
   * Completing a task. A repeating task is not finished — it rolls forward to
   * its next occurrence, carrying its reminders with it — until the rule ends.
   */
  completeTask(id, todayISO) {
    const task = this.data.tasks.find((t) => t.id === id);
    if (!task) return null;

    const next = task.repeat ? nextOccurrence(task.repeat, task.due, todayISO) : null;

    if (!next) {
      task.completed = true;
      task.completedAt = Date.now();
      task.status = 'done';
      task.updatedAt = Date.now();
      this.save();
      return { task, recurred: false };
    }

    const shift = daysBetween(task.due || todayISO, next);
    task.reminders = (task.reminders || []).map((r) => ({
      ...r,
      at: shiftDateTime(r.at, shift),
      fired: false
    }));
    if (task.deadline) task.deadline = shiftDate(task.deadline, shift);

    task.due = next;
    task.completions = (task.completions || 0) + 1;
    task.lastCompletedAt = Date.now();
    task.updatedAt = Date.now();
    this.save();
    return { task, recurred: true };
  }

  /** Marks reminders as delivered so they don't fire twice. */
  markRemindersFired(entries) {
    let touched = false;
    for (const { taskId, reminderId } of entries) {
      const task = this.data.tasks.find((t) => t.id === taskId);
      if (!task) continue;
      for (const reminder of task.reminders || []) {
        if (reminder.id === reminderId && !reminder.fired) {
          reminder.fired = true;
          touched = true;
        }
      }
    }
    if (touched) this.save();
    return touched;
  }

  deleteTask(id) {
    const doomed = this.data.tasks.filter((t) => t.id === id);
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
    if (!doomed.length) return { deleted: 0 };
    this.discardFiles(doomed);
    this.save();
    return { deleted: doomed.length };
  }

  clearCompleted() {
    const doomed = this.data.tasks.filter((t) => t.completed);
    this.data.tasks = this.data.tasks.filter((t) => !t.completed);
    this.discardFiles(doomed);
    this.save();
    return { deleted: doomed.length };
  }

  /* ------------------------------------------------- comments and files */

  /**
   * Copies a file into the attachments folder and describes it. The copy is
   * named after its own id, so two files called "scan.pdf" never collide.
   */
  importAttachment(sourcePath) {
    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) throw new Error(`${path.basename(sourcePath)} is a folder`);

    const id = nextId();
    const name = path.basename(sourcePath);
    const ext = path.extname(name).toLowerCase();
    const stored = `${id}${ext}`;

    fs.mkdirSync(this.attachmentsDir, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(this.attachmentsDir, stored));

    return { id, name, file: stored, size: stat.size, ext: ext.replace('.', '') };
  }

  attachmentPath(file) {
    return path.join(this.attachmentsDir, path.basename(file));
  }

  addComment(taskId, { text = '', paths = [] } = {}) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return null;

    const attachments = [];
    const failed = [];
    for (const source of paths) {
      try {
        attachments.push(this.importAttachment(source));
      } catch (err) {
        failed.push(`${path.basename(source)}: ${err.message}`);
      }
    }

    const body = String(text).trim();
    if (!body && !attachments.length) return { comment: null, failed };

    const comment = { id: nextId(), text: body, attachments, at: Date.now(), editedAt: null };
    task.comments = task.comments || [];
    task.comments.push(comment);
    task.updatedAt = Date.now();
    this.save();
    return { comment, failed };
  }

  updateComment(taskId, commentId, text) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    const comment = task && (task.comments || []).find((c) => c.id === commentId);
    if (!comment) return null;
    const body = String(text).trim();
    // A comment that is only an attachment may not be emptied into nothing.
    if (!body && !(comment.attachments || []).length) return comment;
    comment.text = body;
    comment.editedAt = Date.now();
    task.updatedAt = Date.now();
    this.save();
    return comment;
  }

  deleteComment(taskId, commentId) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return { deleted: 0 };
    const doomed = (task.comments || []).filter((c) => c.id === commentId);
    task.comments = (task.comments || []).filter((c) => c.id !== commentId);
    if (!doomed.length) return { deleted: 0 };
    this.unlinkAll(doomed.flatMap((c) => c.attachments || []));
    task.updatedAt = Date.now();
    this.save();
    return { deleted: 1 };
  }

  deleteAttachment(taskId, commentId, attachmentId) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    const comment = task && (task.comments || []).find((c) => c.id === commentId);
    if (!comment) return { deleted: 0 };

    const doomed = (comment.attachments || []).filter((a) => a.id === attachmentId);
    comment.attachments = (comment.attachments || []).filter((a) => a.id !== attachmentId);
    if (!doomed.length) return { deleted: 0 };
    this.unlinkAll(doomed);

    // An attachment-only comment has nothing left to say once it is gone.
    if (!comment.text && !comment.attachments.length) {
      task.comments = task.comments.filter((c) => c.id !== commentId);
    }
    task.updatedAt = Date.now();
    this.save();
    return { deleted: 1 };
  }

  /** Attachment files of tasks that are on their way out. */
  discardFiles(tasks) {
    this.unlinkAll(tasks.flatMap((t) => (t.comments || []).flatMap((c) => c.attachments || [])));
  }

  unlinkAll(attachments) {
    for (const attachment of attachments) {
      try {
        fs.unlinkSync(this.attachmentPath(attachment.file));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('Could not remove attachment:', err.message);
      }
    }
  }

  /* ------------------------------------------------------------- projects */

  resolveProject(projectId) {
    if (projectId && this.data.projects.some((p) => p.id === projectId)) return projectId;
    return this.inboxId;
  }

  addProject(input) {
    const project = {
      id: nextId(),
      name: (input.name || '').trim() || 'New project',
      color: input.color || 'blue',
      inbox: false,
      createdAt: Date.now()
    };
    this.data.projects.push(project);
    this.save();
    return project;
  }

  updateProject(id, patch) {
    const project = this.data.projects.find((p) => p.id === id);
    if (!project) return null;
    if ('name' in patch) project.name = (patch.name || '').trim() || project.name;
    if ('color' in patch) project.color = patch.color;
    this.save();
    return project;
  }

  /** Deleting a project moves its tasks to the Inbox rather than losing them. */
  deleteProject(id) {
    const project = this.data.projects.find((p) => p.id === id);
    if (!project || project.inbox) return { deleted: 0 };
    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    const inbox = this.inboxId;
    let moved = 0;
    for (const task of this.data.tasks) {
      if (task.projectId === id) {
        task.projectId = inbox;
        moved += 1;
      }
    }
    this.save();
    return { deleted: 1, moved };
  }

  /* ------------------------------------------------------------- settings */

  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
    return this.data.settings;
  }
}

/** Moves a 'YYYY-MM-DD' string by whole days. */
function shiftDate(iso, days) {
  if (!iso || !days) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Moves a 'YYYY-MM-DDTHH:MM' string by whole days, keeping the time. */
function shiftDateTime(value, days) {
  if (!value) return value;
  const [datePart, timePart] = String(value).split('T');
  const shifted = shiftDate(datePart, days);
  return timePart ? `${shifted}T${timePart}` : shifted;
}

function clampPriority(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 4;
  return Math.min(4, Math.max(1, Math.round(n)));
}

module.exports = { Store, nextId, STATUSES };
