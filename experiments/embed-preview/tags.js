// The head tags the cards read. Both the paste parser and the Microlink lookup return these names.

export const TAGS = [
  { name: 'title', selector: 'title', attr: 'text' },
  { name: 'description', selector: 'meta[name="description"]', attr: 'content' },
  { name: 'og:title', selector: 'meta[property="og:title"]', attr: 'content' },
  { name: 'og:description', selector: 'meta[property="og:description"]', attr: 'content' },
  { name: 'og:image', selector: 'meta[property="og:image"]', attr: 'content' },
  { name: 'og:image:width', selector: 'meta[property="og:image:width"]', attr: 'content' },
  { name: 'og:image:height', selector: 'meta[property="og:image:height"]', attr: 'content' },
  { name: 'og:image:alt', selector: 'meta[property="og:image:alt"]', attr: 'content' },
  { name: 'og:site_name', selector: 'meta[property="og:site_name"]', attr: 'content' },
  { name: 'og:url', selector: 'meta[property="og:url"]', attr: 'content' },
  { name: 'og:type', selector: 'meta[property="og:type"]', attr: 'content' },
  { name: 'twitter:card', selector: 'meta[name="twitter:card"]', attr: 'content' },
  { name: 'twitter:title', selector: 'meta[name="twitter:title"]', attr: 'content' },
  { name: 'twitter:description', selector: 'meta[name="twitter:description"]', attr: 'content' },
  { name: 'twitter:image', selector: 'meta[name="twitter:image"]', attr: 'content' },
  { name: 'twitter:site', selector: 'meta[name="twitter:site"]', attr: 'content' },
  { name: 'link icon', selector: 'link[rel~="icon"]', attr: 'href' },
  { name: 'link canonical', selector: 'link[rel="canonical"]', attr: 'href' },
  { name: 'link oembed', selector: 'link[type="application/json+oembed"]', attr: 'href' },
];

export const URL_TAGS = new Set(['og:image', 'og:url', 'twitter:image', 'link icon', 'link canonical', 'link oembed']);
