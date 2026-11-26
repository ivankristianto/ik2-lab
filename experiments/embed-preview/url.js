// URL checks. Everything the tool loads or shows as a link goes through safeUrl.

const MAX_URL = 2048;

/** Resolves value against base and returns it only if it is http(s), else null. */
export function safeUrl(value, base) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

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

/** Reads what the visitor typed. Returns { url } or { error } with a code from messages.js. */
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
