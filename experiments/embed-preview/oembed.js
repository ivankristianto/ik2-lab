// oEmbed from providers whose endpoints answer a browser (checked from Chrome on 2026-11-26).
import { clean, LIMITS } from './text.js';
import { safeUrl } from './url.js';

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
