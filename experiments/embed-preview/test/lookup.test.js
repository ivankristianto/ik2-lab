import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateHost, lookupHtml, lookupUrl, messageFor, PASTE_HELPS, readPageUrl } from '../lookup.js';
import { buildPreview } from '../parse.js';

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

const tag = (r, name) => r.tags.find(([n]) => n === name)?.[1];

test('any other address gets one WordPress oEmbed try, with no cookies and no referrer', async () => {
  const { impl, calls } = fakeFetch([['https://example.com/wp-json/oembed/1.0/embed', json({ type: 'rich', title: 'Post', provider_name: 'Example', thumbnail_url: 'https://example.com/card.png' })]]);
  const r = await lookupUrl('https://example.com/post/', impl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.com/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fexample.com%2Fpost%2F');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.referrerPolicy, 'no-referrer');
  assert.equal(r.source, 'WordPress');
  assert.equal(r.pageRead, false);
  assert.equal(r.oembed.title, 'Post');
});

test('a site that is not WordPress points to the bookmarklet and paste', async () => {
  const { impl, calls } = fakeFetch([]);
  await assert.rejects(lookupUrl('https://example.com/', impl), (e) => {
    assert.equal(e.code, 'no-oembed');
    assert.ok(PASTE_HELPS.has(e.code));
    assert.match(messageFor(e), /bookmarklet/);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('private addresses are refused without any request', async () => {
  const { impl, calls } = fakeFetch([]);
  await assert.rejects(lookupUrl('http://192.168.1.10/admin', impl), { code: 'private-url' });
  assert.equal(calls.length, 0);
});

test('YouTube goes to its own oEmbed endpoint only', async () => {
  const { impl, calls } = fakeFetch([['https://www.youtube.com/oembed', json({ type: 'video', title: 'Me at the zoo', provider_name: 'YouTube', thumbnail_url: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg', html: '<iframe src="https://www.youtube.com/embed/jNQXAC9IVRw"></iframe>' })]]);
  const r = await lookupUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw', impl);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith('https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com'));
  assert.equal(r.source, 'YouTube');
  assert.equal(r.oembed.title, 'Me at the zoo');
  assert.equal(r.oembed.html, '<iframe src="https://www.youtube.com/embed/jNQXAC9IVRw"></iframe>');
  assert.equal(r.pageRead, false);
});

test('a provider-only result marks page tags as not read, never missing', async () => {
  const { rows, cards } = buildPreview({ tags: [], pageRead: false, pageUrl: 'https://www.youtube.com/watch?v=x', oembed: { title: 'Me at the zoo', provider_name: 'YouTube', thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' } });
  const status = Object.fromEntries(rows.map((r) => [r.field, r.status]));
  assert.deepEqual(status, { title: 'fallback', description: 'not read', image: 'fallback', 'site name': 'fallback', 'x card': 'not read', 'x title': 'fallback' });
  assert.equal(cards.telegram.image, 'https://i.ytimg.com/vi/x/hqdefault.jpg');
});

test('when the provider fails, the message points to the bookmarklet, with no other request', async () => {
  const { impl, calls } = fakeFetch([['https://vimeo.com/api/oembed.json', json({}, 404)]]);
  await assert.rejects(lookupUrl('https://vimeo.com/76979871', impl), { code: 'no-oembed' });
  assert.equal(calls.length, 1);
});

test('unsafe oEmbed fields are dropped and html stays text', async () => {
  const { impl } = fakeFetch([['https://example.com/wp-json/oembed/', json({ type: 'rich', title: 'Post', thumbnail_url: 'javascript:alert(1)', author_url: 'https://example.com/author/', html: '<script>alert(1)</script>', evil: 'x' })]]);
  const r = await lookupUrl('https://example.com/post/', impl);
  assert.equal(r.oembed.thumbnail_url, undefined);
  assert.equal(r.oembed.author_url, 'https://example.com/author/');
  assert.equal(r.oembed.html, '<script>alert(1)</script>');
  assert.equal(r.oembed.evil, undefined);
});

test('pasted HTML is read with no network at all', () => {
  const r = lookupHtml('<meta property="og:title" content="Pasted"><link rel="alternate" type="application/json+oembed" href="https://example.com/o">');
  assert.equal(r.source, 'pasted HTML');
  assert.equal(tag(r, 'og:title'), 'Pasted');
  assert.equal(r.oembedNote, 'declared, not fetched');
  assert.throws(() => lookupHtml('   '), { code: 'empty-html' });
});

test('private, loopback, link-local and local names are refused before any lookup', () => {
  for (const input of ['http://localhost/', 'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://10.0.0.5/', 'http://172.16.0.1/', 'http://192.168.1.10/admin', 'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://printer.local/', 'http://intranet/']) {
    assert.equal(readPageUrl(input).error, 'private-url', input);
  }
  assert.equal(isPrivateHost('www.ivankristianto.com'), false);
  assert.equal(isPrivateHost('8.8.8.8'), false);
});

test('reads plain addresses and rejects junk', () => {
  assert.equal(readPageUrl('example.com/post').url, 'https://example.com/post');
  assert.equal(readPageUrl('').error, 'empty-url');
  assert.equal(readPageUrl('javascript:alert(1)').error, 'invalid-url');
  assert.equal(readPageUrl('https://user:pass@example.com/').error, 'invalid-url');
});
