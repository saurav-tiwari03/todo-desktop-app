'use strict';

/**
 * Recurrence maths. A repeat rule looks like:
 *
 *   { unit: 'day'|'week'|'weekday'|'month'|'year',
 *     every: 1,
 *     weekday: 0-6 | null,        // for weekly rules
 *     basedOn: 'scheduled'|'completed',
 *     ends: { type: 'never'|'on', date: 'YYYY-MM-DD'|null } }
 */

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromISO(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/** Adds months while clamping to the end of shorter months (31 Jan → 28 Feb). */
function addMonths(date, months) {
  const day = date.getDate();
  const out = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
}

function nextWeekday(date) {
  let out = addDays(date, 1);
  while (out.getDay() === 0 || out.getDay() === 6) out = addDays(out, 1);
  return out;
}

/**
 * The next due date after `fromISO`, or null when the rule has run out.
 * `todayISODate` is the completion date, used by 'completed'-based rules.
 */
/** One step of the rule, always measured from the original anchor so that
    clamping never compounds (31 Jan monthly stays on the 31st, not the 28th). */
function step(anchor, unit, every, weekday, times) {
  switch (unit) {
    case 'day':
      return addDays(anchor, every * times);
    case 'week': {
      if (weekday == null) return addDays(anchor, every * 7 * times);
      const delta = ((weekday - anchor.getDay() + 7) % 7) || 7;
      return addDays(anchor, delta + (every * times - 1) * 7);
    }
    case 'weekday': {
      let out = anchor;
      for (let i = 0; i < every * times; i += 1) out = nextWeekday(out);
      return out;
    }
    case 'month':
      return addMonths(anchor, every * times);
    case 'year':
      return addMonths(anchor, every * 12 * times);
    default:
      return null;
  }
}

/**
 * The next due date after the anchor, or null when the rule has run out.
 * `todayISODate` is the completion date, used by 'completed'-based rules and
 * to skip past occurrences when a task was finished late.
 */
function nextOccurrence(repeat, dueISO, todayISODate) {
  if (!repeat || !repeat.unit) return null;

  const every = Math.max(1, Number(repeat.every) || 1);
  const anchorISO = repeat.basedOn === 'completed' ? todayISODate : (dueISO || todayISODate);
  const anchor = fromISO(anchorISO);
  if (!anchor) return null;

  const today = fromISO(todayISODate);
  let times = 1;
  let next = step(anchor, repeat.unit, every, repeat.weekday, times);
  if (!next) return null;

  while (today && next <= today && times < 500) {
    times += 1;
    next = step(anchor, repeat.unit, every, repeat.weekday, times);
  }

  const iso = toISO(next);
  const ends = repeat.ends || {};
  if (ends.type === 'on' && ends.date && iso > ends.date) return null;
  return iso;
}

/** Days between two ISO dates, used to carry reminders along with the task. */
function daysBetween(fromISODate, toISODate) {
  const a = fromISO(fromISODate);
  const b = fromISO(toISODate);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

module.exports = { nextOccurrence, daysBetween, toISO, fromISO, addDays, addMonths };
