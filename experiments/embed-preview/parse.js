// Reads pasted HTML and decides what each card shows. Everything here is pure text work: nothing is
// parsed into a DOM or run, and every string and URL is cleaned before the tool keeps it.

// Text and URL cleaning.

export const LIMITS = { short: 300, long: 1000, url: 2048 };

/** Strips control characters, collapses whitespace and cuts to max characters. */
export function clean(value, max = LIMITS.long) {
  if (value === null || value === undefined) return '';
  const text = String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Resolves value against base and returns it only if it is http(s), else null. */
export function safeUrl(value, base) {
  if (typeof value !== 'string' || !value.trim() || value.length > LIMITS.url) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// The head tags the cards read. Both the paste parser and the Microlink lookup return these names.

export const TAGS = [
  { name: 'title', selector: 'title', attr: 'text' },
  { name: 'description', selector: 'meta[name="description"]', attr: 'content' },
  { name: 'og:title', selector: 'meta[property="og:title"]', attr: 'content' },
  { name: 'og:description', selector: 'meta[property="og:description"]', attr: 'content' },
  { name: 'og:image', selector: 'meta[property="og:image"]', attr: 'content' },
  { name: 'og:image:width', selector: 'meta[property="og:image:width"]', attr: 'content' },
  { name: 'og:image:height', selector: 'meta[property="og:image:height"]', attr: 'content' },
  { name: 'og:image:alt', selector: 'meta[property="og:image:alt"]', attr: 'content' },
  { name: 'og:site_name', selector: 'meta[property="og:site_name"]', attr: 'content' },
  { name: 'og:url', selector: 'meta[property="og:url"]', attr: 'content' },
  { name: 'og:type', selector: 'meta[property="og:type"]', attr: 'content' },
  { name: 'twitter:card', selector: 'meta[name="twitter:card"]', attr: 'content' },
  { name: 'twitter:title', selector: 'meta[name="twitter:title"]', attr: 'content' },
  { name: 'twitter:description', selector: 'meta[name="twitter:description"]', attr: 'content' },
  { name: 'twitter:image', selector: 'meta[name="twitter:image"]', attr: 'content' },
  { name: 'twitter:site', selector: 'meta[name="twitter:site"]', attr: 'content' },
  { name: 'link icon', selector: 'link[rel~="icon"]', attr: 'href' },
  { name: 'link canonical', selector: 'link[rel="canonical"]', attr: 'href' },
  { name: 'link oembed', selector: 'link[type="application/json+oembed"]', attr: 'href' },
];

export const URL_TAGS = new Set(['og:image', 'og:url', 'twitter:image', 'link icon', 'link canonical', 'link oembed']);

// Pasted HTML.

const MAX_INPUT = 2_000_000;
const MAX_TAGS = 200;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (whole, ref) => {
    const lower = ref.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : lower.startsWith('#') ? parseInt(lower.slice(1), 10) : NaN;
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attributes(source) {
  const out = {};
  for (const m of source.matchAll(ATTR)) {
    const key = m[1].toLowerCase();
    if (!(key in out)) out[key] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

// Comments, scripts and styles can hold text that looks like tags; drop them before reading.
function strip(html) {
  return html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<(script|style|template|noscript|textarea)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ');
}

function linkName(attrs) {
  const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
  const type = (attrs.type || '').toLowerCase();
  if (rel.includes('alternate') && type === 'application/json+oembed') return 'link oembed';
  if (rel.includes('canonical')) return 'link canonical';
  if (rel.includes('icon')) return 'link icon';
  return null;
}

/** Returns the head tags in page order as [name, value] pairs, the same names Microlink returns. */
export function parseHtml(input) {
  const html = strip(String(input || '').slice(0, MAX_INPUT));
  const tags = [];
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (title) tags.push(['title', clean(decode(title[1].replace(/<[^>]*>/g, ' ')), LIMITS.short)]);
  for (const m of html.matchAll(/<(meta|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    if (tags.length >= MAX_TAGS) break;
    const attrs = attributes(m[2]);
    const name = m[1].toLowerCase() === 'meta' ? (attrs.property || attrs.name || '').toLowerCase().trim() : linkName(attrs);
    const value = m[1].toLowerCase() === 'meta' ? attrs.content : attrs.href;
    if (!name || value === undefined) continue;
    tags.push([clean(name, 80), clean(value, URL_TAGS.has(name) ? LIMITS.url : LIMITS.long)]);
  }
  return tags.filter(([, value]) => value);
}

// Field selection: X reads twitter:* first and falls back to og:*, Slack and Telegram read og:* first.

function first(map, names) {
  for (const name of names) if (map.has(name)) return { value: map.get(name), from: name };
  return null;
}

/** Builds { cards, rows } from tags ([name, value] pairs), an optional oEmbed object and the page URL. */
export function buildPreview({ tags = [], oembed = null, pageUrl = '', pageRead = true }) {
  const map = new Map();
  for (const [name, value] of tags) if (value && !map.has(name)) map.set(name, value);
  if (oembed) {
    // oEmbed fills gaps only; the page's own tags win.
    const add = (name, value) => value && !map.has(name) && map.set(name, value);
    add('oembed title', oembed.title);
    add('oembed provider_name', oembed.provider_name);
    add('oembed author_name', oembed.author_name);
    add('oembed thumbnail_url', oembed.thumbnail_url);
  }
  const base = safeUrl(map.get('og:url'), pageUrl) || safeUrl(map.get('link canonical'), pageUrl) || safeUrl(pageUrl) || undefined;
  const host = base ? new URL(base).hostname.replace(/^www\./, '') : '';
  const pickUrl = (names) => {
    for (const name of names) {
      const href = safeUrl(map.get(name), base);
      if (href) return { value: href, from: name };
    }
    return null;
  };

  const title = first(map, ['og:title', 'title', 'oembed title']);
  const description = first(map, ['og:description', 'description']);
  const image = pickUrl(['og:image', 'oembed thumbnail_url']);
  const site = first(map, ['og:site_name', 'oembed provider_name']);
  const xTitle = first(map, ['twitter:title', 'og:title', 'title', 'oembed title']);
  const xDescription = first(map, ['twitter:description', 'og:description', 'description']);
  const xImage = pickUrl(['twitter:image', 'og:image', 'oembed thumbnail_url']);
  const xCard = first(map, ['twitter:card']);
  const size = [map.get('og:image:width'), map.get('og:image:height')].every((n) => /^\d+$/.test(n || ''))
    ? `${map.get('og:image:width')} × ${map.get('og:image:height')}` : '';

  const row = (field, pick, want, note = '') => ({ field, pick, want, note, status: !pick ? (pageRead ? 'missing' : 'not read') : pick.from === want ? 'found' : 'fallback' });
  const rows = [
    row('title', title, 'og:title'),
    row('description', description, 'og:description'),
    row('image', image, 'og:image', size),
    row('site name', site, 'og:site_name'),
    row('x card', xCard, 'twitter:card'),
    row('x title', xTitle, 'twitter:title'),
  ];

  const alt = map.get('og:image:alt') || '';
  const cards = {
    url: base || pageUrl,
    host,
    telegram: { site: site?.value || '', title: title?.value || host, description: description?.value || '', image: image?.value || '', alt },
    slack: { site: site?.value || host, title: title?.value || host, description: description?.value || '', image: image?.value || '', alt },
    x: {
      // X shows a summary card when twitter:card is missing or not the large one.
      large: xCard?.value === 'summary_large_image' && Boolean(xImage),
      title: xTitle?.value || host,
      description: xDescription?.value || '',
      image: xImage?.value || '',
      alt,
    },
  };
  return { cards, rows };
}

/** Counts for the fields summary line. */
export function summarize(rows) {
  const count = (s) => rows.filter((r) => r.status === s).length;
  return { found: count('found'), fallback: count('fallback'), missing: count('missing'), 'not read': count('not read') };
}
