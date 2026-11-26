// Reads meta, link and title tags from pasted HTML as plain text. Nothing is parsed into a DOM
// or run, so a pasted script stays a string.
import { clean, LIMITS } from './text.js';
import { URL_TAGS } from './tags.js';

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
