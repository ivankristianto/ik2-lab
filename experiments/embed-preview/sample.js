// The result shown on first paint: my font split entry's head tags as read on 2026-11-26.
// Shipping it saves a Microlink lookup on every page view.

const ENTRY = 'https://www.ivankristianto.com/lab/font-split-inspector/';
const TITLE = 'Font split inspector - Ivan Kristianto';
const DESCRIPTION = 'Paste @font-face rules and sample text, see which font file draws each character.';

export const SAMPLE = {
  source: 'saved sample',
  pageUrl: ENTRY,
  oembed: null,
  oembedNote: 'not declared',
  tags: [
    ['title', TITLE],
    ['og:type', 'article'],
    ['og:title', TITLE],
    ['og:description', DESCRIPTION],
    ['og:url', ENTRY],
    ['og:site_name', 'Ivan Kristianto'],
    ['og:image', 'https://www.ivankristianto.com/wp-content/themes/ik2/assets/images/social-card.png'],
    ['og:image:width', '2400'],
    ['og:image:height', '1260'],
    ['twitter:card', 'summary_large_image'],
    ['twitter:site', '@ivankrisdotcom'],
    ['link icon', 'https://www.ivankristianto.com/wp-content/themes/ik2/assets/favicon/favicon.svg'],
    ['link canonical', ENTRY],
  ],
};
