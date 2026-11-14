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

const VOICE_FORMAT = 'Say: <b>task</b> · <b>tomorrow</b> · <b>at 9 a m</b> · '
  + '<b>priority one</b> · <b>project Home</b> · <b>label calls</b>';

const VOICE_TIP = '<span class="voice-how">Click the <b>mic</b> and speak — '
  + 'transcribed on this Mac, nothing is uploaded.</span>'
  + `<span class="voice-fmt">${VOICE_FORMAT}</span>`;

const LISTENING_TIP = '<span class="voice-how"><span class="rec-dot"></span>'
  + '<b>Listening…</b> click the mic again when you are done.</span>'
  + `<span class="voice-fmt">${VOICE_FORMAT}</span>`;

const TIP = 'Tip: “tomorrow”, “next friday”, “p1”, “#Project”, “@label”';

// True while the field holds something that came out of the microphone.
let spokenInput = false;

/** Dictated words, not symbols, so the spoken grammar reads the transcript. */
function parseInput(text) {
  return (voice || spokenInput)
    ? NLP.parseSpoken(text, projects)
    : NLP.parse(text, projects);
}

function applyVoiceMode() {
  el.card.classList.toggle('voice', voice);
  el.input.placeholder = voice
    ? 'Say: Pay rent tomorrow priority one project Home'
    : 'Task name';
}

el.mic.innerHTML = ICONS.mic;
el.mic.addEventListener('click', () => toggleDictation());

async function toggleDictation() {
  if (Recorder.recording()) return finishDictation();

  if (!(await window.quick.speechAvailable())) {
    setHint('<b>The speech model is not installed in this build.</b>');
    return;
  }

  try {
    await Recorder.start({
      onLevel: (level) => el.mic.style.setProperty('--level', level.toFixed(3)),
      onAuto: () => finishDictation()
    });
  } catch (err) {
    setHint(err && err.name === 'NotAllowedError'
      ? '<b>Microphone denied</b> — allow it in System Settings → Privacy &amp; Security → Microphone.'
      : '<b>No microphone was available.</b>');
    setDictationState('idle');
    return;
  }

  setDictationState('recording');
  window.quick.warmSpeech();
}

async function finishDictation() {
  const samples = await Recorder.stop();
  el.mic.style.removeProperty('--level');
  if (!samples) {
    setDictationState('idle');
    return;
  }

  setDictationState('working');
  const { text, error } = await window.quick.transcribe(samples);
  setDictationState('idle');

  if (error || !text) {
    setHint(error ? `<b>Could not transcribe:</b> ${esc(error)}`
                  : '<b>Nothing was heard</b> — try again, a little closer.');
    return;
  }

  spokenInput = true;
  const existing = el.input.value.trim();
  el.input.value = existing ? `${existing} ${text}` : text;
  el.input.focus();
  el.input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setDictationState(mode) {
  el.mic.classList.toggle('rec', mode === 'recording');
  el.mic.classList.toggle('busy', mode === 'working');
  el.card.classList.toggle('listening', mode === 'recording');
  el.mic.title = mode === 'recording' ? 'Stop and transcribe'
    : mode === 'working' ? 'Transcribing…'
    : 'Dictate a task';
  if (mode === 'recording') setHint(LISTENING_TIP);
  else if (mode === 'working') setHint('<b>Transcribing…</b>');
  else if (!el.input.value.trim()) setHint(voice ? VOICE_TIP : '');
  fit();
}

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
    : (voice ? VOICE_FORMAT : TIP));
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
  spokenInput = false;
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
  spokenInput = false;
  Recorder.cancel();
  setDictationState('idle');
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
