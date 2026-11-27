import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { bookmarklet, lookupFragment } from '../lookup.js';

const TOOL = 'https://lab.ivankristianto.com/experiments/embed-preview/';
const tag = (r, name) => r.tags.find(([n]) => n === name)?.[1];
const hash = (pairs) => `#${new URLSearchParams(pairs)}`;

// Runs the real bookmarklet against a stand-in page and returns the address it opens.
function runBookmarklet(pageUrl, elements) {
  let opened = null;
  const document = { querySelector: (selector) => elements[selector] || null };
  const open = (url, target, features) => { opened = { url, target, features }; };
  vm.runInNewContext(decodeURIComponent(bookmarklet(TOOL).slice('javascript:'.length)), { document, location: { href: pageUrl }, open, URLSearchParams });
  return opened;
}

test('the bookmarklet sends the page tags in the fragment, and the tool reads them back', () => {
  const opened = runBookmarklet('https://example.com/post/', {
    title: { textContent: '  A post  ' },
    'meta[property="og:title"]': { getAttribute: () => 'A post & more' },
    'meta[property="og:image"]': { getAttribute: () => '/card.png' },
    'link[rel~="icon"]': { getAttribute: () => '/favicon.ico' },
  });
  assert.equal(opened.target, '_blank');
  assert.equal(opened.features, 'noopener,noreferrer');
  const url = new URL(opened.url);
  assert.equal(url.origin + url.pathname, TOOL);
  assert.equal(url.search, '');
  const r = lookupFragment(url.hash);
  assert.equal(r.source, 'bookmarklet');
  assert.equal(r.pageUrl, 'https://example.com/post/');
  assert.equal(tag(r, 'title'), 'A post');
  assert.equal(tag(r, 'og:title'), 'A post & more');
  assert.equal(tag(r, 'og:image'), 'https://example.com/card.png');
  assert.equal(tag(r, 'link icon'), 'https://example.com/favicon.ico');
  assert.equal(r.oembedNote, 'not declared');
});

test('good tags come back cleaned, unknown names are ignored and an oEmbed link is listed, not fetched', () => {
  const r = lookupFragment(hash([
    ['url', 'https://example.com/post/'],
    ['og:title', 'Line one\nline\u0000two'],
    ['og:title', 'second og:title is ignored'],
    ['onload', 'alert(1)'],
    ['link oembed', 'https://example.com/wp-json/oembed/1.0/embed?url=x'],
  ]));
  assert.equal(tag(r, 'og:title'), 'Line one line two');
  assert.equal(r.tags.length, 2);
  assert.equal(tag(r, 'onload'), undefined);
  assert.equal(r.oembed, null);
  assert.equal(r.oembedNote, 'declared, not fetched');
});

test('javascript: and data: URLs are dropped, from tags and as the page address', () => {
  const r = lookupFragment(hash([
    ['url', 'https://example.com/'],
    ['og:image', 'javascript:alert(1)'],
    ['twitter:image', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['link canonical', ' JavaScript:alert(1)'],
    ['og:title', 'kept'],
  ]));
  assert.deepEqual(r.tags, [['og:title', 'kept']]);
  assert.throws(() => lookupFragment(hash([['url', 'javascript:alert(1)'], ['og:title', 'x']])), { code: 'bad-fragment' });
});

test('oversized and malformed fragments are refused, an empty one is no fragment', () => {
  assert.throws(() => lookupFragment(hash([['url', 'https://example.com/'], ['og:title', 'a'.repeat(60_000)]])), { code: 'bad-fragment' });
  assert.throws(() => lookupFragment('#%E0%A4%A'), { code: 'bad-fragment' });
  assert.throws(() => lookupFragment('#og:title=no+address'), { code: 'bad-fragment' });
  assert.equal(lookupFragment(''), null);
  assert.equal(lookupFragment('#'), null);
});

test('long values are cut to the same limits as pasted HTML', () => {
  const r = lookupFragment(hash([['url', 'https://example.com/'], ['title', 't'.repeat(5000)], ['og:description', 'd'.repeat(5000)]]));
  assert.equal(tag(r, 'title').length, 300);
  assert.equal(tag(r, 'og:description').length, 1000);
});
