'use strict';

/**
 * Quick-add parser: turns "Pay rent tomorrow p1 #Home @bills" into a task.
 * Everything it recognises is stripped from the title, so what is left is
 * exactly what the user wanted the task to be called.
 */
const NLP = (() => {
  const WEEKDAYS = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6
  };

  const MONTHS = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
    dec: 11, december: 11
  };

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fromISO(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /** A month/day with no year means the next time that date comes around. */
  function monthDayToISO(month, day) {
    const today = startOfToday();
    let candidate = new Date(today.getFullYear(), month, day);
    if (candidate < today) candidate = new Date(today.getFullYear() + 1, month, day);
    return toISO(candidate);
  }

  function weekdayToISO(target, isNext) {
    const today = startOfToday();
    let diff = (target - today.getDay() + 7) % 7;
    if (isNext && diff === 0) diff = 7;
    return toISO(addDays(today, diff));
  }

  // Each rule gets a chance to claim a slice of the text, longest-first so
  // "next monday" wins over the bare "monday" inside it.
  const DATE_RULES = [
    [/\b(today|tod)\b/i, () => toISO(startOfToday())],
    [/\b(tomorrow|tmrw?|tom)\b/i, () => toISO(addDays(startOfToday(), 1))],
    [/\byesterday\b/i, () => toISO(addDays(startOfToday(), -1))],
    [/\bnext week\b/i, () => toISO(addDays(startOfToday(), 7))],
    [/\bnext month\b/i, () => {
      const d = startOfToday();
      d.setMonth(d.getMonth() + 1);
      return toISO(d);
    }],
    [/\bin (\d{1,3}) (day|days)\b/i, (m) => toISO(addDays(startOfToday(), Number(m[1])))],
    [/\bin (\d{1,2}) (week|weeks)\b/i, (m) => toISO(addDays(startOfToday(), Number(m[1]) * 7))],
    [/\bin (\d{1,2}) (month|months)\b/i, (m) => {
      const d = startOfToday();
      d.setMonth(d.getMonth() + Number(m[1]));
      return toISO(d);
    }],
    [/\bnext (sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/i,
      (m) => weekdayToISO(WEEKDAYS[m[1].toLowerCase()], true)],
    [/\b(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/i,
      (m) => weekdayToISO(WEEKDAYS[m[1].toLowerCase()], false)],
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => {
      const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(date.getTime()) ? null : toISO(date);
    }],
    [/\b(\d{1,2})\/(\d{1,2})\b/, (m) => {
      const month = Number(m[1]) - 1;
      const day = Number(m[2]);
      if (month < 0 || month > 11 || day < 1 || day > 31) return null;
      return monthDayToISO(month, day);
    }],
    [/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.? (\d{1,2})(?:st|nd|rd|th)?\b/i,
      (m) => monthDayToISO(MONTHS[m[1].toLowerCase()], Number(m[2]))],
    [/\b(\d{1,2})(?:st|nd|rd|th)? (jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i,
      (m) => monthDayToISO(MONTHS[m[2].toLowerCase()], Number(m[1]))]
  ];

  /**
   * @param {string} text raw quick-add input
   * @param {Array<{id: string, name: string}>} projects for resolving #project
   */
  function parse(text, projects = []) {
    let rest = ` ${text} `;
    const out = { title: '', due: null, priority: 4, projectId: null, projectName: null, labels: [] };

    // #project — matched against real project names, longest name first so
    // "#Work Trip" beats "#Work" when both exist.
    const byLength = [...projects].sort((a, b) => b.name.length - a.name.length);
    const hashes = rest.match(/#[^\s#@]+(?:\s+[^\s#@]+)*/g) || [];
    for (const raw of hashes) {
      const query = raw.slice(1).trim().toLowerCase();
      const hit = byLength.find((p) => query.startsWith(p.name.toLowerCase()));
      if (hit) {
        out.projectId = hit.id;
        out.projectName = hit.name;
        rest = rest.replace(`#${hit.name}`, ' ');
        rest = rest.replace(new RegExp(`#${escapeRe(hit.name)}`, 'i'), ' ');
        break;
      }
    }
    if (!out.projectId) {
      const loose = rest.match(/#([^\s#@]+)/);
      if (loose) {
        out.projectName = loose[1];
        rest = rest.replace(loose[0], ' ');
      }
    }

    // @labels
    const labels = rest.match(/@([^\s#@]+)/g) || [];
    for (const raw of labels) {
      out.labels.push(raw.slice(1));
      rest = rest.replace(raw, ' ');
    }

    // p1..p4 priority
    const prio = rest.match(/\b(?:p|!)([1-4])\b/i);
    if (prio) {
      out.priority = Number(prio[1]);
      rest = rest.replace(prio[0], ' ');
    }

    // due date
    for (const [re, resolve] of DATE_RULES) {
      const match = rest.match(re);
      if (!match) continue;
      const iso = resolve(match);
      if (!iso) continue;
      out.due = iso;
      rest = rest.replace(match[0], ' ');
      break;
    }

    out.title = rest.replace(/\s+/g, ' ').trim();
    return out;
  }

  function escapeRe(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return { parse, toISO, fromISO, addDays, startOfToday };
})();

if (typeof module !== 'undefined') module.exports = NLP;
if (typeof window !== 'undefined') window.NLP = NLP;
