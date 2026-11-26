import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml } from '../parse.js';
import { buildPreview } from '../fields.js';

const get = (tags, name) => tags.find(([n]) => n === name)?.[1];

test('reads title, Open Graph, X and link tags from a pasted head', () => {
  const tags = parseHtml(`<!doctype html><html><head>
    <title>Font split inspector - Ivan Kristianto</title>
    <meta property="og:title" content="Font split inspector">
    <meta property='og:description' content='Paste rules &amp; text'>
    <meta property=og:image content=https://example.com/card.png>
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" href="/favicon.svg">
    <link rel="alternate" type="application/json+oembed" href="https://example.com/wp-json/oembed/1.0/embed?url=x">
  </head><body><p>body</p></body></html>`);
  assert.equal(get(tags, 'title'), 'Font split inspector - Ivan Kristianto');
  assert.equal(get(tags, 'og:title'), 'Font split inspector');
  assert.equal(get(tags, 'og:description'), 'Paste rules & text');
  assert.equal(get(tags, 'og:image'), 'https://example.com/card.png');
  assert.equal(get(tags, 'twitter:card'), 'summary_large_image');
  assert.equal(get(tags, 'link icon'), '/favicon.svg');
  assert.match(get(tags, 'link oembed'), /oembed/);
});

test('keeps attribute values that contain > and decodes numeric entities', () => {
  const tags = parseHtml('<meta name="description" content="a > b &#8212; &#x41;">');
  assert.equal(get(tags, 'description'), 'a > b \u2014 A');
});

test('a page with only a title leaves the other fields missing', () => {
  const tags = parseHtml('<html><head><title>Example Domain</title></head></html>');
  const { rows } = buildPreview({ tags, pageUrl: 'https://example.com/' });
  const status = Object.fromEntries(rows.map((r) => [r.field, r.status]));
  assert.deepEqual(status, { title: 'fallback', description: 'missing', image: 'missing', 'site name': 'missing', 'x card': 'missing', 'x title': 'fallback' });
});

test('empty or junk input gives no tags and no throw', () => {
  assert.deepEqual(parseHtml(''), []);
  assert.deepEqual(parseHtml(null), []);
  assert.deepEqual(parseHtml('<meta'), []);
  assert.deepEqual(parseHtml('<meta content="unclosed'), []);
});

test('ignores tags written inside scripts, styles, comments and textareas', () => {
  const tags = parseHtml(`
    <script>document.write('<meta property="og:title" content="from script">')</script>
    <style>/* <meta property="og:title" content="from style"> */</style>
    <!-- <meta property="og:title" content="from comment"> -->
    <textarea><meta property="og:title" content="from textarea"></textarea>
    <meta property="og:title" content="real">`);
  assert.deepEqual(tags.filter(([n]) => n === 'og:title'), [['og:title', 'real']]);
});

test('script tags and handlers in values stay inert text', () => {
  const tags = parseHtml('<title><script>alert(1)</script>Hi</title><meta property="og:title" content="&lt;img src=x onerror=alert(1)&gt;">');
  assert.equal(get(tags, 'title'), 'Hi');
  assert.equal(get(tags, 'og:title'), '<img src=x onerror=alert(1)>');
});

test('javascript: and data: URLs never reach a card', () => {
  const tags = parseHtml(`
    <meta property="og:image" content="javascript:alert(1)">
    <meta name="twitter:image" content="data:image/svg+xml,<svg onload=alert(1)>">
    <meta property="og:url" content="javascript:alert(document.domain)">`);
  const { cards, rows } = buildPreview({ tags, pageUrl: 'https://example.com/' });
  assert.equal(cards.telegram.image, '');
  assert.equal(cards.x.image, '');
  assert.equal(cards.url, 'https://example.com/');
  assert.equal(rows.find((r) => r.field === 'image').status, 'missing');
});

test('relative image paths resolve against the page address', () => {
  const tags = parseHtml('<meta property="og:image" content="/img/card.png">');
  const { cards } = buildPreview({ tags, pageUrl: 'https://example.com/post/' });
  assert.equal(cards.slack.image, 'https://example.com/img/card.png');
});

test('control characters are stripped and long values cut', () => {
  const tags = parseHtml(`<meta property="og:title" content="a\u0000b\u202ec">${`<meta name="description" content="${'x'.repeat(5000)}">`}`);
  assert.equal(get(tags, 'og:title'), 'a b c');
  assert.ok(get(tags, 'description').length <= 1000);
});
