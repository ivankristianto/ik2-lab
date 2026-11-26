// Gathers tags for a URL or pasted HTML. A URL goes to the provider's oEmbed when it is a known
// provider, else to Microlink; pasted HTML never leaves the browser.
import { fetchTags, LookupError } from './microlink.js';
import { fetchOembed, providerEndpoint } from './oembed.js';
import { parseHtml } from './parse.js';
import { readPageUrl, safeUrl } from './url.js';

/** Returns { source, pageUrl, tags, oembed, oembedNote } or throws LookupError. */
export async function lookupUrl(input, fetchImpl = fetch) {
  const { url, error } = readPageUrl(input);
  if (error) throw new LookupError(error);
  const provider = providerEndpoint(url);
  if (provider) {
    try {
      const oembed = await fetchOembed(provider.endpoint, fetchImpl);
      return { source: provider.name, pageUrl: url, tags: [], oembed, oembedNote: `from ${provider.name}` };
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
