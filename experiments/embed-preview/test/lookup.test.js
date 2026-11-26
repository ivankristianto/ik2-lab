import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupHtml, lookupUrl } from '../lookup.js';
import { microlinkUrl } from '../microlink.js';
import { TAGS } from '../tags.js';
import { messageFor, PASTE_HELPS } from '../messages.js';

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// Records every request and answers from a list of [match, response] pairs.
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const hit = routes.find(([match]) => url.startsWith(match));
    if (!hit) throw new TypeError('Failed to fetch');
    const res = hit[1];
    if (res instanceof Error) throw res;
    return typeof res === 'function' ? res(url) : res;
  };
  return { impl, calls };
}

const data = (values) => Object.fromEntries(TAGS.map((t, i) => [`t${i}`, values[t.name] ?? null]));
const tag = (r, name) => r.tags.find(([n]) => n === name)?.[1];

test('a page goes to Microlink with one rule per tag, no cookies and no referrer', async () => {
  const { impl, calls } = fakeFetch([['https://api.microlink.io/', json({ status: 'success', data: { url: 'https://example.com/post/', ...data({ title: 'Post', 'og:title': 'Post', 'og:image': '/card.png', 'twitter:card': 'summary' }) } })]]);
  const r = await lookupUrl('https://example.com/post/', impl);
  assert.equal(calls.length, 1);
  const sent = new URL(calls[0].url);
  assert.equal(sent.searchParams.get('url'), 'https://example.com/post/');
  assert.equal(sent.searchParams.get('meta'), 'false');
  assert.equal(sent.searchParams.get('data.t2.selector'), 'meta[property="og:title"]');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.referrerPolicy, 'no-referrer');
  assert.equal(r.source, 'Microlink');
  assert.equal(tag(r, 'og:title'), 'Post');
  assert.equal(tag(r, 'description'), undefined);
  assert.equal(r.oembedNote, 'not reported');
});

test('the daily limit (429 ERATE) becomes the rate-limited message that points to paste', async () => {
  const { impl } = fakeFetch([['https://api.microlink.io/', json({ status: 'fail', code: 'ERATE', message: 'Your daily rate limit has been reached.' }, 429)]]);
  await assert.rejects(lookupUrl('https://example.com/', impl), (e) => {
    assert.equal(e.code, 'rate-limited');
    assert.ok(PASTE_HELPS.has(e.code));
    assert.match(messageFor(e), /Paste the page's HTML below/);
    return true;
  });
});

test('a bare 429 without a body still counts as the limit', async () => {
  const { impl } = fakeFetch([['https://api.microlink.io/', { ok: false, status: 429, json: async () => { throw new SyntaxError('no json'); } }]]);
  await assert.rejects(lookupUrl('https://example.com/', impl), { code: 'rate-limited' });
});

test('Microlink error codes map to their own messages', async () => {
  for (const [code, expected] of [['ECONCURRENCY', 'busy'], ['EFORBIDDENURL', 'private-url'], ['EPROXYNEEDED', 'blocked'], ['EUNREACHABLE', 'unreachable'], ['EWHATEVER', 'failed']]) {
    const { impl } = fakeFetch([['https://api.microlink.io/', json({ status: 'fail', code }, 400)]]);
    await assert.rejects(lookupUrl('https://example.com/', impl), { code: expected }, code);
  }
});

test('a network failure says Microlink could not be reached', async () => {
  const { impl } = fakeFetch([]);
  await assert.rejects(lookupUrl('https://example.com/', impl), { code: 'network' });
});

test('private addresses are refused without any request', async () => {
  const { impl, calls } = fakeFetch([]);
  await assert.rejects(lookupUrl('http://192.168.1.10/admin', impl), { code: 'private-url' });
  assert.equal(calls.length, 0);
});

test('YouTube goes to its own oEmbed endpoint and never to Microlink', async () => {
  const { impl, calls } = fakeFetch([['https://www.youtube.com/oembed', json({ type: 'video', title: 'Me at the zoo', provider_name: 'YouTube', thumbnail_url: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg', html: '<iframe src="https://www.youtube.com/embed/jNQXAC9IVRw"></iframe>' })]]);
  const r = await lookupUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw', impl);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith('https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com'));
  assert.equal(r.source, 'YouTube');
  assert.equal(r.oembed.title, 'Me at the zoo');
  assert.equal(r.oembed.html, '<iframe src="https://www.youtube.com/embed/jNQXAC9IVRw"></iframe>');
});

test('when the provider fails, Microlink reads the page instead', async () => {
  const { impl, calls } = fakeFetch([
    ['https://vimeo.com/api/oembed.json', json({}, 404)],
    ['https://api.microlink.io/', json({ status: 'success', data: data({ 'og:title': 'A video' }) })],
  ]);
  const r = await lookupUrl('https://vimeo.com/76979871', impl);
  assert.equal(calls.length, 2);
  assert.equal(r.source, 'Microlink');
  assert.equal(tag(r, 'og:title'), 'A video');
});

test('a declared oEmbed link is fetched, and unsafe fields are dropped', async () => {
  const { impl, calls } = fakeFetch([
    ['https://api.microlink.io/', json({ status: 'success', data: data({ 'og:title': 'Post', 'link oembed': 'https://example.com/wp-json/oembed/1.0/embed?url=x' }) })],
    ['https://example.com/wp-json/oembed/', json({ type: 'rich', title: 'Post', thumbnail_url: 'javascript:alert(1)', author_url: 'https://example.com/author/', html: '<script>alert(1)</script>', evil: 'x' })],
  ]);
  const r = await lookupUrl('https://example.com/post/', impl);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.credentials, 'omit');
  assert.equal(r.oembedNote, 'declared');
  assert.equal(r.oembed.thumbnail_url, undefined);
  assert.equal(r.oembed.author_url, 'https://example.com/author/');
  assert.equal(r.oembed.html, '<script>alert(1)</script>');
  assert.equal(r.oembed.evil, undefined);
});

test('a declared oEmbed link the browser cannot read leaves a note, not an error', async () => {
  const { impl } = fakeFetch([['https://api.microlink.io/', json({ status: 'success', data: data({ 'link oembed': 'https://www.flickr.com/services/oembed/?url=x' }) })]]);
  const r = await lookupUrl('https://www.flickr.com/photos/bees/2341623661/', impl);
  assert.equal(r.oembed, null);
  assert.equal(r.oembedNote, 'declared, not readable here');
});

test('a declared javascript: oEmbed link is never requested', async () => {
  const { impl, calls } = fakeFetch([['https://api.microlink.io/', json({ status: 'success', data: data({ 'link oembed': 'javascript:alert(1)' }) })]]);
  const r = await lookupUrl('https://example.com/', impl);
  assert.equal(calls.length, 1);
  assert.equal(r.oembedNote, 'not reported');
});

test('pasted HTML is read with no network at all', () => {
  const r = lookupHtml('<meta property="og:title" content="Pasted"><link rel="alternate" type="application/json+oembed" href="https://example.com/o">');
  assert.equal(r.source, 'pasted HTML');
  assert.equal(tag(r, 'og:title'), 'Pasted');
  assert.equal(r.oembedNote, 'declared, not fetched');
  assert.throws(() => lookupHtml('   '), { code: 'empty-html' });
});

test('the request URL stays under common URL length limits', () => {
  assert.ok(microlinkUrl('https://example.com/' + 'a'.repeat(200)).length < 4000);
});
