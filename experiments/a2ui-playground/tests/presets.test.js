import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../protocol.js';
import { evaluate } from '../evaluate.js';
import { playTo } from '../steps.js';
import { PRESETS } from '../presets.js';

const preset = (id) => PRESETS.find((p) => p.id === id);
const loaded = (id) => load(structuredClone(preset(id).messages));
const reply = (id, name, surfaces) => load(structuredClone(preset(id).replies[name]), surfaces);
const text = (surface, compId) => evaluate(surface.components.get(compId).text, { model: surface.dataModel, base: '' });

test('every preset has an id, a label, a group and a hint, and ids are unique', () => {
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  for (const p of PRESETS) {
    for (const key of ['label', 'group', 'shows']) assert.ok(typeof p[key] === 'string' && p[key], `${p.id} ${key}`);
    assert.doesNotMatch(p.shows, /\u2014/, p.id);
  }
  assert.equal(preset('broken'), undefined);
});

test('every preset except "what models get wrong" loads with no problems', () => {
  for (const p of PRESETS.filter((x) => x.id !== 'mistakes')) {
    const r = load(structuredClone(p.messages));
    assert.deepEqual(r.errors, [], p.id);
    assert.ok(r.surfaces.size, p.id);
  }
});

test('"what models get wrong" names each mistake and nothing else', () => {
  const r = loaded('mistakes');
  assert.deepEqual(r.errors.map((e) => e.path), [
    '/0/version',
    '/0/createSurface/theme',
    '/0/createSurface/components/1',
    '/0/createSurface/components/1/text',
    '/0/createSurface/components/2',
    '/0/createSurface/components/2/label',
    '/0/createSurface/components/2/action',
    '/0/createSurface/components/3/component',
  ]);
  assert.doesNotMatch(r.errors.map((e) => e.message).join('\n'), /object Object/);
});

test('every scripted reply applies on top of its preset', () => {
  for (const p of PRESETS.filter((x) => x.replies)) {
    for (const name of Object.keys(p.replies)) {
      const { surfaces } = load(structuredClone(p.messages));
      assert.deepEqual(reply(p.id, name, surfaces).errors, [], `${p.id} ${name}`);
    }
  }
});

test('three-step sign-up: each reply builds on the last, and what was typed survives', () => {
  const { surfaces } = loaded('wizard');
  const s = surfaces.get('workshop');
  s.dataModel.signup.session = ['Saturday 2026-12-05, 09:00'];
  for (const name of ['toSession', 'toReview']) assert.deepEqual(reply('wizard', name, surfaces).errors, []);
  assert.equal(text(s, 's3_who'), 'Ayu (ayu@example.com), Saturday 2026-12-05, 09:00.');
  assert.deepEqual(reply('wizard', 'confirmSeat', surfaces).errors, []);
  assert.equal(text(s, 's4_text'), 'Ticket WS-0412. A confirmation goes to ayu@example.com.');
  assert.deepEqual(reply('wizard', 'startOver', surfaces).errors, []);
  assert.deepEqual(s.components.get('step').children.slice(0, 1), ['s1_title']);
});

test('two surfaces: one action changes both', () => {
  const { surfaces } = loaded('trip');
  assert.deepEqual([...surfaces.keys()], ['flights', 'trip']);
  assert.deepEqual(reply('trip', 'pickFlight', surfaces).errors, []);
  assert.equal(text(surfaces.get('trip'), 'trip_flight'), 'Flight: GA 204, Sat 07:10');
  assert.deepEqual(surfaces.get('flights').components.get('root').children, ['title', 'done']);
});

test('live tracker: after the first message only data changes, until the last adds a button', () => {
  const p = preset('tracker');
  assert.equal(p.steps, true);
  const first = playTo(p.messages, 1).surfaces.get('deploy');
  const before = playTo(p.messages, p.messages.length - 1).surfaces.get('deploy');
  assert.equal(before.components.size, first.components.size);
  assert.equal(text(first, 'status'), 'Step 1 of 4: building the image');
  const end = playTo(p.messages, p.messages.length);
  assert.deepEqual(end.rejected, []);
  const s = end.surfaces.get('deploy');
  assert.equal(text(s, 'status'), 'Step 4 of 4: done');
  assert.equal(s.dataModel.log.length, 4);
  assert.ok(s.components.has('open'));
});

test('a surface from start to finish: all four message types, and the second surface is gone at the end', () => {
  const p = preset('lifecycle');
  assert.equal(p.steps, true);
  const types = new Set(p.messages.map((m) => Object.keys(m).find((k) => k !== 'version')));
  assert.deepEqual([...types].sort(), ['createSurface', 'deleteSurface', 'updateComponents', 'updateDataModel']);
  assert.ok(playTo(p.messages, p.messages.length - 1).surfaces.has('promo'));
  const end = playTo(p.messages, p.messages.length);
  assert.deepEqual([...end.surfaces.keys()], ['order']);
  assert.equal(text(end.surfaces.get('order'), 'status'), 'Status: on the way');
});

test('hostile response is valid A2UI that carries markup in its strings and data', () => {
  const r = loaded('hostile');
  assert.deepEqual(r.errors, []);
  assert.match(JSON.stringify(preset('hostile').messages), /<script>/);
});
