import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, byClass } from './fake-dom.js';
import { load, BASIC_CATALOG } from '../protocol.js';
import { renderSurface } from '../render.js';
import { PRESETS } from '../presets.js';

const doc = installDom();
const create = (components, dataModel = {}) => ({ version: '1.0', createSurface: { surfaceId: 's', catalogId: BASIC_CATALOG, components, dataModel } });
const draw = (messages, onAction) => {
  const { surfaces, errors } = load(structuredClone(messages));
  assert.deepEqual(errors, []);
  const view = renderSurface([...surfaces.values()][0], { onAction });
  doc.body.replaceChildren(view.element);
  return view.element;
};
const preset = (id) => PRESETS.find((p) => p.id === id);

test('a nested Row or Column sets its own alignment instead of inheriting its parent\'s', () => {
  const el = draw([create([
    { id: 'root', component: 'Row', children: ['inner'], align: 'center', justify: 'spaceBetween' },
    { id: 'inner', component: 'Column', children: ['t'] },
    { id: 't', component: 'Text', text: 'x' },
  ])]);
  const [outer] = byClass(el, 'a2ui-row');
  const [inner] = byClass(el, 'a2ui-column');
  assert.equal(outer.style.getPropertyValue('--a2ui-align'), 'center');
  assert.equal(outer.style.getPropertyValue('--a2ui-justify'), 'space-between');
  assert.equal(inner.style.getPropertyValue('--a2ui-align'), 'stretch');
  assert.equal(inner.style.getPropertyValue('--a2ui-justify'), 'flex-start');
});

test('a field the agent filled in shows its check messages at once; an empty one waits until touched', () => {
  const el = draw(preset('contact').messages);
  const shown = byClass(el, 'a2ui-checks').map((n) => n.textContent).filter(Boolean);
  assert.deepEqual(shown, ['Enter an email address like you@example.com.']);
});

test('a Button with failing checks is disabled and says why', () => {
  const el = draw(preset('contact').messages);
  const send = el.all().find((n) => n.tagName === 'BUTTON' && n.textContent === 'Send message');
  assert.equal(send.disabled, true);
  const why = el.all().find((n) => n.id === send.getAttribute('aria-describedby'));
  assert.equal(why.hidden, false);
  assert.match(why.textContent, /valid email/);
});

test('the hostile preset draws every string as text and creates no element from it', () => {
  const el = draw(preset('hostile').messages);
  const tags = new Set(el.all().map((n) => n.tagName));
  for (const bad of ['SCRIPT', 'IMG', 'SVG', 'B', 'A']) assert.equal(tags.has(bad), false, bad);
  assert.match(el.textContent, /<img src=x onerror=/);
  assert.match(el.textContent, /<\/p><script>fetch/);
  assert.match(el.textContent, /\[Claim your prize\]\(javascript:alert\(1\)\)/);
});

test('pressing a Button sends the A2UI action message with its context resolved', () => {
  let sent;
  const el = draw(preset('booking').messages, (m) => { sent = m; });
  el.all().find((n) => n.tagName === 'BUTTON' && n.textContent === 'Confirm booking').click();
  assert.equal(sent.version, '1.0');
  assert.equal(sent.action.name, 'confirmBooking');
  assert.equal(sent.action.surfaceId, 'booking');
  assert.equal(sent.action.sourceComponentId, 'confirm');
  assert.match(sent.action.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual(sent.action.context, { guests: 2, outdoor: false });
  assert.equal(sent.action.userMessage, 'Confirmed the booking');
});

test('a template Button sends its own item, so each plan or flight is told apart', () => {
  const sent = [];
  const el = draw(preset('trip').messages, (m) => sent.push(m.action.context));
  for (const b of el.all().filter((n) => n.tagName === 'BUTTON' && n.textContent === 'Pick')) b.click();
  assert.deepEqual(sent.map((c) => c.code), ['GA 204', 'QZ 7550']);
});

test('typing into a bound field updates the data model and every Text bound to it', () => {
  const { surfaces } = load(structuredClone(preset('settings').messages));
  const s = surfaces.get('settings');
  const view = renderSurface(s);
  const budget = view.element.all().find((n) => n.tagName === 'LABEL' && n.textContent === 'Budget in rupiah');
  const input = view.element.all().find((n) => n.id === budget.getAttribute('for'));
  input.value = '1000';
  input.dispatch('input');
  assert.equal(s.dataModel.trip.budget, 1000);
  assert.ok(byClass(view.element, 'a2ui-caption').some((n) => /1,000/.test(n.textContent)));
});

test('a functionCall Button runs the function in the renderer and sends no action', () => {
  const runs = [];
  let sent = 0;
  const { surfaces } = load(structuredClone(preset('feedback').messages));
  const s = surfaces.get('survey');
  const view = renderSurface(s, { onAction: () => { sent += 1; }, onFunction: (r) => runs.push(r) });
  const button = (label) => view.element.all().find((n) => n.tagName === 'BUTTON' && n.textContent === label);
  s.dataModel.survey.stars = 5;
  button('Preview my feedback').click();
  assert.equal(sent, 0);
  assert.deepEqual(runs, [{ surfaceId: 'survey', sourceComponentId: 'preview', call: 'formatString', args: { value: '${/survey/stars} stars. ${/survey/note}' }, value: '5 stars. More time for questions, please.' }]);
  button('Send feedback').click();
  assert.equal(sent, 1);
});
