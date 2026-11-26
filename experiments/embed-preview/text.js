// Every string from a page or a service passes through clean before the tool keeps it.

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
