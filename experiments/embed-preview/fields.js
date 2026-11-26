// Picks what each card shows from the tags, the way each app is documented or observed to:
// X reads twitter:* first and falls back to og:*, Slack and Telegram read og:* first.
import { safeUrl } from './url.js';

function first(map, names) {
  for (const name of names) if (map.has(name)) return { value: map.get(name), from: name };
  return null;
}

/** Builds { cards, rows } from tags ([name, value] pairs), an optional oEmbed object and the page URL. */
export function buildPreview({ tags = [], oembed = null, pageUrl = '' }) {
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

  const row = (field, pick, want, note = '') => ({ field, pick, want, note, status: !pick ? 'missing' : pick.from === want ? 'found' : 'fallback' });
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
  return { found: count('found'), fallback: count('fallback'), missing: count('missing') };
}
