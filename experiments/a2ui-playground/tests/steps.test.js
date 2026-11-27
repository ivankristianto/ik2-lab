import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASIC_CATALOG } from '../protocol.js';
import { describe, playTo } from '../steps.js';

const create = { version: '1.0', createSurface: { surfaceId: 's', catalogId: BASIC_CATALOG, dataModel: { n: 1 }, components: [{ id: 'root', component: 'Text', text: { '@path': '/n' } }] } };
const set = (value) => ({ version: '1.0', updateDataModel: { surfaceId: 's', path: '/n', value } });
const bad = { version: '1.0', updateComponents: { surfaceId: 's', components: [{ id: 'x', component: 'Image' }] } };

test('describe says what each message type does in one line', () => {
  assert.equal(describe(create), 'createSurface makes s with 1 component.');
  assert.equal(describe(set(2)), 'updateDataModel on s sets /n to 2.');
  assert.equal(describe({ version: '1.0', updateDataModel: { surfaceId: 's', value: {} } }), 'updateDataModel on s sets / to {}.');
  assert.equal(describe({ version: '1.0', updateComponents: { surfaceId: 's', components: [{ id: 'a' }, { id: 'b' }] } }), 'updateComponents on s adds or replaces a, b.');
  assert.equal(describe({ version: '1.0', deleteSurface: { surfaceId: 's' } }), 'deleteSurface removes s and everything in it.');
  assert.match(describe(set('x'.repeat(100))), /\.\.\.\.$/);
});

test('describe copes with anything a visitor types', () => {
  for (const junk of [null, 5, 'text', [], {}, { version: '1.0' }, { createSurface: null }]) {
    assert.equal(typeof describe(junk), 'string');
  }
});

test('playTo applies the first n messages and clamps n to the list', () => {
  assert.equal(playTo([create, set(2), set(3)], 2).surfaces.get('s').dataModel.n, 2);
  assert.equal(playTo([create, set(2), set(3)], 99).step, 3);
  assert.equal(playTo([create, set(2)], 0).step, 1);
  assert.deepEqual(playTo([], 3), { step: 0, total: 0, surfaces: new Map(), rejected: [] });
});

test('playTo skips a message with problems, reports it under its own index, and goes on', () => {
  const r = playTo([create, bad, set(5)], 3);
  assert.equal(r.surfaces.get('s').dataModel.n, 5);
  assert.equal(r.surfaces.get('s').components.has('x'), false);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].index, 1);
  assert.equal(r.rejected[0].errors[0].path, '/1/updateComponents/components/0/component');
});

test('playTo never changes the messages it was given', () => {
  const list = [create, set(2)];
  const copy = structuredClone(list);
  playTo(list, 2);
  assert.deepEqual(list, copy);
});
