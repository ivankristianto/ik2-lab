// Page wiring: presets, Render, live mode and the action log.
import { read, load, parseMessages, SUPPORTED, LEFT_OUT } from './protocol.js';
import { renderSurface } from './render.js';
import { PRESETS, toJSON } from './presets.js';
import { PROVIDERS, generate, ProviderError } from './providers.js';

const $ = (id) => document.getElementById(id);
const field = $('messages');
let surfaces = new Map();
let views = [];

$('supported').textContent = `Components this playground draws: ${SUPPORTED.join(', ')}. ${Object.keys(LEFT_OUT).join(', ')} are left out on purpose, and a response that uses them is reported, not drawn.`;

for (const p of PRESETS) $('preset').append(new Option(p.label, p.id));
const currentPreset = () => PRESETS.find((p) => p.id === $('preset').value);
const source = () => document.querySelector('input[name="source"]:checked').value;

function line(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.textContent = text;
  return node;
}

function setNote(text, status) {
  const note = $('note');
  note.replaceChildren(status ? line('span', `lab-status lab-status--${status}`, text) : text);
}

function showProblems(errors, lead) {
  const box = line('div', 'lab-error', '');
  box.setAttribute('role', 'alert');
  const head = document.createElement('p');
  head.append(line('strong', '', lead || 'I didn\'t render this response.'));
  if (errors.length > 1 || errors[0].path) head.append(` ${errors.length === 1 ? 'One part isn\'t' : `${errors.length} parts aren't`} A2UI this playground can draw. Fix ${errors.length === 1 ? 'it' : 'them'} in the messages and press Render.`);
  box.append(head);
  if (errors.length === 1 && !errors[0].path) {
    box.append(line('p', '', errors[0].message));
  } else {
    const list = line('ul', 'pg-problems', '');
    for (const err of errors.slice(0, 20)) {
      const li = document.createElement('li');
      if (err.path) li.append(line('code', '', err.path), ' ');
      li.append(err.message);
      list.append(li);
    }
    if (errors.length > 20) list.append(line('li', '', `And ${errors.length - 20} more.`));
    box.append(list);
  }
  $('problems').replaceChildren(box);
  $('surfaces').replaceChildren();
  setNote('not rendered', 'error');
}

function drawSurfaces() {
  views = [...surfaces.values()].map((s) => renderSurface(s, { onAction }));
  $('surfaces').replaceChildren(...views.map((v) => v.element));
  if (!views.length) $('surfaces').append(line('p', 'lab-empty', 'The messages delete every surface they create, so there is nothing left to draw.'));
  const count = [...surfaces.values()].reduce((n, s) => n + s.components.size, 0);
  const notes = views.map((v) => v.note).filter(Boolean);
  setNote([[...surfaces.keys()].join(', '), `${count} ${count === 1 ? 'component' : 'components'}`, ...notes].filter(Boolean).join(' · '));
}

function render() {
  $('action-wrap').hidden = true;
  const result = read(field.value);
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
  $('action').textContent = JSON.stringify(message, null, 2);
  $('action-wrap').hidden = false;
  const reply = source() === 'preset' && currentPreset().replies && currentPreset().replies[message.action.name];
  $('reply-wrap').hidden = !reply;
  if (!reply) return;
  $('reply').textContent = toJSON(reply);
  const { errors } = load(structuredClone(reply), surfaces);
  if (errors.length) showProblems(errors, 'The scripted reply didn\'t apply.');
  else drawSurfaces();
}

function loadPreset() {
  field.value = toJSON(currentPreset().messages);
  render();
}

function setSource() {
  const live = source() === 'live';
  $('preset-panel').hidden = live;
  $('live-panel').hidden = !live;
  $('reset').hidden = live;
  if (!live) loadPreset();
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
    status.textContent = `reply in ${seconds} s`;
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
$('render').addEventListener('click', render);
$('reset').addEventListener('click', loadPreset);
$('generate').addEventListener('click', runLive);
$('provider').addEventListener('change', setProvider);
field.addEventListener('keydown', ctrlEnter(render));
$('prompt').addEventListener('keydown', ctrlEnter(runLive));
for (const radio of document.querySelectorAll('input[name="source"]')) radio.addEventListener('change', setSource);

setProvider();
loadPreset();
