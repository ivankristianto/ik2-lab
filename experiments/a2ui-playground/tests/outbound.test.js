import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, BASIC_CATALOG } from '../protocol.js';
import { errorMessages, dataModelMetadata } from '../outbound.js';

const create = (extra = {}) => ({ version: '1.0', createSurface: { surfaceId: 'card', catalogId: BASIC_CATALOG, components: [{ id: 'root', component: 'Text', text: 'hi' }], ...extra } });

test('each validation problem becomes one VALIDATION_FAILED error message for its surface', () => {
  const msgs = [create(), { version: '1.0', updateComponents: { surfaceId: 'card', components: [{ id: 'x', component: 'Image' }] } }];
  const { errors } = load(structuredClone(msgs));
  assert.deepEqual(errorMessages(msgs, errors), [
    { version: '1.0', error: { code: 'VALIDATION_FAILED', surfaceId: 'card', path: '/components/0/component', message: errors[0].message } },
  ]);
});

test('a problem with the message itself points at the body, and one with no surface is left out', () => {
  const msgs = [{ createSurface: { surfaceId: 'card', catalogId: BASIC_CATALOG, components: [{ id: 'root', component: 'Text', text: 'hi' }] } }, { version: '1.0', nonsense: {} }];
  const { errors } = load(structuredClone(msgs));
  const sent = errorMessages(msgs, errors);
  assert.deepEqual(sent.map((m) => m.error.path), ['/']);
  assert.equal(sent[0].error.surfaceId, 'card');
  assert.deepEqual(errorMessages(msgs, [{ path: '', message: 'not JSON' }]), []);
  assert.deepEqual(errorMessages(null, errors), []);
});

test('the data model goes along only when the surface asked for it, as a copy', () => {
  const plain = load([create({ dataModel: { a: 1 } })]).surfaces.get('card');
  assert.equal(dataModelMetadata(plain), null);
  assert.equal(dataModelMetadata(undefined), null);
  const synced = load([create({ dataModel: { a: 1 }, sendDataModel: true })]).surfaces.get('card');
  const meta = dataModelMetadata(synced);
  assert.deepEqual(meta, { a2uiRendererDataModel: { version: '1.0', surfaces: { card: { a: 1 } } } });
  synced.dataModel.a = 2;
  assert.equal(meta.a2uiRendererDataModel.surfaces.card.a, 1);
});
