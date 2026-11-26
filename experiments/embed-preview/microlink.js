// Microlink's free endpoint, asked for the exact head tags in TAGS rather than its merged summary.
import { TAGS, URL_TAGS } from './tags.js';
import { clean, LIMITS } from './text.js';

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

/** Looks up pageUrl. Returns { tags, finalUrl }; throws LookupError with a code from messages.js. */
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
