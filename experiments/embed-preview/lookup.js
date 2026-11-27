// Turns each input into a result: an address (asked over oEmbed from the browser), pasted HTML and
// the bookmarklet's fragment (both read with no network at all).
import { clean, LIMITS, parseHtml, safeUrl, TAGS, URL_TAGS } from './parse.js';

// Address guard: a public page can't fetch from these hosts, so the tool doesn't try.

const PRIVATE_V4 = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0000000, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xe0000000, 3],
];

function ipv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) < 256)) return null;
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}

/** True for loopback, private, link-local and local names. */
export function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host.includes('.') && !host.includes(':')) return true;
  if (/(^|\.)(localhost|local|internal|lan|home\.arpa)$/.test(host)) return true;
  const v4 = ipv4(host);
  if (v4 !== null) return PRIVATE_V4.some(([net, bits]) => (v4 >>> (32 - bits)) === (net >>> (32 - bits)));
  if (host.includes(':')) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (mapped) return isPrivateHost(mapped[1]);
    // The URL parser rewrites ::ffff:127.0.0.1 as ::ffff:7f00:1.
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (hex) {
      const n = parseInt(hex[1], 16) * 65536 + parseInt(hex[2], 16);
      return isPrivateHost([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
    return host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || /^ff/.test(host);
  }
  return false;
}

/** Reads what the visitor typed. Returns { url } or { error } with a code from MESSAGES. */
export function readPageUrl(input) {
  const text = String(input || '').trim();
  if (!text) return { error: 'empty-url' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  const href = safeUrl(withScheme);
  if (!href) return { error: 'invalid-url' };
  const url = new URL(href);
  if (url.username || url.password) return { error: 'invalid-url' };
  if (isPrivateHost(url.hostname)) return { error: 'private-url' };
  return { url: href };
}

// What the visitor reads when a lookup fails. Each says what happened and what to do next.

export const MESSAGES = {
  'empty-url': 'Paste a page address first, such as https://example.com/post/.',
  'invalid-url': "That doesn't look like a web address. Paste the full URL, starting with https://.",
  'private-url': "That address is on a private network. Run the bookmarklet on the page, or paste its HTML below.",
  'no-oembed': "That site doesn't let other pages read it. Run the bookmarklet on the page, or paste its HTML below.",
  'bad-fragment': "The bookmarklet's data was damaged or too long. Run it again, or paste the page's HTML below.",
  'empty-html': 'Paste the page source first: open the page, view its source, copy all of it and paste it here.',
};

/** Codes where the paste section opens, since pasting is the way forward. */
export const PASTE_HELPS = new Set(['private-url', 'no-oembed', 'bad-fragment']);

export const messageFor = (error) => MESSAGES[error?.code] || MESSAGES['no-oembed'];

// oEmbed from providers whose endpoints answer a browser (checked from Chrome on 2026-11-26).

export const PROVIDERS = [
  { name: 'YouTube', hosts: /(^|\.)(youtube\.com|youtu\.be)$/, endpoint: 'https://www.youtube.com/oembed?format=json&url=' },
  { name: 'Vimeo', hosts: /(^|\.)vimeo\.com$/, endpoint: 'https://vimeo.com/api/oembed.json?url=' },
  { name: 'X', hosts: /(^|\.)(x\.com|twitter\.com)$/, endpoint: 'https://publish.twitter.com/oembed?url=' },
  { name: 'SoundCloud', hosts: /(^|\.)soundcloud\.com$/, endpoint: 'https://soundcloud.com/oembed?format=json&url=' },
  { name: 'Spotify', hosts: /^open\.spotify\.com$/, endpoint: 'https://open.spotify.com/oembed?url=' },
  { name: 'TikTok', hosts: /(^|\.)tiktok\.com$/, endpoint: 'https://www.tiktok.com/oembed?url=' },
  { name: 'Bluesky', hosts: /^bsky\.app$/, endpoint: 'https://embed.bsky.app/oembed?url=' },
];

/** The provider's oEmbed endpoint for pageUrl, or null when it isn't one of the providers above. */
export function providerEndpoint(pageUrl) {
  const host = new URL(pageUrl).hostname.toLowerCase();
  const provider = PROVIDERS.find((p) => p.hosts.test(host));
  return provider ? { name: provider.name, endpoint: provider.endpoint + encodeURIComponent(pageUrl) } : null;
}

/** WordPress's own oEmbed route on the page's host. Only works where WordPress sits at the root. */
export const wordpressEndpoint = (pageUrl) => `${new URL(pageUrl).origin}/wp-json/oembed/1.0/embed?url=${encodeURIComponent(pageUrl)}`;

const KEEP = ['type', 'version', 'title', 'author_name', 'author_url', 'provider_name', 'provider_url', 'thumbnail_url', 'thumbnail_width', 'thumbnail_height', 'width', 'height', 'html'];

/** Keeps the known oEmbed fields as cleaned text; URLs only if http(s). html stays text and is never rendered. */
export function cleanOembed(json) {
  if (!json || typeof json !== 'object') return null;
  const out = {};
  for (const key of KEEP) {
    if (json[key] === undefined || json[key] === null) continue;
    if (key.endsWith('_url')) {
      const href = safeUrl(String(json[key]));
      if (href) out[key] = href;
    } else {
      out[key] = clean(json[key], key === 'html' ? 2000 : LIMITS.short);
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Fetches an oEmbed endpoint. Throws Error('oembed-failed') when it can't be read from the page. */
export async function fetchOembed(endpoint, fetchImpl = fetch) {
  const href = safeUrl(endpoint);
  if (!href) throw new Error('oembed-failed');
  let res;
  try {
    res = await fetchImpl(href, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error('oembed-failed');
  }
  if (!res.ok) throw new Error('oembed-failed');
  const data = cleanOembed(await res.json().catch(() => null));
  if (!data) throw new Error('oembed-failed');
  return data;
}

export class LookupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Returns { source, pageUrl, tags, pageRead, oembed, oembedNote } or throws LookupError. */
export async function lookupUrl(input, fetchImpl = fetch) {
  const { url, error } = readPageUrl(input);
  if (error) throw new LookupError(error);
  // Any other address gets one try as a WordPress post: its REST API answers browsers on other origins.
  const { name, endpoint } = providerEndpoint(url) || { name: 'WordPress', endpoint: wordpressEndpoint(url) };
  try {
    const oembed = await fetchOembed(endpoint, fetchImpl);
    // Only oEmbed was asked, so the page's own tags are unknown, not missing.
    return { source: name, pageUrl: url, tags: [], pageRead: false, oembed, oembedNote: `from ${name}` };
  } catch {
    throw new LookupError('no-oembed');
  }
}

/** Reads pasted HTML. No network: a declared oEmbed link is listed, never fetched. */
export function lookupHtml(html) {
  if (!String(html || '').trim()) throw new LookupError('empty-html');
  const tags = parseHtml(html);
  return { source: 'pasted HTML', pageUrl: '', tags, oembed: null, oembedNote: declaredNote(tags) };
}

const declaredNote = (tags) => (tags.some(([name]) => name === 'link oembed') ? 'declared, not fetched' : 'not declared');

// The bookmarklet. collect() runs on the visitor's page, so it may only use what's in its arguments.
// The fragment never reaches a server, and noreferrer keeps that page's address out of the request.

function collect(tool, tags) {
  const data = new URLSearchParams({ url: location.href });
  for (const [name, selector, attr] of tags) {
    const node = document.querySelector(selector);
    const value = node && (attr === 'text' ? node.textContent : node.getAttribute(attr));
    if (value && value.trim()) data.append(name, value.trim().slice(0, 2000));
  }
  open(`${tool}#${data}`, '_blank', 'noopener,noreferrer');
}

/** The javascript: link to drag to the bookmarks bar. tool is this page's address without a fragment. */
export function bookmarklet(tool) {
  const tags = TAGS.map((t) => [t.name, t.selector, t.attr]);
  return `javascript:${encodeURIComponent(`(${collect})(${JSON.stringify(tool)},${JSON.stringify(tags)})`)}`;
}

const MAX_FRAGMENT = 50_000;
const TAG_NAMES = new Set(TAGS.map((t) => t.name));

/** Reads the bookmarklet's fragment as untrusted text. Returns null when there is none; throws on junk. */
export function lookupFragment(hash) {
  const text = String(hash || '').replace(/^#/, '');
  if (!text) return null;
  if (text.length > MAX_FRAGMENT) throw new LookupError('bad-fragment');
  const data = new URLSearchParams(text);
  const pageUrl = safeUrl(data.get('url'));
  if (!pageUrl) throw new LookupError('bad-fragment');
  const seen = new Map();
  for (const [name, value] of data) {
    if (!TAG_NAMES.has(name) || seen.has(name)) continue;
    const kept = URL_TAGS.has(name) ? safeUrl(value, pageUrl) : clean(value, name === 'title' ? LIMITS.short : LIMITS.long);
    if (kept) seen.set(name, kept);
  }
  const tags = [...seen];
  return { source: 'bookmarklet', pageUrl, tags, oembed: null, oembedNote: declaredNote(tags) };
}
