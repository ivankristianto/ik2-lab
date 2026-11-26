// Draws the cards and the detail tables. Page text only ever reaches the DOM through textContent,
// and an image only through an http(s) src with no referrer.
import { buildPreview, summarize } from './fields.js';
import { safeUrl } from './url.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== '') node.textContent = text;
  return node;
}

function image(src, alt) {
  const href = safeUrl(src);
  if (!href) return null;
  const img = el('img', 'ep-img');
  img.alt = alt || '';
  img.width = 800;
  img.height = 420;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.replaceWith(el('div', 'ep-img ep-img--none', "image didn't load")), { once: true });
  img.src = href;
  return img;
}

const card = (name, body) => {
  const article = el('article', 'ep-card');
  article.append(el('p', 'ep-card__head lab-label', name), body);
  return article;
};

function telegram(c, url) {
  const box = el('div', 'ep-tg');
  const preview = el('div', 'ep-tg__preview');
  preview.append(...[
    c.site && el('p', 'ep-tg__site', c.site),
    el('p', 'ep-tg__title', c.title),
    c.description && el('p', 'ep-clamp-3', c.description),
    image(c.image, c.alt),
  ].filter(Boolean));
  box.append(el('p', 'ep-url', url), preview);
  return card('telegram', box);
}

function slack(c, url) {
  const box = el('div', 'ep-sl');
  const line = el('p');
  line.append(el('span', 'ep-sl__name', 'you'), ' ', el('span', 'ep-url', url));
  const unfurl = el('div', 'ep-sl__unfurl');
  const site = el('p', 'ep-sl__site');
  const favicon = el('span', 'ep-sl__favicon');
  favicon.setAttribute('aria-hidden', 'true');
  site.append(favicon, c.site);
  unfurl.append(...[site, el('p', 'ep-sl__title', c.title), c.description && el('p', 'ep-clamp-3', c.description), image(c.image, c.alt)].filter(Boolean));
  const avatar = el('span', 'ep-sl__avatar');
  avatar.setAttribute('aria-hidden', 'true');
  box.append(avatar, line, unfurl);
  return card('slack', box);
}

function x(c, host) {
  const box = el('div', 'ep-x');
  if (c.large) {
    const media = el('div', 'ep-x__media');
    media.append(image(c.image, c.alt), el('span', 'ep-x__badge', c.title));
    box.append(media, el('p', 'ep-x__from', `From ${host}`));
  } else {
    const row = el('div', 'ep-x__summary');
    const text = el('div', 'ep-x__summary-text');
    text.append(el('p', 'ep-x__from', host), el('p', 'ep-clamp-2', c.title));
    row.append(image(c.image, c.alt) || el('div', 'ep-img ep-img--none', 'no image'), text);
    box.append(row);
  }
  return card('x', box);
}

const fileName = (href) => new URL(href).pathname.split('/').filter(Boolean).pop() || href;

function fieldRow(r) {
  const tr = el('tr');
  const value = !r.pick ? 'none' : r.field === 'image' ? [fileName(r.pick.value), r.note].filter(Boolean).join(', ') : r.pick.value;
  const valueCell = el('td', '', value);
  if (r.field === 'image' && r.pick) valueCell.title = r.pick.value;
  const status = el('span', `lab-status lab-status--${r.status === 'found' ? 'ok' : 'warn'}`, r.status);
  const statusCell = el('td', 'ep-key');
  statusCell.append(status);
  const from = !r.pick ? `no ${r.want}` : r.status === 'fallback' ? `${r.pick.from}, no ${r.want}` : r.pick.from;
  tr.append(el('td', 'ep-key', r.field), valueCell, el('td', 'ep-text', from), statusCell);
  return tr;
}

function rowsOf(tbody, rows) {
  tbody.replaceChildren(...rows.map((cells) => {
    const tr = el('tr');
    tr.append(...cells.map(([text, cls]) => el('td', cls || '', text)));
    return tr;
  }));
}

const OEMBED_NOTES = {
  'not declared': 'This page has no oEmbed link, so the cards use its meta tags.',
  'not reported': "Microlink didn't report an oEmbed link. Paste the page's HTML to check whether it declares one.",
  'declared, not fetched': "The page declares an oEmbed link. Pasted HTML stays in your browser, so I didn't fetch it.",
  'declared, not readable here': "The page declares an oEmbed link, but its provider doesn't let a browser read it, so the cards use the page tags.",
};

/** Empties the result area after a failed lookup, so old cards never pass for the new address. */
export function clearResult(dom) {
  dom.cards.replaceChildren();
  dom.cards.hidden = true;
  dom.mores.hidden = true;
}

/** Fills the result area. dom holds the elements index.html marks with data-ref. */
export function renderResult(dom, result) {
  const { cards, rows } = buildPreview(result);
  dom.cards.hidden = false;
  dom.mores.hidden = false;
  dom.cards.replaceChildren(telegram(cards.telegram, cards.url), slack(cards.slack, cards.url), x(cards.x, cards.host));

  const counts = summarize(rows);
  dom.fieldsCount.textContent = ['found', 'fallback', 'missing'].filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`).join(' · ');
  dom.fieldsBody.replaceChildren(...rows.map(fieldRow));

  dom.rawCount.textContent = `${result.tags.length} · ${result.source}`;
  rowsOf(dom.rawBody, result.tags.map(([name, value]) => [[name, 'ep-key'], [value]]));
  dom.rawEmpty.hidden = result.tags.length > 0;

  dom.oembedCount.textContent = result.oembedNote;
  dom.oembedNote.textContent = OEMBED_NOTES[result.oembedNote] || "The provider's oEmbed answer, as text. Its html is shown, never run.";
  dom.oembedTable.hidden = !result.oembed;
  rowsOf(dom.oembedBody, Object.entries(result.oembed || {}).map(([key, value]) => [[key, 'ep-key'], [String(value)]]));
}
