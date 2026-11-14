'use strict';

/**
 * The standalone capture window opened by the global shortcut. It is the same
 * card as the in-app one, but it lives in its own frameless window so it can
 * appear over whatever you are working in.
 */

const el = {
  card: document.getElementById('quick-card'),
  input: document.getElementById('quick-input'),
  hint: document.getElementById('quick-hint'),
  plus: document.getElementById('quick-plus'),
  mic: document.getElementById('quick-mic'),
  close: document.getElementById('quick-close'),
  submit: document.getElementById('quick-submit')
};

let projects = [];
let voice = false;

const VOICE_TIP = 'Say: <b>task</b> · <b>tomorrow</b> · <b>at 9 a m</b> · '
  + '<b>priority one</b> · <b>project Home</b> · <b>label calls</b>';

const TIP = 'Tip: “tomorrow”, “next friday”, “p1”, “#Project”, “@label”';

/** Dictation writes words, not symbols, so the spoken grammar is opt-in. */
function parseInput(text) {
  return voice ? NLP.parseSpoken(text, projects) : NLP.parse(text, projects);
}

function applyVoiceMode() {
  el.mic.classList.toggle('on', voice);
  el.mic.setAttribute('aria-pressed', String(voice));
  el.card.classList.toggle('voice', voice);
  el.input.placeholder = voice
    ? 'Dictate: Pay rent tomorrow priority one project Home'
    : 'Task name';
}

el.mic.innerHTML = ICONS.mic;
el.mic.addEventListener('click', () => {
  voice = !voice;
  window.quick.setVoice(voice);
  applyVoiceMode();
  el.input.focus();
  el.input.dispatchEvent(new Event('input', { bubbles: true }));
});

el.plus.innerHTML = ICONS.plus;
el.close.innerHTML = ICONS.close;
el.submit.innerHTML = ICONS.check;

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function friendly(dateISO) {
  const date = NLP.fromISO(dateISO);
  if (!date) return '';
  const diff = Math.round((date - NLP.startOfToday()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Keeps the window exactly as tall as the card. */
function fit() {
  const height = Math.ceil(el.card.getBoundingClientRect().height) + 24;
  window.quick.resize(height);
}

function setHint(html) {
  el.hint.innerHTML = html;
  el.hint.classList.toggle('visible', Boolean(html));
  // Once for the immediate layout, once after the hint's height transition —
  // measuring mid-transition would size the window to the old height.
  requestAnimationFrame(fit);
  clearTimeout(setHint.timer);
  setHint.timer = setTimeout(fit, 240);
}

function reset() {
  el.input.value = '';
  el.card.classList.remove('ready');
  setHint('');
}

el.input.addEventListener('input', () => {
  const text = el.input.value.trim();
  el.card.classList.toggle('ready', Boolean(text));
  if (!text) {
    setHint(voice ? VOICE_TIP : '');
    return;
  }

  const parsed = parseInput(text);
  const bits = [];
  if (parsed.due) bits.push(`due <b>${esc(friendly(parsed.due))}</b>`);
  if (parsed.dueTime) bits.push(`at <b>${esc(parsed.dueTime)}</b>`);
  if (parsed.priority < 4) bits.push(`priority <b>P${parsed.priority}</b>`);
  if (parsed.projectName) {
    bits.push(parsed.projectId
      ? `in <b>${esc(parsed.projectName)}</b>`
      : `in new project <b>${esc(parsed.projectName)}</b>`);
  }
  for (const label of parsed.labels) bits.push(`label <b>@${esc(label)}</b>`);

  setHint(bits.length
    ? `<b>${esc(parsed.title || text)}</b> — ${bits.join(', ')}`
    : (voice ? VOICE_TIP : TIP));
});

function submit() {
  const text = el.input.value.trim();
  if (!text) return;
  const parsed = parseInput(text);
  window.quick.add({
    title: parsed.title || text,
    due: parsed.due,
    dueTime: parsed.dueTime || null,
    priority: parsed.priority,
    labels: parsed.labels,
    projectId: parsed.projectId,
    projectName: parsed.projectName
  });
  reset();
}

el.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    reset();
    window.quick.close();
  }
});

el.submit.addEventListener('click', submit);
el.close.addEventListener('click', () => {
  reset();
  window.quick.close();
});

// Opened afresh each time: clear it, match the app's theme, focus the field.
window.quick.onOpen((payload) => {
  projects = payload.projects || [];
  voice = Boolean(payload.voice);
  document.documentElement.classList.toggle('dark', Boolean(payload.dark));
  applyVoiceMode();
  reset();
  if (voice) setHint(VOICE_TIP);
  el.input.focus();
  requestAnimationFrame(fit);
});

window.addEventListener('load', fit);

// Dropping a file on this window would navigate it away from the card.
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (e) => e.preventDefault());
}
