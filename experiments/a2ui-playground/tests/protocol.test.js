import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessages, load, read, BASIC_CATALOG, LIMITS } from '../protocol.js';
import { evaluate, getPath, setPath, interpolate } from '../evaluate.js';
import { PRESETS } from '../presets.js';

const create = (components, extra = {}) => ({ version: '1.0', createSurface: { surfaceId: 's', catalogId: BASIC_CATALOG, components, ...extra } });
const paths = (r) => r.errors.map((e) => e.path);
const messages = (r) => r.errors.map((e) => e.message).join('\n');
const root = (more = []) => [{ id: 'root', component: 'Column', children: more.map((c) => c.id) }, ...more];

test('every working preset loads with no problems', () => {
  for (const p of PRESETS.filter((x) => x.id !== 'broken')) {
    const r = load(structuredClone(p.messages));
    assert.deepEqual(r.errors, [], p.id);
    assert.ok(r.surfaces.size, p.id);
  }
});

test('the broken preset reports the Image and the dangling child, and nothing else', () => {
  const r = load(structuredClone(PRESETS.find((p) => p.id === 'broken').messages));
  assert.deepEqual(paths(r), ['/0/createSurface/components/1/component', '/0/createSurface/components/2/child']);
  assert.match(r.errors[0].message, /^Image: /);
  assert.match(r.errors[1].message, /"cta_label"/);
});

test('the booking reply applies on top of the booking surface', () => {
  const p = PRESETS.find((x) => x.id === 'booking');
  const r = load(structuredClone(p.messages));
  const after = load(structuredClone(p.replies.confirmBooking), r.surfaces);
  assert.deepEqual(after.errors, []);
  assert.equal(r.surfaces.get('booking').components.get('root').child, 'done');
});

test('parse: array, single object, {"messages"} wrapper, JSON Lines and a fenced block', () => {
  const one = create(root());
  assert.equal(parseMessages(JSON.stringify([one, one])).messages.length, 2);
  assert.equal(parseMessages(JSON.stringify(one)).messages.length, 1);
  assert.equal(parseMessages(JSON.stringify({ messages: [one] })).messages.length, 1);
  assert.equal(parseMessages(`${JSON.stringify(one)}\n${JSON.stringify(one)}`).messages.length, 2);
  assert.equal(parseMessages('```json\n' + JSON.stringify([one]) + '\n```').messages.length, 1);
});

test('parse: empty, prose, broken JSON and oversize input get plain sentences', () => {
  assert.match(parseMessages('  ').errors[0].message, /nothing to render/);
  assert.match(parseMessages('Here is your form: {}').errors[0].message, /starts with "Here is your form/);
  assert.match(parseMessages('[\n{"a": 1,}\n]').errors[0].message, /near line 2/);
  assert.match(parseMessages('{"a":1}\n{"b":').errors[0].message, /Line 2 isn't valid JSON/);
  assert.match(parseMessages('[' + ' '.repeat(LIMITS.bytes) + ']').errors[0].message, /KB/);
  assert.doesNotMatch(messages(read('[\n{"a": 1,}\n]')), /position|Unexpected|token/i);
});

test('envelope: version, one message type, unknown and RPC types', () => {
  assert.match(messages(load([{ createSurface: { surfaceId: 's', catalogId: BASIC_CATALOG, components: root() } }])), /"version": "1.0"/);
  assert.match(messages(load([{ ...create(root()), version: '0.9' }])), /not "0.9"/);
  assert.match(messages(load([{ version: '1.0', createSurface: {}, deleteSurface: {} }])), /exactly one/);
  assert.match(messages(load([{ version: '1.0', renderSomething: {} }])), /isn't an A2UI message type/);
  assert.match(messages(load([{ version: '1.0', callRendererFunction: {} }])), /live agent session/);
  assert.match(messages(load(['text'])), /JSON object/);
  assert.match(messages(load([])), /no messages/);
});

test('createSurface: catalog id, theme, duplicates, surfaceId', () => {
  assert.match(messages(load([{ version: '1.0', createSurface: { surfaceId: 's', components: root() } }])), /catalogId/);
  assert.match(messages(load([create(root(), { theme: { primaryColor: '#00f' } })])), /dropped theme/);
  assert.match(messages(load([create(root()), create(root())])), /already exists/);
  assert.match(messages(load([{ version: '1.0', createSurface: { catalogId: BASIC_CATALOG } }])), /needs a surfaceId/);
  assert.match(messages(load([create(root(), { dataModel: [] })])), /dataModel has to be an object/);
});

test('update and delete need a surface that exists', () => {
  assert.match(messages(load([{ version: '1.0', updateComponents: { surfaceId: 'x', components: [] } }])), /no surface x/);
  const r = load([create(root()), { version: '1.0', deleteSurface: { surfaceId: 's' } }]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.surfaces.size, 0);
});

test('updateDataModel upserts, removes with null, and refuses unsafe paths', () => {
  const r = load([create(root(), { dataModel: { a: { b: 1 } } }),
    { version: '1.0', updateDataModel: { surfaceId: 's', path: '/a/c', value: 2 } },
    { version: '1.0', updateDataModel: { surfaceId: 's', path: '/a/b', value: null } }]);
  assert.deepEqual(r.surfaces.get('s').dataModel, { a: { c: 2 } });
  assert.match(messages(load([create(root()), { version: '1.0', updateDataModel: { surfaceId: 's', path: '/__proto__/x', value: 1 } }])), /__proto__/);
  assert.match(messages(load([create(root()), { version: '1.0', updateDataModel: { surfaceId: 's', path: 'a' , value: 1 } }])), /starts with \//);
  assert.match(messages(load([create(root()), { version: '1.0', updateDataModel: { surfaceId: 's', path: '/a' } }])), /needs a value/);
  assert.equal({}.x, undefined);
});

test('components: left-out types, unknown types, ids, required and unknown props', () => {
  for (const type of ['Image', 'Video', 'AudioPlayer', 'Icon', 'Modal']) {
    assert.match(messages(load([create(root([{ id: 'x', component: type }]))])), new RegExp(`^${type}: `, 'm'), type);
  }
  assert.match(messages(load([create(root([{ id: 'x', component: 'Carousel' }]))])), /isn't in the A2UI basic catalog/);
  assert.match(messages(load([create(root([{ id: 'user-card', component: 'Divider' }]))])), /underscores/);
  assert.match(messages(load([create(root([{ id: '1st', component: 'Divider' }]))])), /underscores/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Text' }]))])), /Text needs a "text"/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Text', text: 'a', colour: 'red' }]))])), /no "colour" property/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Text', text: 'a', variant: 'h1' }]))])), /one of caption, body/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Text', text: 5 }]))])), /Expected text, got a number/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Divider', '@catalogId': 'other' }]))])), /Only the basic catalog/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Divider', '@checks': [] }]))])), /doesn't take @checks/);
});

test('component props: children, tabs, options, actions, accessibility, checks', () => {
  assert.match(messages(load([create([{ id: 'root', component: 'Column', children: 'a' }])])), /list of ids/);
  assert.match(messages(load([create([{ id: 'root', component: 'Tabs', tabs: [] }])])), /at least one tab/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'ChoicePicker', options: [{ label: 'a' }], value: [] }]))])), /label and a string value/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Button', child: 'root', action: { go: 1 } }]))])), /An action is/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Button', child: 'root', action: { event: {} } }]))])), /needs a name/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Divider', '@accessibility': { role: 'x' } }]))])), /no "role" property/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'CheckBox', label: 'a', value: true, '@checks': [{}] }]))])), /needs a condition/);
});

test('component extras: weight, @metadata, the live enum, sendDataModel', () => {
  assert.match(messages(load([create(root([{ id: 'x', component: 'Divider', weight: 'big' }]))])), /weight has to be a number/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Divider', '@metadata': 'x' }]))])), /@metadata has to be an object/);
  assert.match(messages(load([create(root([{ id: 'x', component: 'Divider', '@accessibility': { live: 'loud' } }]))])), /one of off, polite, assertive/);
  assert.match(messages(load([create(root(), { sendDataModel: 'yes' })])), /sendDataModel is true or false/);
  assert.deepEqual(load([create(root([{ id: 'x', component: 'Divider', weight: 1, '@metadata': {}, '@accessibility': { label: 'Rule', live: 'polite' } }]), { sendDataModel: true })]).errors, []);
});

test('input nested too deeply gets a sentence instead of a crash', () => {
  const deep = '[' + JSON.stringify(create(root())).replace('"components"', `"dataModel": ${'{"a":'.repeat(9000)}1${'}'.repeat(9000)}, "components"`) + ']';
  assert.match(messages(read(deep)), /nested too deeply/);
  const calls = '{"@call":"not","args":{"value":'.repeat(3000) + 'true' + '}}'.repeat(3000);
  const nested = JSON.stringify([create(root([{ id: 'x', component: 'CheckBox', label: 'a', value: true }]))]).replace('"value":true', `"value":${calls}`);
  assert.match(messages(read(nested)), /nested too deeply/);
});

test('bindings and functions: shape, unsafe paths, left-out and unknown functions, args', () => {
  const field = (value) => [create(root([{ id: 'x', component: 'TextField', label: 'a', value }]))];
  assert.match(messages(load(field({ '@path': '/a', extra: 1 }))), /nothing else/);
  assert.match(messages(load(field({ '@path': '/constructor/x' }))), /__proto__, constructor or prototype/);
  assert.match(messages(load(field({ '@call': 'regex', args: { value: 'a', pattern: '(a+)+$' } }))), /safety check/);
  assert.match(messages(load(field({ '@call': 'openUrl', args: { url: 'https://x' } }))), /can't open pages/);
  assert.match(messages(load(field({ '@call': 'shout', args: {} }))), /isn't a basic-catalog function/);
  assert.match(messages(load(field({ '@call': 'formatCurrency', args: { value: 1 } }))), /needs an argument called currency/);
  assert.match(messages(load(field({ '@call': 'formatString', args: { value: 'Hi ${upper(${/a})}' } }))), /not function calls/);
  assert.match(messages(load(field({ '@call': 'formatString', args: { value: 'a', extra: 1 } }))), /no argument called extra/);
});

test('tree: missing root, dangling refs, cycles, depth and size limits', () => {
  assert.match(messages(load([create([{ id: 'a', component: 'Divider' }])])), /no component with the id root/);
  assert.match(messages(load([create([{ id: 'root', component: 'Card', child: 'nope' }])])), /"nope", but no component/);
  assert.match(messages(load([create([{ id: 'root', component: 'Card', child: 'a' }, { id: 'a', component: 'Card', child: 'root' }])])), /contains itself/);
  const deep = [{ id: 'root', component: 'Card', child: 'c0' }];
  for (let i = 0; i < LIMITS.depth + 2; i++) deep.push({ id: `c${i}`, component: 'Card', child: `c${i + 1}` });
  deep.push({ id: `c${LIMITS.depth + 2}`, component: 'Divider' });
  assert.match(messages(load([create(deep)])), /deeper than/);
  const many = root(Array.from({ length: LIMITS.components + 1 }, (_, i) => ({ id: `d${i}`, component: 'Divider' })));
  assert.match(messages(load([create(many)])), /over the 500/);
});

test('@index only inside a list template', () => {
  const idx = { id: 't', component: 'Text', text: { '@call': '@index' } };
  assert.match(messages(load([create(root([idx]))])), /@index only works inside a list template/);
  const ok = load([create([{ id: 'root', component: 'List', children: { componentId: 'card', path: '/items' } },
    { id: 'card', component: 'Card', child: 't' }, idx], { dataModel: { items: [1] } })]);
  assert.deepEqual(ok.errors, []);
});

test('components can arrive across messages', () => {
  const r = load([create([{ id: 'root', component: 'Card', child: 'later' }]),
    { version: '1.0', updateComponents: { surfaceId: 's', components: [{ id: 'later', component: 'Divider' }] } }]);
  assert.deepEqual(r.errors, []);
});

test('evaluate: paths, relative scope, functions and validation results', () => {
  const model = { user: { name: 'Ayu' }, items: [{ n: 'a' }, { n: 'b' }], email: 'x@y.co', price: 4500000 };
  const ctx = { model, base: '/items/1', index: 1 };
  assert.equal(evaluate({ '@path': '/user/name' }, ctx), 'Ayu');
  assert.equal(evaluate({ '@path': 'n' }, ctx), 'b');
  assert.equal(evaluate({ '@call': '@index', args: { offset: 1 } }, ctx), 2);
  assert.deepEqual(evaluate({ '@call': 'email', args: { value: { '@path': '/email' } } }, ctx), { valid: true });
  assert.deepEqual(evaluate({ '@call': 'required', args: { value: '' } }, ctx), { valid: false });
  assert.equal(evaluate({ '@call': 'and', args: { values: [{ valid: true }, true] } }, ctx), true);
  assert.equal(evaluate({ '@call': 'not', args: { value: { valid: true } } }, ctx), false);
  assert.equal(interpolate('Hi ${/user/name}, \\${x} ${n}', ctx), 'Hi Ayu, ${x} b');
  assert.equal(getPath(model, '/user/constructor'), undefined);
  assert.throws(() => setPath({}, '/__proto__/polluted', 1));
  assert.equal({}.polluted, undefined);
});
