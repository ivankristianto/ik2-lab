// What the visitor reads when a lookup fails. Each says what happened and what to do next.

export const MESSAGES = {
  'empty-url': 'Paste a page address first, such as https://example.com/post/.',
  'invalid-url': "That doesn't look like a web address. Paste the full URL, starting with https://.",
  'private-url': "That address is on a private network, so Microlink can't open it. Paste the page's HTML below instead.",
  'rate-limited': "You've used today's free Microlink lookups (5 a day). Paste the page's HTML below instead; that has no limit.",
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
