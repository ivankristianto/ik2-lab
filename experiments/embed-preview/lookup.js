// Looks up a page address: refuses private hosts, asks a known provider's oEmbed, else Microlink.
// Pasted HTML is handled here too, with no network at all.
import { clean, LIMITS, parseHtml, safeUrl, TAGS, URL_TAGS } from './parse.js';

// Address guard: a public reader can't reach these hosts, and their names shouldn't leave the browser.

const PRIVATE_V4 = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0000000, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xe0000000, 3],
];

function ipv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) < 256)) return null;
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}

/** True for hosts a public reader can't or shouldn't reach: loopback, private, link-local, local names. */
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
  'private-url': "That address is on a private network, so Microlink can't open it. Paste the page's HTML below instead.",
  'rate-limited': "You've used today's free Microlink lookups. Paste the page's HTML below instead; that has no limit.",
  busy: 'Microlink is still busy with your last lookup. Wait a second, then press Preview again.',
  blocked: "That site blocks automated readers like Microlink. Paste the page's HTML below instead.",
  unreachable: "The site didn't answer Microlink in time. Try again, or paste the page's HTML below.",
  network: "I couldn't reach Microlink. Check your connection, or paste the page's HTML below.",
  failed: "Microlink couldn't read that page. Paste the page's HTML below instead.",
  'empty-html': 'Paste the page source first: open the page, view its source, copy all of it and paste it here.',
};

/** Codes where the paste section opens, since pasting is the way forward. */
export const PASTE_HELPS = new Set(['private-url', 'rate-limited', 'blocked', 'unreachable', 'network', 'failed']);

export function messageFor(error) {
  const text = MESSAGES[error?.code] || MESSAGES.failed;
  return error?.detail ? `${text} (${error.detail})` : text;
}

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

// Microlink's free endpoint, asked for the exact head tags in TAGS rather than its merged summary.

export const MICROLINK = 'https://api.microlink.io/';

/** The request URL: meta=false skips Microlink's own extraction, data.* rules read each tag. */
export function microlinkUrl(pageUrl) {
  const params = new URLSearchParams({ url: pageUrl, meta: 'false' });
  TAGS.forEach((tag, i) => {
    params.set(`data.t${i}.selector`, tag.selector);
    params.set(`data.t${i}.attr`, tag.attr);
  });
  return `${MICROLINK}?${params}`;
}

// Microlink's error codes, mapped to the tool's messages (microlink.io/docs/api/basics/error-codes).
const CODES = {
  ERATE: 'rate-limited',
  ECONCURRENCY: 'busy',
  EFORBIDDENURL: 'private-url',
  EPROXYNEEDED: 'blocked',
  EUNREACHABLE: 'unreachable',
  ETIMEOUT: 'unreachable',
  EBRWSRTIMEOUT: 'unreachable',
  EINVALURL: 'invalid-url',
};

export class LookupError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

/** Looks up pageUrl. Returns { tags, finalUrl }; throws LookupError with a code from MESSAGES. */
export async function fetchTags(pageUrl, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(microlinkUrl(pageUrl), { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) });
  } catch {
    throw new LookupError('network');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status !== 'success') {
    const code = typeof body?.code === 'string' ? body.code : '';
    if (CODES[code]) throw new LookupError(CODES[code]);
    throw new LookupError(res.status === 429 ? 'rate-limited' : 'failed', clean(code || `HTTP ${res.status}`, 40));
  }
  const data = body.data || {};
  const tags = [];
  TAGS.forEach((tag, i) => {
    const value = data[`t${i}`];
    if (typeof value !== 'string') return;
    const text = clean(value, URL_TAGS.has(tag.name) ? LIMITS.url : tag.name === 'title' ? LIMITS.short : LIMITS.long);
    if (text) tags.push([tag.name, text]);
  });
  return { tags, finalUrl: typeof data.url === 'string' ? data.url : pageUrl };
}

// The lookup flow.

/** Returns { source, pageUrl, tags, oembed, oembedNote } or throws LookupError. */
export async function lookupUrl(input, fetchImpl = fetch) {
  const { url, error } = readPageUrl(input);
  if (error) throw new LookupError(error);
  const provider = providerEndpoint(url);
  if (provider) {
    try {
      const oembed = await fetchOembed(provider.endpoint, fetchImpl);
      // Only the provider was asked, so the page's own tags are unknown, not missing.
      return { source: provider.name, pageUrl: url, tags: [], pageRead: false, oembed, oembedNote: `from ${provider.name}` };
    } catch {
      // The provider didn't answer; Microlink can still read the page tags.
    }
  }
  const { tags, finalUrl } = await fetchTags(url, fetchImpl);
  const pageUrl = safeUrl(finalUrl) || url;
  const declared = safeUrl(tags.find(([name]) => name === 'link oembed')?.[1], pageUrl);
  // Microlink often leaves out oEmbed links (it did for a WordPress post that declares one), so no link isn't proof.
  if (!declared) return { source: 'Microlink', pageUrl, tags, oembed: null, oembedNote: 'not reported' };
  try {
    return { source: 'Microlink', pageUrl, tags, oembed: await fetchOembed(declared, fetchImpl), oembedNote: 'declared' };
  } catch {
    return { source: 'Microlink', pageUrl, tags, oembed: null, oembedNote: 'declared, not readable here' };
  }
}

/** Reads pasted HTML. No network: a declared oEmbed link is listed, never fetched. */
export function lookupHtml(html) {
  if (!String(html || '').trim()) throw new LookupError('empty-html');
  const tags = parseHtml(html);
  const declared = tags.some(([name]) => name === 'link oembed');
  return { source: 'pasted HTML', pageUrl: '', tags, oembed: null, oembedNote: declared ? 'declared, not fetched' : 'not declared' };
}
