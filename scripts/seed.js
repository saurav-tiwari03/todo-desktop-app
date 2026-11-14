#!/usr/bin/env node
'use strict';

/**
 * Fills the app with realistic sample data.
 *
 *   node scripts/seed.js              append samples, keeping what's there
 *   node scripts/seed.js --replace    drop everything first (Inbox is kept)
 *
 * The previous file is copied to tasks.before-seed.json either way. Quit the
 * app before running this, or it will write its in-memory copy back over.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Kodeit Todo');
const FILE = path.join(DIR, 'tasks.json');
const REPLACE = process.argv.includes('--replace');

const today = new Date();
today.setHours(0, 0, 0, 0);

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return iso(d);
};
const at = (offset, time) => `${day(offset)}T${time}`;
const ago = (days, hour = 10) => {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

let counter = 0;
const id = () => `seed${Date.now().toString(36)}${(counter += 1).toString(36)}`;

const repeat = (unit, extra = {}) => ({
  unit, every: 1, basedOn: 'scheduled', ends: { type: 'never', date: null }, ...extra
});

/* ------------------------------------------------------------------ sample */

const PROJECTS = [
  { key: 'work', name: 'Work', color: 'red' },
  { key: 'home', name: 'Home', color: 'orange' },
  { key: 'health', name: 'Health', color: 'green' },
  { key: 'learning', name: 'Learning', color: 'purple' },
  { key: 'errands', name: 'Errands', color: 'teal' }
];

// due: day offset from today, or null. deadline/reminders likewise.
const TASKS = [
  // overdue
  { title: 'Reply to the recruiter email', project: 'work', due: -3, priority: 1, labels: ['calls'],
    notes: 'They asked for availability for a first call next week.' },
  { title: 'Return the library books', project: 'errands', due: -1, priority: 3, labels: ['errands'] },

  // today
  { title: 'Finish the quarterly report', project: 'work', due: 0, time: '14:00', priority: 1,
    labels: ['deep-work'], deadline: 2, reminders: ['13:30'],
    notes: 'Numbers are in the shared sheet. Draft the summary first, charts after.' },
  { title: 'Standup', project: 'work', due: 0, time: '09:30', priority: 3,
    repeat: repeat('weekday') },
  { title: 'Walk 30 minutes', project: 'health', due: 0, priority: 4, repeat: repeat('day') },
  { title: 'Pay the electricity bill', project: 'home', due: 0, priority: 2, labels: ['bills'] },

  // tomorrow and this week
  { title: 'Grocery run', project: 'errands', due: 1, priority: 3, labels: ['errands'],
    notes: 'Coffee, oats, olive oil, washing powder.' },
  { title: 'Weekly review', project: 'work', due: 1, time: '17:00', priority: 2,
    repeat: repeat('week', { weekday: new Date(today.getTime() + 86400000).getDay() }) },
  { title: 'Dentist appointment', project: 'health', due: 3, time: '11:15', priority: 1,
    reminders: ['10:00'], remindOffset: 3 },
  { title: 'Review the design handoff', project: 'work', due: 4, priority: 2, labels: ['deep-work'] },
  { title: 'Call Mum', project: 'home', due: 5, priority: 2, labels: ['calls'] },

  // next week and beyond
  { title: 'Renew gym membership', project: 'health', due: 9, priority: 3, deadline: 12 },
  { title: 'Finish the TypeScript course', project: 'learning', due: 12, priority: 2,
    labels: ['reading'], notes: 'Two modules left — generics and declaration files.' },
  { title: 'Book flights for the December trip', project: 'home', due: 14, priority: 1,
    deadline: 18, labels: ['bills'] },
  { title: 'Rent', project: 'home', due: 17, priority: 1, labels: ['bills'],
    repeat: repeat('month', { day: 1 }) },
  { title: 'Car service', project: 'errands', due: 24, priority: 3 },

  // no date — these live in the Inbox
  { title: 'Read “Designing Data-Intensive Applications”', project: 'learning', due: null,
    priority: 4, labels: ['reading'] },
  { title: 'Sort out the loft', project: 'home', due: null, priority: 4 },
  { title: 'Ideas for the side project', project: null, due: null, priority: 4,
    notes: 'A small CLI for tracking reading progress?' },

  // already done
  { title: 'Send the invoice', project: 'work', due: -2, priority: 2, done: 2 },
  { title: 'Top up the travel card', project: 'errands', due: -2, priority: 3, done: 2 },
  { title: 'Book the eye test', project: 'health', due: -1, priority: 2, done: 1 },
  { title: 'Clear the inbox to zero', project: 'work', due: 0, priority: 3, done: 0 }
];

/* -------------------------------------------------------------------- write */

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return null;
  }
}

function main() {
  fs.mkdirSync(DIR, { recursive: true });

  const existing = load();
  if (existing) {
    fs.copyFileSync(FILE, path.join(DIR, 'tasks.before-seed.json'));
  }

  const data = existing && !REPLACE
    ? existing
    : {
      version: 1,
      projects: (existing ? existing.projects.filter((p) => p.inbox) : []),
      tasks: [],
      settings: (existing && existing.settings) || { theme: 'system' }
    };

  if (!data.projects.some((p) => p.inbox)) {
    data.projects.unshift({ id: id(), name: 'Inbox', color: 'slate', inbox: true, createdAt: Date.now() });
  }
  const inboxId = data.projects.find((p) => p.inbox).id;

  // Reuse a project of the same name if the user already has one.
  const byKey = {};
  for (const spec of PROJECTS) {
    const found = data.projects.find((p) => p.name.toLowerCase() === spec.name.toLowerCase());
    if (found) {
      byKey[spec.key] = found.id;
      continue;
    }
    const project = { id: id(), name: spec.name, color: spec.color, inbox: false, createdAt: Date.now() };
    data.projects.push(project);
    byKey[spec.key] = project.id;
  }

  let order = data.tasks.length;
  for (const spec of TASKS) {
    const created = ago(Math.max(1, Math.abs(spec.due || 2)) + 2);
    const due = spec.due == null ? null : day(spec.due);

    data.tasks.push({
      id: id(),
      title: spec.title,
      notes: spec.notes || '',
      projectId: spec.project ? byKey[spec.project] : inboxId,
      due,
      dueTime: spec.time || null,
      deadline: spec.deadline == null ? null : day(spec.deadline),
      repeat: spec.repeat || null,
      reminders: (spec.reminders || []).map((time) => ({
        id: id(),
        at: at(spec.remindOffset != null ? spec.remindOffset : (spec.due || 0), time),
        fired: false
      })),
      priority: spec.priority,
      labels: spec.labels || [],
      completed: spec.done != null,
      completedAt: spec.done != null ? ago(spec.done, 16) : null,
      completions: 0,
      createdAt: created,
      updatedAt: created,
      order: (order += 1)
    });
  }

  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');

  const open = data.tasks.filter((t) => !t.completed).length;
  console.log(`Seeded ${FILE}`);
  console.log(`  projects : ${data.projects.length} (${data.projects.map((p) => p.name).join(', ')})`);
  console.log(`  tasks    : ${data.tasks.length} (${open} open, ${data.tasks.length - open} completed)`);
  if (existing) console.log(`  previous : ${path.join(DIR, 'tasks.before-seed.json')}`);
}

main();
