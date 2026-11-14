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

  /* ----------------------------------------------------- dictated input */

  // Dictation writes words, not symbols: "p1" comes out as "p one", "#Home"
  // as "project home". These let the spoken grammar reach the same result.
  const WORD_NUM = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, quarter: 15, half: 30
  };

  const NUM_WORD = Object.keys(WORD_NUM).join('|');

  // Where a spoken project or label name has to stop: the next keyword, or
  // any word that starts a date, so "project home tomorrow" keeps them apart.
  const STOP_WORDS = [
    'priority', 'project', 'list', 'label', 'tag', 'labelled', 'labeled', 'tagged', 'due',
    'today', 'tod', 'tomorrow', 'tmrw', 'tmr', 'tom', 'yesterday', 'next', 'in',
    ...Object.keys(WEEKDAYS), ...Object.keys(MONTHS)
  ].join('|');

  // A spoken name never starts with one of these, so "tag for the dog" and
  // "project the roof" stay part of the title instead of being claimed.
  const FUNCTION_WORDS = new Set([
    'a', 'an', 'the', 'for', 'to', 'of', 'with', 'and', 'or', 'from', 'about',
    'into', 'onto', 'that', 'this', 'it', 'is', 'was', 'be', 'my', 'our', 'his',
    'her', 'their', 'your', 'me', 'him', 'them', 'us', 'up', 'out', 'off'
  ]);

  function namedValue(raw) {
    const name = String(raw || '').trim();
    if (!name) return null;
    if (FUNCTION_WORDS.has(name.split(/\s+/)[0].toLowerCase())) return null;
    return name;
  }

  function spokenNumber(token) {
    if (token === undefined || token === null) return null;
    const text = String(token).trim().toLowerCase();
    if (/^\d+$/.test(text)) return Number(text);
    if (text in WORD_NUM) return WORD_NUM[text];
    // "forty five", "twenty one"
    const parts = text.split(/[\s-]+/);
    if (parts.length === 2 && parts[0] in WORD_NUM && parts[1] in WORD_NUM) {
      const tens = WORD_NUM[parts[0]];
      const units = WORD_NUM[parts[1]];
      if (tens % 10 === 0 && units < 10) return tens + units;
    }
    return null;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /**
   * Pulls the spoken modifiers out of dictated text and hands the rest to
   * parse(). The grammar is fixed and documented in the README:
   *
   *   <title> [<when>] [at <time>] [priority N] [project NAME] [label NAME]
   *
   * Only used when dictation mode is on, because a keyword like "project" is
   * an ordinary word in a typed title ("call project manager").
   */
  function parseSpoken(text, projects = []) {
    let rest = ` ${String(text || '').trim()} `;
    const extra = { priority: null, projectName: null, labels: [], dueTime: null };

    // A rule that returns false rejected the match: leave the words in the
    // title untouched and stop looking, rather than eating them.
    const take = (re, onMatch) => {
      let match;
      while ((match = rest.match(re))) {
        if (onMatch(match) === false) break;
        rest = rest.replace(match[0], ' ');
      }
    };

    // "at 5pm", "at 5:30 pm", "at five thirty pm", "at seven o'clock"
    take(new RegExp(
      `\\bat\\s+(\\d{1,2}|${NUM_WORD})` +
      `(?:\\s*[:.]\\s*(\\d{2})|\\s+(\\d{2})|\\s+(${NUM_WORD}(?:[\\s-]${NUM_WORD})?))?` +
      `\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|o'?\\s?clock)\\b`, 'i'), (m) => {
      let hour = spokenNumber(m[1]);
      const minute = m[2] ? Number(m[2])
        : m[3] ? Number(m[3])
        : m[4] ? spokenNumber(m[4]) : 0;
      const suffix = (m[5] || '').toLowerCase().replace(/[.'\s]/g, '');
      if (hour === null || hour > 23 || minute === null || minute > 59) return false;
      if (suffix.startsWith('p') && hour < 12) hour += 12;
      if (suffix.startsWith('a') && hour === 12) hour = 0;
      extra.dueTime = `${pad2(hour)}:${pad2(minute)}`;
    });

    // "priority one", "priority 1", "p two"
    take(new RegExp(`\\b(?:priority|p)\\s+(${NUM_WORD}|[1-4])\\b`, 'i'), (m) => {
      const n = spokenNumber(m[1]);
      if (!n || n < 1 || n > 4) return false;
      extra.priority = n;
    });

    // "project Home", "in list Errands"
    take(new RegExp(
      `\\b(?:in\\s+)?(?:project|list)\\s+(.+?)(?=\\s+(?:${STOP_WORDS})\\b|\\s*$)`, 'i'), (m) => {
      const name = namedValue(m[1]);
      if (!name) return false;
      extra.projectName = name;
    });

    // "label calls", "tag urgent"
    take(new RegExp(
      `\\b(?:label|labelled|labeled|tag|tagged)\\s+(.+?)(?=\\s+(?:${STOP_WORDS})\\b|\\s*$)`, 'i'), (m) => {
      const name = namedValue(m[1]);
      if (!name) return false;
      // "label calls and errands" -> two labels
      for (const part of name.split(/\s+(?:and|,)\s+/i)) {
        const label = part.trim().replace(/\s+/g, '-');
        if (label) extra.labels.push(label);
      }
    });

    // "due tomorrow" — drop the cue and let the date rules read the rest.
    rest = rest.replace(/\bdue\s+(?=\S)/i, ' ');

    const out = parse(rest, projects);
    if (extra.priority) out.priority = extra.priority;
    if (extra.dueTime) out.dueTime = extra.dueTime;
    if (extra.labels.length) out.labels = [...out.labels, ...extra.labels];
    if (extra.projectName && !out.projectId && !out.projectName) {
      // Match a real project first so "project home" finds an existing Home.
      const hit = projects.find((p) => p.name.toLowerCase() === extra.projectName.toLowerCase());
      if (hit) {
        out.projectId = hit.id;
        out.projectName = hit.name;
      } else {
        out.projectName = extra.projectName;
      }
    }
    return out;
  }

  /**
   * @param {string} text raw quick-add input
   * @param {Array<{id: string, name: string}>} projects for resolving #project
   */
  function parse(text, projects = []) {
    let rest = ` ${text} `;
    const out = { title: '', due: null, dueTime: null, priority: 4, projectId: null, projectName: null, labels: [] };

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

  return { parse, parseSpoken, toISO, fromISO, addDays, startOfToday };
})();

if (typeof module !== 'undefined') module.exports = NLP;
if (typeof window !== 'undefined') window.NLP = NLP;
