import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, PROVIDERS, ProviderError, SYSTEM_PROMPT } from '../providers.js';
import { read } from '../protocol.js';

const KEY = 'test-key-0123456789';
const A2UI = JSON.stringify({ messages: [{ version: '1.0', createSurface: { surfaceId: 'main', catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json', components: [{ id: 'root', component: 'Text', text: 'Hi' }] } }] });

// A stand-in for fetch that records the call and answers with a fixed status and body.
function mockFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body) };
  };
  fn.calls = calls;
  return fn;
}

const REPLIES = {
  anthropic: { content: [{ type: 'text', text: A2UI }], stop_reason: 'end_turn' },
  openai: { status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: A2UI }] }] },
  gemini: { candidates: [{ content: { parts: [{ text: A2UI }], role: 'model' }, finishReason: 'STOP' }] },
};

for (const [id, p] of Object.entries(PROVIDERS)) {
  test(`${id}: sends the documented request and reads the reply`, async () => {
    const fetchImpl = mockFetch(200, REPLIES[id]);
    const out = await generate({ provider: id, model: p.model, key: KEY, prompt: 'A form', fetchImpl });
    assert.equal(out.text, A2UI);
    assert.equal(out.cutOff, false);
    assert.deepEqual(read(out.text).errors, []);
    const [call] = fetchImpl.calls;
    assert.ok(call.url.startsWith(`https://${p.host}/`));
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.credentials, 'omit');
    assert.ok(!call.url.includes(KEY), 'key never in the URL');
    const headerValues = Object.values(call.init.headers).join(' ');
    assert.ok(headerValues.includes(KEY), 'key travels in a header');
  });

  test(`${id}: turned-down key gives a sentence, not the provider body`, async () => {
    const body = { error: { message: `Incorrect API key provided: ${KEY.slice(0, 4)}****. Raw provider text.`, details: [{ reason: 'API_KEY_INVALID' }] } };
    const fetchImpl = mockFetch(id === 'gemini' ? 400 : 401, body);
    await assert.rejects(generate({ provider: id, model: p.model, key: KEY, prompt: 'A form', fetchImpl }), (err) => {
      assert.ok(err instanceof ProviderError);
      assert.match(err.message, /turned the key down/);
      assert.doesNotMatch(err.message, /Raw provider text|\*\*\*\*/);
      return true;
    });
  });

  test(`${id}: 404, 429 and 500 map to plain sentences`, async () => {
    for (const [status, pattern] of [[404, /doesn't know the model/], [429, /limiting requests/], [500, /problem on its side/]]) {
      await assert.rejects(generate({ provider: id, model: p.model, key: KEY, prompt: 'A form', fetchImpl: mockFetch(status, { error: { message: 'raw' } }) }), pattern);
    }
  });

  test(`${id}: a network failure says the request didn't reach the host`, async () => {
    const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(generate({ provider: id, model: p.model, key: KEY, prompt: 'A form', fetchImpl }), new RegExp(`didn't reach ${p.host.replace(/\./g, '\\.')}`));
  });
}

test('anthropic: sends the direct browser access header and version', async () => {
  const fetchImpl = mockFetch(200, REPLIES.anthropic);
  await generate({ provider: 'anthropic', model: 'claude-haiku-5-5', key: KEY, prompt: 'A form', fetchImpl });
  const { init, body } = fetchImpl.calls[0];
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(init.headers['x-api-key'], KEY);
  assert.ok(init.headers['anthropic-version']);
  assert.equal(body.system, SYSTEM_PROMPT);
  assert.equal(body.messages[0].content, 'A form');
  assert.ok(body.max_tokens > 0);
});

test('anthropic: a Zero Data Retention organisation gets its own sentence', async () => {
  const fetchImpl = mockFetch(401, { type: 'error', error: { type: 'authentication_error', message: 'CORS requests are not allowed for this Organization because of its settings.' } });
  await assert.rejects(generate({ provider: 'anthropic', model: 'claude-haiku-5-5', key: KEY, prompt: 'x', fetchImpl }), /Zero Data Retention/);
});

test('anthropic: stop at max_tokens is reported as cut off', async () => {
  const out = await generate({ provider: 'anthropic', model: 'claude-haiku-5-5', key: KEY, prompt: 'x', fetchImpl: mockFetch(200, { content: [{ type: 'text', text: '{"messages": [' }], stop_reason: 'max_tokens' }) });
  assert.equal(out.cutOff, true);
});

test('openai: Responses API with JSON mode and a bearer key', async () => {
  const fetchImpl = mockFetch(200, REPLIES.openai);
  await generate({ provider: 'openai', model: 'gpt-6-luna', key: KEY, prompt: 'A form', fetchImpl });
  const { url, init, body } = fetchImpl.calls[0];
  assert.equal(url, 'https://api.openai.com/v1/responses');
  assert.equal(init.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(body.text, { format: { type: 'json_object' } });
  assert.equal(body.instructions, SYSTEM_PROMPT);
  assert.match(SYSTEM_PROMPT, /JSON/, 'JSON mode needs the word JSON in the prompt');
});

test('gemini: generateContent with the key in x-goog-api-key and JSON output', async () => {
  const fetchImpl = mockFetch(200, REPLIES.gemini);
  await generate({ provider: 'gemini', model: 'gemini-3.5-flash-lite', key: KEY, prompt: 'A form', fetchImpl });
  const { url, init, body } = fetchImpl.calls[0];
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.systemInstruction.parts[0].text, SYSTEM_PROMPT);
});

test('gemini: a blocked prompt says so', async () => {
  await assert.rejects(generate({ provider: 'gemini', model: 'gemini-3.5-flash-lite', key: KEY, prompt: 'x', fetchImpl: mockFetch(200, { promptFeedback: { blockReason: 'SAFETY' } }) }), /declined/);
});

test('input checks run before any request', async () => {
  const fetchImpl = mockFetch(200, {});
  await assert.rejects(generate({ provider: 'anthropic', model: 'claude-haiku-5-5', key: ' ', prompt: 'x', fetchImpl }), /Paste your Anthropic API key/);
  await assert.rejects(generate({ provider: 'gemini', model: '../../evil?x=', key: KEY, prompt: 'x', fetchImpl }), /model ID can only hold/);
  await assert.rejects(generate({ provider: 'openai', model: 'gpt-6-luna', key: KEY, prompt: '  ', fetchImpl }), /Describe the interface/);
  await assert.rejects(generate({ provider: 'nope', model: 'm', key: KEY, prompt: 'x', fetchImpl }), /Pick a provider/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('an empty reply is an error, not a blank render', async () => {
  await assert.rejects(generate({ provider: 'openai', model: 'gpt-6-luna', key: KEY, prompt: 'x', fetchImpl: mockFetch(200, { status: 'completed', output: [] }) }), /empty reply/);
});
