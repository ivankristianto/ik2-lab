// Wires the form, the paste section and the result together, and reports height to the entry page.
import { lookupHtml, lookupUrl } from './lookup.js';
import { messageFor, PASTE_HELPS } from './messages.js';
import { clearResult, renderResult } from './render.js';
import { SAMPLE } from './sample.js';

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

$('url-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = $('url-submit');
  button.disabled = true;
  $('note').textContent = 'looking up';
  showError($('url-error'), $('url'), null);
  try {
    show(await lookupUrl($('url').value));
  } catch (error) {
    clearResult(dom);
    $('note').textContent = 'nothing read yet';
    showError($('url-error'), $('url'), error);
    // When the lookup can't help, the paste section is the way forward.
    if (PASTE_HELPS.has(error.code)) $('paste').open = true;
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

show(SAMPLE);

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
