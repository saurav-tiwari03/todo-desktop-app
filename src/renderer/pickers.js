'use strict';

/**
 * Popovers for the task detail panel: dates (with time and repeat), deadlines,
 * labels, reminders, project and priority.
 *
 * Everything here is built on one small stack-based popover: opening a
 * popover from inside another (Date → Repeat) nests rather than replaces, and
 * clicking outside peels the stack back to wherever you clicked.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const UNITS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' }
];

/* ========================================================================= */
/* Popover stack                                                             */
/* ========================================================================= */

const Popover = (() => {
  const stack = [];

  function place(node, anchor) {
    const margin = 8;
    const box = anchor.getBoundingClientRect();
    // offsetWidth/Height are layout sizes: getBoundingClientRect would report
    // the scaled box while the open transition is still running.
    const width = node.offsetWidth;
    const height = node.offsetHeight;

    let left = box.right - width;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
    if (left < margin) left = margin;

    let top = box.bottom + 6;
    if (top + height > window.innerHeight - margin) {
      const above = box.top - 6 - height;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - margin - height);
    }

    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }

  function open(anchor, html, options = {}) {
    const node = document.createElement('div');
    node.className = `pop${options.className ? ` ${options.className}` : ''}`;
    node.innerHTML = html;
    if (options.width) node.style.width = `${options.width}px`;
    document.body.appendChild(node);
    place(node, anchor);
    requestAnimationFrame(() => node.classList.add('open'));

    // Content arrives after mounting (the calendar especially), so keep the
    // popover pinned to the viewport as it grows rather than placing it once.
    const observer = new ResizeObserver(() => place(node, anchor));
    observer.observe(node);

    const entry = { node, anchor, onClose: options.onClose, observer };
    stack.push(entry);
    if (options.onMount) options.onMount(node);
    return node;
  }

  function closeTop() {
    const entry = stack.pop();
    if (!entry) return;
    if (entry.observer) entry.observer.disconnect();
    entry.node.classList.remove('open');
    setTimeout(() => entry.node.remove(), 140);
    if (entry.onClose) entry.onClose();
  }

  function closeAll() {
    while (stack.length) closeTop();
  }

  /** Closes popovers above whichever one was clicked in. */
  function handleOutside(event) {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].node.contains(event.target) || stack[i].anchor.contains(event.target)) return;
      closeTop();
    }
  }

  document.addEventListener('mousedown', handleOutside, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && stack.length) {
      event.stopPropagation();
      closeTop();
    }
  }, true);
  window.addEventListener('resize', closeAll);

  return { open, closeTop, closeAll, get depth() { return stack.length; } };
})();

/* ========================================================================= */
/* Date helpers                                                              */
/* ========================================================================= */

const iso = (date) => NLP.toISO(date);
const parseISO = (value) => NLP.fromISO(value);
const today = () => NLP.startOfToday();
const shift = (date, days) => NLP.addDays(date, days);

function shortDate(value) {
  const date = parseISO(value);
  if (!date) return '';
  const opts = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== today().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
}

function friendlyDate(value) {
  const date = parseISO(value);
  if (!date) return '';
  const diff = Math.round((date - today()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return DAY_NAMES[date.getDay()];
  return shortDate(value);
}

function ordinal(n) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

/** 'Every week on Saturday', 'Every 3 days until 1 Dec', … */
function repeatLabel(repeat) {
  if (!repeat || !repeat.unit) return '';
  const every = Math.max(1, Number(repeat.every) || 1);
  let text;

  if (repeat.unit === 'weekday') {
    text = every === 1 ? 'Every weekday' : `Every ${every} weekdays`;
  } else if (every === 1) {
    text = `Every ${repeat.unit}`;
  } else {
    text = `Every ${every} ${repeat.unit}s`;
  }

  if (repeat.unit === 'week' && repeat.weekday != null) {
    text += ` on ${DAY_NAMES[repeat.weekday]}`;
  }
  if (repeat.unit === 'month' && repeat.day) text += ` on the ${ordinal(repeat.day)}`;
  if (repeat.unit === 'year' && repeat.month != null && repeat.day) {
    text += ` on ${MONTH_NAMES[repeat.month]} ${ordinal(repeat.day)}`;
  }
  if (repeat.basedOn === 'completed') text += ', after completion';
  if (repeat.ends && repeat.ends.type === 'on' && repeat.ends.date) {
    text += ` until ${shortDate(repeat.ends.date)}`;
  }
  return text;
}

/** 'Today 09:00 · Every day' — the one-line summary shown on the Date row. */
function dateSummary(date, time, repeat) {
  if (!date && !repeat) return '';
  const parts = [];
  if (date) parts.push(friendlyDate(date) + (time ? ` ${time}` : ''));
  if (repeat) parts.push(repeatLabel(repeat));
  return parts.join(' · ');
}

/* ========================================================================= */
/* Date picker                                                               */
/* ========================================================================= */

/**
 * @param {Element} anchor
 * @param {{date, time, repeat, allowTime, allowRepeat, onChange}} options
 *        onChange receives the complete { date, time, repeat } each time.
 */
function openDatePicker(anchor, options) {
  const allowTime = options.allowTime !== false;
  const allowRepeat = options.allowRepeat !== false;
  const current = {
    date: options.date || null,
    time: options.time || null,
    repeat: options.repeat || null
  };

  const now = today();
  const nextMonday = shift(now, ((1 - now.getDay() + 7) % 7) || 7);
  const nextSaturday = shift(now, ((6 - now.getDay() + 7) % 7) || 7);

  const quick = [
    { cls: 'q-green', icon: ICONS.quickToday, label: 'Today', value: iso(now),
      hint: DAY_NAMES[now.getDay()].slice(0, 3) },
    { cls: 'q-orange', icon: ICONS.quickTomorrow, label: 'Tomorrow', value: iso(shift(now, 1)),
      hint: DAY_NAMES[shift(now, 1).getDay()].slice(0, 3) },
    { cls: 'q-purple', icon: ICONS.quickNextWeek, label: 'Next week', value: iso(nextMonday),
      hint: `${DAY_NAMES[1].slice(0, 3)} ${shortDate(iso(nextMonday))}` },
    { cls: 'q-blue', icon: ICONS.quickWeekend, label: 'Next weekend', value: iso(nextSaturday),
      hint: `${DAY_NAMES[6].slice(0, 3)} ${shortDate(iso(nextSaturday))}` }
  ];

  const html = `
    <div class="pop-field">
      <input type="text" id="dp-type" placeholder="Type a date" autocomplete="off" />
    </div>
    <div class="pop-parse" id="dp-parse"></div>
    <div class="pop-list">
      ${quick.map((q) => `
        <button class="pop-row" data-quick="${q.value}">
          <span class="pop-row-icon ${q.cls}">${q.icon}</span>
          <span class="pop-row-label">${q.label}</span>
          <span class="pop-row-hint">${q.hint}</span>
        </button>`).join('')}
      ${current.date ? `
        <button class="pop-row" data-quick="">
          <span class="pop-row-icon">${ICONS.quickClear}</span>
          <span class="pop-row-label">No date</span>
        </button>` : ''}
    </div>
    <div class="cal">
      <div class="cal-head">
        <strong id="cal-title"></strong>
        <span class="cal-nav">
          <button class="icon-btn" data-cal="prev" aria-label="Previous month">${ICONS.chevronLeft}</button>
          <button class="icon-btn" data-cal="today" aria-label="Jump to today">${ICONS.dotSmall}</button>
          <button class="icon-btn" data-cal="next" aria-label="Next month">${ICONS.chevronRight}</button>
        </span>
      </div>
      <div class="cal-weekdays">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-scroll" id="cal-scroll"></div>
    </div>
    ${allowTime || allowRepeat ? `
      <div class="pop-foot" id="dp-foot">
        ${allowTime ? `<button class="pop-btn" id="dp-time">${ICONS.clock}<span>${current.time ? current.time : 'Time'}</span></button>` : ''}
        ${allowRepeat ? `<button class="pop-btn" id="dp-repeat">${ICONS.repeat}<span>${current.repeat ? repeatLabel(current.repeat) : 'Repeat'}</span></button>` : ''}
      </div>` : ''}`;

  Popover.open(anchor, html, { width: 304, className: 'pop-date', onMount: (node) => {
    let anchorMonth = parseISO(current.date) || now;

    const emit = () => options.onChange({ ...current });

    const renderMonths = () => {
      const scroll = node.querySelector('#cal-scroll');
      const start = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), 1);
      let html2 = '';
      for (let i = 0; i < 12; i += 1) {
        const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
        html2 += monthHTML(month, current.date, i === 0);
      }
      scroll.innerHTML = html2;
      node.querySelector('#cal-title').textContent =
        `${MONTH_NAMES[start.getMonth()].slice(0, 3)} ${start.getFullYear()}`;
      scroll.scrollTop = 0;
    };

    renderMonths();

    // Keep the header in step with whichever month is at the top of the scroll.
    node.querySelector('#cal-scroll').addEventListener('scroll', (e) => {
      const scroll = e.currentTarget;
      let label = null;
      for (const block of scroll.querySelectorAll('[data-month]')) {
        if (block.offsetTop - scroll.scrollTop <= 12) label = block.dataset.month;
      }
      if (label) node.querySelector('#cal-title').textContent = label;
    });

    node.addEventListener('click', (event) => {
      const quickBtn = event.target.closest('[data-quick]');
      if (quickBtn) {
        current.date = quickBtn.dataset.quick || null;
        if (!current.date) current.time = null;
        emit();
        Popover.closeTop();
        return;
      }

      const day = event.target.closest('[data-day]');
      if (day) {
        current.date = day.dataset.day;
        emit();
        Popover.closeTop();
        return;
      }

      const nav = event.target.closest('[data-cal]');
      if (nav) {
        const step = nav.dataset.cal;
        if (step === 'today') anchorMonth = now;
        else anchorMonth = new Date(anchorMonth.getFullYear(),
          anchorMonth.getMonth() + (step === 'next' ? 1 : -1), 1);
        renderMonths();
        return;
      }

      if (event.target.closest('#dp-time')) {
        openTimePicker(node.querySelector('#dp-time'), {
          time: current.time,
          onChange: (time) => {
            current.time = time;
            if (time && !current.date) current.date = iso(now);
            emit();
            refreshFoot();
          }
        });
        return;
      }

      if (event.target.closest('#dp-repeat')) {
        openRepeatMenu(node.querySelector('#dp-repeat'), {
          date: current.date,
          repeat: current.repeat,
          onChange: (repeat) => {
            current.repeat = repeat;
            if (repeat && !current.date) current.date = iso(now);
            emit();
            refreshFoot();
          }
        });
      }
    });

    function refreshFoot() {
      const timeBtn = node.querySelector('#dp-time span');
      if (timeBtn) timeBtn.textContent = current.time || 'Time';
      const repeatBtn = node.querySelector('#dp-repeat span');
      if (repeatBtn) repeatBtn.textContent = current.repeat ? repeatLabel(current.repeat) : 'Repeat';
    }

    // Typed dates run through the same parser the quick-add box uses.
    const typed = node.querySelector('#dp-type');
    const parseHint = node.querySelector('#dp-parse');
    typed.focus();
    typed.addEventListener('input', () => {
      const text = typed.value.trim();
      const parsed = text ? NLP.parse(text, []) : null;
      parseHint.textContent = parsed && parsed.due ? friendlyDate(parsed.due) : '';
      parseHint.classList.toggle('visible', Boolean(parsed && parsed.due));
    });
    typed.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const parsed = NLP.parse(typed.value.trim(), []);
      if (!parsed.due) return;
      current.date = parsed.due;
      emit();
      Popover.closeTop();
    });
  } });
}

function monthHTML(month, selected, isFirst) {
  const year = month.getFullYear();
  const index = month.getMonth();
  const label = `${MONTH_NAMES[index].slice(0, 3)} ${year}`;
  const first = new Date(year, index, 1);
  const days = new Date(year, index + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first grid
  const todayStr = iso(today());

  // The first day is offset with grid-column-start rather than padded with
  // placeholder cells, which keeps the first week the same height as the rest.
  let cells = '';
  for (let day = 1; day <= days; day += 1) {
    const value = `${year}-${String(index + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const classes = ['cal-day'];
    if (day === 1 && lead > 0) classes.push(`start-${lead + 1}`);
    if (value === todayStr) classes.push('is-today');
    if (value === selected) classes.push('is-selected');
    if (value < todayStr) classes.push('is-past');
    cells += `<button class="${classes.join(' ')}" data-day="${value}">${day}</button>`;
  }

  return `<div class="cal-month" data-month="${label}">
    ${isFirst ? '' : `<div class="cal-month-label">${MONTH_NAMES[index]}${index === 0 ? ` ${year}` : ''}</div>`}
    <div class="cal-grid">${cells}</div>
  </div>`;
}

/* ========================================================================= */
/* Time                                                                      */
/* ========================================================================= */

function openTimePicker(anchor, options) {
  const presets = ['09:00', '12:00', '17:00', '20:00'];
  Popover.open(anchor, `
    <div class="pop-field">
      <input type="time" id="tp-value" value="${options.time || '09:00'}" />
    </div>
    <div class="pop-list">
      ${presets.map((t) => `<button class="pop-row" data-time="${t}">
        <span class="pop-row-icon">${ICONS.clock}</span>
        <span class="pop-row-label">${t}</span></button>`).join('')}
      ${options.time ? `<button class="pop-row" data-time="">
        <span class="pop-row-icon">${ICONS.quickClear}</span>
        <span class="pop-row-label">No time</span></button>` : ''}
    </div>
    <div class="pop-foot">
      <button class="pop-btn primary" id="tp-save">Save</button>
    </div>`, { width: 212, onMount: (node) => {
    node.addEventListener('click', (event) => {
      const row = event.target.closest('[data-time]');
      if (row) {
        options.onChange(row.dataset.time || null);
        Popover.closeTop();
        return;
      }
      if (event.target.closest('#tp-save')) {
        options.onChange(node.querySelector('#tp-value').value || null);
        Popover.closeTop();
      }
    });
  } });
}

/* ========================================================================= */
/* Repeat                                                                    */
/* ========================================================================= */

function openRepeatMenu(anchor, options) {
  const base = parseISO(options.date) || today();
  const presets = [
    { label: 'Every day', rule: { unit: 'day', every: 1 } },
    { label: `Every week <em>on ${DAY_NAMES[base.getDay()]}</em>`,
      rule: { unit: 'week', every: 1, weekday: base.getDay() } },
    { label: 'Every weekday <em>(Mon - Fri)</em>', rule: { unit: 'weekday', every: 1 } },
    { label: `Every month <em>on the ${ordinal(base.getDate())}</em>`,
      rule: { unit: 'month', every: 1, day: base.getDate() } },
    { label: `Every year <em>on ${MONTH_NAMES[base.getMonth()]} ${ordinal(base.getDate())}</em>`,
      rule: { unit: 'year', every: 1, day: base.getDate(), month: base.getMonth() } }
  ];

  Popover.open(anchor, `
    <div class="pop-list">
      ${presets.map((p, i) => `<button class="pop-row wide" data-repeat="${i}">
        <span class="pop-row-label">${p.label}</span></button>`).join('')}
      <button class="pop-row wide" data-custom="1"><span class="pop-row-label">Custom…</span></button>
      ${options.repeat ? `<button class="pop-row wide" data-repeat="none">
        <span class="pop-row-label">Don't repeat</span></button>` : ''}
    </div>`, { width: 268, className: 'pop-menu', onMount: (node) => {
    node.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-repeat]');
      if (choice) {
        const key = choice.dataset.repeat;
        options.onChange(key === 'none' ? null : {
          ...presets[Number(key)].rule,
          basedOn: 'scheduled',
          ends: { type: 'never', date: null }
        });
        Popover.closeTop();
        return;
      }
      if (event.target.closest('[data-custom]')) {
        Popover.closeTop();
        openCustomRepeat(options);
      }
    });
  } });
}

/** The 'Custom repeat' modal: based on / every N units / ends. */
function openCustomRepeat(options) {
  const base = parseISO(options.date) || today();
  const start = options.repeat || { unit: 'day', every: 1, basedOn: 'scheduled', ends: { type: 'never', date: null } };
  const draft = {
    unit: start.unit === 'weekday' ? 'day' : start.unit,
    every: Math.max(1, Number(start.every) || 1),
    basedOn: start.basedOn || 'scheduled',
    weekday: start.weekday != null ? start.weekday : base.getDay(),
    day: start.day || base.getDate(),
    month: start.month != null ? start.month : base.getMonth(),
    ends: { type: (start.ends && start.ends.type) || 'never', date: (start.ends && start.ends.date) || null }
  };

  const radio = (name, value, checked, label) => `
    <label class="radio">
      <input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''} />
      <span class="radio-mark"></span>
      <span>${label}</span>
    </label>`;

  openDialog(`
    <div class="dialog-head">
      <h3>Custom repeat</h3>
      <button class="icon-btn" id="cr-close" aria-label="Close">${ICONS.close}</button>
    </div>

    <div class="field">
      <label>Based on</label>
      ${radio('cr-based', 'scheduled', draft.basedOn === 'scheduled', 'Scheduled date')}
      ${radio('cr-based', 'completed', draft.basedOn === 'completed', 'Completed date')}
    </div>

    <div class="field">
      <label>Every</label>
      <div class="cr-every">
        <input type="number" id="cr-every" min="1" max="999" value="${draft.every}" />
        <select id="cr-unit">
          ${UNITS.map((u) => `<option value="${u.value}"${u.value === draft.unit ? ' selected' : ''}>${u.label}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="field">
      <label>Ends</label>
      ${radio('cr-ends', 'never', draft.ends.type === 'never', 'Never')}
      ${radio('cr-ends', 'on', draft.ends.type === 'on', 'On date (inclusive)')}
      <input type="date" id="cr-until" class="cr-until" value="${draft.ends.date || ''}"${draft.ends.type === 'on' ? '' : ' disabled'} />
    </div>

    <div class="dialog-actions">
      <button class="ghost-btn" id="cr-cancel">Cancel</button>
      <button class="primary-btn" id="cr-save">Save</button>
    </div>`, () => {
    const dialog = document.getElementById('dialog');
    const until = dialog.querySelector('#cr-until');

    dialog.addEventListener('change', (event) => {
      if (event.target.name === 'cr-ends') {
        draft.ends.type = event.target.value;
        until.disabled = draft.ends.type !== 'on';
        if (draft.ends.type === 'on' && !until.value) {
          until.value = iso(shift(today(), 30));
        }
      }
      if (event.target.name === 'cr-based') draft.basedOn = event.target.value;
      if (event.target.id === 'cr-until') draft.ends.date = event.target.value || null;
    });

    const save = () => {
      draft.every = Math.max(1, Math.min(999, Number(dialog.querySelector('#cr-every').value) || 1));
      draft.unit = dialog.querySelector('#cr-unit').value;
      draft.ends.date = until.value || null;
      if (draft.ends.type === 'on' && !draft.ends.date) draft.ends.type = 'never';

      const rule = {
        unit: draft.unit,
        every: draft.every,
        basedOn: draft.basedOn,
        ends: { type: draft.ends.type, date: draft.ends.date }
      };
      if (draft.unit === 'week') rule.weekday = draft.weekday;
      if (draft.unit === 'month') rule.day = draft.day;
      if (draft.unit === 'year') { rule.day = draft.day; rule.month = draft.month; }

      closeDialog();
      options.onChange(rule);
    };

    dialog.querySelector('#cr-save').addEventListener('click', save);
    dialog.querySelector('#cr-cancel').addEventListener('click', closeDialog);
    dialog.querySelector('#cr-close').addEventListener('click', closeDialog);
  });
}

/* ========================================================================= */
/* Labels                                                                    */
/* ========================================================================= */

function openLabelPicker(anchor, options) {
  const chosen = new Set(options.labels || []);

  const render = (node) => {
    const known = [...new Set([...(options.allLabels || []), ...chosen])].sort();
    node.querySelector('.pop-list').innerHTML = known.length
      ? known.map((label) => `
        <button class="pop-row" data-label="${esc(label)}">
          <span class="pop-row-icon">${chosen.has(label) ? ICONS.check : ICONS.labelTag}</span>
          <span class="pop-row-label">${esc(label)}</span>
        </button>`).join('')
      : '<p class="pop-empty">No labels yet — type one above.</p>';
  };

  Popover.open(anchor, `
    <div class="pop-field">
      <input type="text" id="lp-input" placeholder="Type a label" autocomplete="off" />
    </div>
    <div class="pop-list"></div>`, { width: 248, onMount: (node) => {
    render(node);
    const input = node.querySelector('#lp-input');
    input.focus();

    const commit = () => options.onChange([...chosen]);

    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const value = input.value.trim().replace(/^@/, '');
      if (!value) return;
      chosen.add(value);
      input.value = '';
      render(node);
      commit();
    });

    node.addEventListener('click', (event) => {
      const row = event.target.closest('[data-label]');
      if (!row) return;
      const label = row.dataset.label;
      if (chosen.has(label)) chosen.delete(label);
      else chosen.add(label);
      render(node);
      commit();
    });
  } });
}

/* ========================================================================= */
/* Reminders                                                                 */
/* ========================================================================= */

function reminderStamp(date, time) {
  return `${date}T${time}`;
}

function formatReminder(value) {
  if (!value) return '';
  const [datePart, timePart] = value.split('T');
  return `${friendlyDate(datePart)}${timePart ? ` at ${timePart}` : ''}`;
}

function openReminderPicker(anchor, options) {
  const list = [...(options.reminders || [])];
  const due = options.due;
  const dueTime = options.dueTime || '09:00';

  const quick = [];
  if (due) {
    const at = (d, t) => reminderStamp(iso(d), t);
    const dueDate = parseISO(due);
    quick.push({ label: `On the day at ${dueTime}`, value: at(dueDate, dueTime) });
    quick.push({ label: 'The day before at 09:00', value: at(shift(dueDate, -1), '09:00') });
    quick.push({ label: 'Three days before at 09:00', value: at(shift(dueDate, -3), '09:00') });
  }

  const render = (node) => {
    node.querySelector('#rp-current').innerHTML = list.length
      ? list.map((r) => `
        <div class="pop-chip">
          <span>${esc(formatReminder(r.at))}</span>
          <button class="icon-btn" data-remove="${r.id}" aria-label="Remove reminder">${ICONS.close}</button>
        </div>`).join('')
      : '<p class="pop-empty">No reminders yet.</p>';
  };

  Popover.open(anchor, `
    <div id="rp-current" class="pop-chips"></div>
    <div class="pop-list">
      ${quick.map((q) => `<button class="pop-row" data-at="${q.value}">
        <span class="pop-row-icon">${ICONS.bell}</span>
        <span class="pop-row-label">${q.label}</span></button>`).join('')}
    </div>
    <div class="pop-field stacked">
      <label for="rp-custom">Custom</label>
      <input type="datetime-local" id="rp-custom" />
      <button class="pop-btn primary" id="rp-add">Add reminder</button>
    </div>`, { width: 268, onMount: (node) => {
    render(node);
    const commit = () => options.onChange(list.map((r) => ({ ...r })));

    node.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove]');
      if (remove) {
        const index = list.findIndex((r) => r.id === remove.dataset.remove);
        if (index >= 0) list.splice(index, 1);
        render(node);
        commit();
        return;
      }

      const preset = event.target.closest('[data-at]');
      if (preset) {
        addReminder(preset.dataset.at);
        return;
      }

      if (event.target.closest('#rp-add')) {
        const value = node.querySelector('#rp-custom').value;
        if (value) addReminder(value.slice(0, 16));
      }
    });

    function addReminder(at) {
      if (list.some((r) => r.at === at)) return;
      list.push({ id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at, fired: false });
      list.sort((a, b) => a.at.localeCompare(b.at));
      render(node);
      commit();
    }
  } });
}

/* ========================================================================= */
/* Simple option menus                                                       */
/* ========================================================================= */

function openOptionMenu(anchor, items, onPick) {
  Popover.open(anchor, `
    <div class="pop-list">
      ${items.map((item) => `<button class="pop-row" data-value="${esc(item.value)}">
        <span class="pop-row-icon">${item.icon || ''}</span>
        <span class="pop-row-label">${item.label}</span>
        ${item.selected ? `<span class="pop-row-hint">${ICONS.check}</span>` : ''}
      </button>`).join('')}
    </div>`, { width: 212, className: 'pop-menu', onMount: (node) => {
    node.addEventListener('click', (event) => {
      const row = event.target.closest('[data-value]');
      if (!row) return;
      onPick(row.dataset.value);
      Popover.closeTop();
    });
  } });
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    Popover, openDatePicker, openRepeatMenu, openLabelPicker,
    openReminderPicker, openOptionMenu, repeatLabel, dateSummary,
    friendlyDate, shortDate, formatReminder
  });
}
