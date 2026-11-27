// Page wiring: presets, Render, the step control, live mode, and what goes back to the agent.
import { read, load, parseMessages, locate, SUPPORTED, LEFT_OUT } from './protocol.js';
import { renderSurface } from './render.js';
import { PRESETS, toJSON } from './presets.js';
import { describe, playTo } from './steps.js';
import { errorMessages, dataModelMetadata } from './outbound.js';
import { PROVIDERS, generate, ProviderError } from './providers.js';

const $ = (id) => document.getElementById(id);
const field = $('messages');
let surfaces = new Map();
let views = [];

$('supported').textContent = `Components this playground draws: ${SUPPORTED.join(', ')}. ${Object.keys(LEFT_OUT).join(', ')} are left out on purpose, and a response that uses them is reported, not drawn.`;

const groups = new Map();
for (const p of PRESETS) {
  if (!groups.has(p.group)) groups.set(p.group, $('preset').appendChild(Object.assign(document.createElement('optgroup'), { label: p.group })));
  groups.get(p.group).append(new Option(p.label, p.id));
}
const currentPreset = () => PRESETS.find((p) => p.id === $('preset').value);
const source = () => document.querySelector('input[name="source"]:checked').value;

function line(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.textContent = text;
  return node;
}

// A break opportunity after each slash, so a long pointer wraps between segments on a phone.
function pathCode(path) {
  const code = document.createElement('code');
  path.split('/').forEach((seg, i) => {
    if (i) code.append('/', document.createElement('wbr'));
    code.append(seg);
  });
  return code;
}

function setNote(text, status) {
  const note = $('note');
  note.replaceChildren(status ? line('span', `lab-status lab-status--${status}`, text) : text);
}

// Lead with the component and a sentence; the pointer follows for whoever wants the exact spot.
// messages: what the pointers point into (the field by default). keep: leave the drawn surfaces up. open: unfold the error messages.
function showProblems(errors, lead, { messages, keep = false, open = false } = {}) {
  const box = line('div', 'lab-error', '');
  box.setAttribute('role', 'alert');
  const head = document.createElement('p');
  head.append(line('strong', '', lead || 'I didn\'t render this response.'));
  if (errors.length > 1 || errors[0].path) head.append(` It has ${errors.length === 1 ? 'one problem' : `${errors.length} problems`}. Fix ${errors.length === 1 ? 'it' : 'them'} in the messages and press Render.`);
  box.append(head);
  if (errors.length === 1 && !errors[0].path) {
    box.append(line('p', '', errors[0].message));
  } else {
    const parsed = messages || parseMessages(field.value).messages;
    const list = line('ul', 'pg-problems', '');
    for (const err of errors.slice(0, 20)) {
      const li = document.createElement('li');
      const at = locate(parsed, err.path);
      if (at && at.id) li.append(line('strong', '', `${at.id}${at.type ? ` (${at.type})` : ''}: `));
      li.append(err.message);
      if (err.path) li.append(pathCode(err.path));
      list.append(li);
    }
    if (errors.length > 20) list.append(line('li', '', `And ${errors.length - 20} more.`));
    box.append(list);
    const sent = errorMessages(parsed, errors);
    if (sent.length) {
      const details = document.createElement('details');
      details.className = 'pg-details';
      details.open = open;
      details.append(
        line('summary', '', `what the renderer sends back to the agent (${sent.length} error ${sent.length === 1 ? 'message' : 'messages'})`),
        line('pre', 'pg-code', sent.map((m) => JSON.stringify(m)).join('\n')),
      );
      box.append(details);
    }
  }
  $('problems').replaceChildren(box);
  if (keep) return;
  $('surfaces').replaceChildren();
  setNote('not rendered', 'error');
}

function drawSurfaces() {
  views = [...surfaces.values()].map((s) => renderSurface(s, { onAction, onFunction }));
  $('surfaces').replaceChildren(...views.map((v) => v.element));
  if (!views.length) $('surfaces').append(line('p', 'lab-empty', 'The messages delete every surface they create, so there is nothing left to draw.'));
  const count = [...surfaces.values()].reduce((n, s) => n + s.components.size, 0);
  const notes = views.map((v) => v.note).filter(Boolean);
  setNote([[...surfaces.keys()].join(', '), `${count} ${count === 1 ? 'component' : 'components'}`, ...notes].filter(Boolean).join(' · '));
}

let step = 0;
let timer = null;
const stopPlaying = () => { clearInterval(timer); timer = null; };

// Messages one at a time: the result after the first n, and a line on what the last one did.
function stepTo(n) {
  const parsed = parseMessages(field.value);
  if (parsed.errors) {
    stopPlaying();
    showProblems(parsed.errors);
    return;
  }
  const played = playTo(parsed.messages, n);
  step = played.step;
  $('action-wrap').hidden = true;
  $('local-wrap').hidden = true;
  const rejected = played.rejected.find((r) => r.index === step - 1);
  $('problems').replaceChildren();
  surfaces = played.surfaces;
  drawSurfaces();
  // A rejected message leaves the surface as it was; the renderer reports it to the agent and waits for a fix.
  if (rejected) {
    stopPlaying();
    showProblems(rejected.errors, `I didn't apply message ${step}.`, { messages: parsed.messages, keep: true, open: true });
  }
  $('step-note').textContent = `message ${step} of ${played.total}`;
  $('step-what').textContent = `${rejected ? 'Not applied, so the renderer reported it: ' : ''}${describe(parsed.messages[step - 1])}`;
  $('step-prev').disabled = step <= 1;
  $('step-next').disabled = step >= played.total;
  if (step >= played.total) stopPlaying();
}

function render() {
  stopPlaying();
  $('steps').hidden = true;
  $('action-wrap').hidden = true;
  $('local-wrap').hidden = true;
  try {
    show(read(field.value));
  } catch {
    surfaces = new Map();
    showProblems([{ path: '', message: 'This page hit an error while drawing these messages. Simplify them, or reload and try a preset.' }]);
  }
}

function show(result) {
  field.setAttribute('aria-invalid', result.errors.length ? 'true' : 'false');
  if (result.errors.length) {
    surfaces = new Map();
    showProblems(result.errors);
    return;
  }
  $('problems').replaceChildren();
  surfaces = result.surfaces;
  drawSurfaces();
}

function onAction(message) {
  const clicked = document.activeElement;
  $('local-wrap').hidden = true;
  $('action').textContent = JSON.stringify(message, null, 2);
  $('action-wrap').hidden = false;
  const meta = dataModelMetadata(surfaces.get(message.action.surfaceId));
  $('meta-wrap').hidden = !meta;
  if (meta) $('meta').textContent = JSON.stringify(meta, null, 2);
  const reply = source() === 'preset' && currentPreset().replies && currentPreset().replies[message.action.name];
  $('reply-wrap').hidden = !reply;
  $('action-said').textContent = `${message.action.name} went to the agent.${reply ? ' The scripted reply redrew the result above.' : ''}`;
  if (!reply) return;
  const json = toJSON(reply);
  $('reply').textContent = json;
  $('reply-summary').textContent = `show the reply's JSON (${json.split('\n').length} lines)`;
  $('reply-wrap').querySelector('details').open = false;
  try {
    const { errors } = load(structuredClone(reply), surfaces);
    if (errors.length) showProblems(errors, 'The scripted reply didn\'t apply.', { messages: reply });
    else drawSurfaces();
  } catch {
    showProblems([{ path: '', message: 'The scripted reply didn\'t apply. Reload and try the preset again.' }]);
  }
  // The reply may have redrawn the button that had focus; keep the keyboard in the result, not at the top of the page.
  if (clicked && !clicked.isConnected) $('result').focus();
}

function onFunction(run) {
  $('action-wrap').hidden = true;
  $('local-wrap').hidden = false;
  $('local-said').textContent = `${run.call} ran in the renderer. Nothing went to the agent.`;
  $('local').textContent = JSON.stringify(run, null, 2);
}

function loadPreset() {
  const preset = currentPreset();
  field.value = toJSON(preset.messages);
  $('preset-hint').textContent = `${preset.shows} No key needed, and nothing leaves your browser.`;
  if (!preset.steps) {
    render();
    return;
  }
  stopPlaying();
  $('steps').hidden = false;
  stepTo(1);
}

function setSource() {
  const live = source() === 'live';
  $('preset-panel').hidden = live;
  $('live-panel').hidden = !live;
  $('reset').hidden = live;
  if (live) {
    stopPlaying();
    $('steps').hidden = true;
  } else {
    loadPreset();
  }
}

let lastProvider = $('provider').value;
function setProvider() {
  const p = PROVIDERS[$('provider').value];
  const model = $('model');
  if (!model.value.trim() || model.value === PROVIDERS[lastProvider].model) model.value = p.model;
  // A key for one provider is useless to another, so switching clears it rather than sending it elsewhere.
  if (lastProvider !== $('provider').value) $('key').value = '';
  lastProvider = $('provider').value;
  $('notice-host').textContent = p.host;
  $('key-hint').textContent = `${p.keyHint} Paste it here; it is never stored.`;
}

// A {"messages": [...]} wrapper from a model is shown as the plain array the field expects.
function tidy(text) {
  const parsed = parseMessages(text);
  return parsed.messages && parsed.messages.length ? toJSON(parsed.messages) : text;
}

async function runLive() {
  const button = $('generate');
  const status = $('live-status');
  const p = PROVIDERS[$('provider').value];
  button.disabled = true;
  status.className = 'lab-status';
  status.textContent = `asking ${p.label}`;
  const started = performance.now();
  try {
    const { text, cutOff } = await generate({ provider: $('provider').value, model: $('model').value.trim(), key: $('key').value, prompt: $('prompt').value });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    field.value = tidy(text);
    render();
    if (cutOff) {
      showProblems([{ path: '', message: `${p.label} stopped at its length limit, so the reply is cut off. Ask for a smaller interface and try again.` }], 'The reply is incomplete.');
    }
    status.className = `lab-status lab-status--${$('problems').childElementCount ? 'warn' : 'ok'}`;
    const count = [...surfaces.values()].reduce((n, s) => n + s.components.size, 0);
    status.textContent = surfaces.size ? `reply in ${seconds} s, ${count} components` : `reply in ${seconds} s`;
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : 'Something went wrong in this page while sending the request. Reload and try again.';
    showProblems([{ path: '', message }], 'The request failed.');
    status.className = 'lab-status lab-status--error';
    status.textContent = 'request failed';
  } finally {
    button.disabled = false;
  }
}

const ctrlEnter = (fn) => (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    fn();
  }
};

$('preset').addEventListener('change', loadPreset);
$('step-prev').addEventListener('click', () => { stopPlaying(); stepTo(step - 1); });
$('step-next').addEventListener('click', () => { stopPlaying(); stepTo(step + 1); });
$('step-play').addEventListener('click', () => {
  stopPlaying();
  stepTo(1);
  timer = setInterval(() => stepTo(step + 1), 900);
});
$('render').addEventListener('click', render);
$('reset').addEventListener('click', loadPreset);
$('generate').addEventListener('click', runLive);
$('provider').addEventListener('change', setProvider);
field.addEventListener('keydown', ctrlEnter(render));
$('prompt').addEventListener('keydown', ctrlEnter(runLive));
for (const radio of document.querySelectorAll('input[name="source"]')) radio.addEventListener('change', setSource);

setProvider();
loadPreset();
