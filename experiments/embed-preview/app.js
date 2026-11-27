// Wires the form, the paste section and the result together, and reports height to the entry page.
import { bookmarklet, lookupFragment, lookupHtml, lookupUrl, messageFor, PASTE_HELPS } from './lookup.js';
import { clearResult, renderResult } from './render.js';

// The result shown on first paint when there is no fragment: my font split entry's head tags as read on 2026-11-26.
const ENTRY = 'https://www.ivankristianto.com/lab/font-split-inspector/';
const TITLE = 'Font split inspector - Ivan Kristianto';
const DESCRIPTION = 'Paste @font-face rules and sample text, see which font file draws each character.';

const SAMPLE = {
  source: 'saved sample',
  pageUrl: ENTRY,
  oembed: null,
  oembedNote: 'not declared',
  tags: [
    ['title', TITLE],
    ['og:type', 'article'],
    ['og:title', TITLE],
    ['og:description', DESCRIPTION],
    ['og:url', ENTRY],
    ['og:site_name', 'Ivan Kristianto'],
    ['og:image', 'https://www.ivankristianto.com/wp-content/themes/ik2/assets/images/social-card.png'],
    ['og:image:width', '2400'],
    ['og:image:height', '1260'],
    ['twitter:card', 'summary_large_image'],
    ['twitter:site', '@ivankrisdotcom'],
    ['link icon', 'https://www.ivankristianto.com/wp-content/themes/ik2/assets/favicon/favicon.svg'],
    ['link canonical', ENTRY],
  ],
};

const $ = (id) => document.getElementById(id);
const dom = Object.fromEntries([...document.querySelectorAll('[data-ref]')].map((n) => [n.dataset.ref, n]));
const NOTE = 'approximations, not screenshots';

function showError(box, field, error) {
  box.textContent = error ? messageFor(error) : '';
  box.hidden = !error;
  if (error) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  const ids = field.getAttribute('aria-describedby').split(' ').filter((id) => id !== box.id);
  field.setAttribute('aria-describedby', (error ? [...ids, box.id] : ids).join(' '));
}

function show(result) {
  renderResult(dom, result);
  $('note').textContent = NOTE;
}

function fail(box, field, error) {
  clearResult(dom);
  $('note').textContent = 'nothing read yet';
  showError(box, field, error);
  // When the lookup can't help, the paste section is the way forward.
  if (PASTE_HELPS.has(error.code)) $('paste').open = true;
}

$('url-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = $('url-submit');
  button.disabled = true;
  $('note').textContent = 'looking up';
  showError($('url-error'), $('url'), null);
  try {
    show(await lookupUrl($('url').value));
  } catch (error) {
    fail($('url-error'), $('url'), error);
  } finally {
    button.disabled = false;
  }
});

function readPaste() {
  showError($('html-error'), $('html'), null);
  try {
    show(lookupHtml($('html').value));
    showError($('url-error'), $('url'), null);
  } catch (error) {
    showError($('html-error'), $('html'), error);
  }
}

$('paste-form').addEventListener('submit', (e) => { e.preventDefault(); readPaste(); });
// Enter adds a line in a textarea, so Ctrl+Enter or Cmd+Enter reads the HTML.
$('html').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); readPaste(); }
});

const link = $('bookmarklet');
link.href = bookmarklet(location.origin + location.pathname);
// Clicked here, it would only read this page. It is meant to be dragged to the bookmarks bar.
link.addEventListener('click', (e) => e.preventDefault());

try {
  const result = lookupFragment(location.hash);
  if (result) $('url').value = result.pageUrl;
  show(result || SAMPLE);
} catch (error) {
  fail($('url-error'), $('url'), error);
}

// The entry's iframe sends its origin as the referrer. A checkout served from localhost talks to the ik2 dev stack.
const SITE_ORIGINS = ['https://www.ivankristianto.com', 'http://localhost:8080'];
const siteOrigin = (() => {
  try {
    const from = new URL(document.referrer).origin;
    if (SITE_ORIGINS.includes(from)) return from;
  } catch {}
  return ['localhost', '127.0.0.1'].includes(location.hostname) ? SITE_ORIGINS[1] : SITE_ORIGINS[0];
})();
for (const a of document.querySelectorAll('a[data-site-link]')) a.href = siteOrigin + new URL(a.href).pathname;

if (window.top !== window) {
  const report = () => parent.postMessage({ type: 'ik2-lab:resize', height: Math.ceil(document.body.getBoundingClientRect().height) }, siteOrigin);
  new ResizeObserver(report).observe(document.body);
}
