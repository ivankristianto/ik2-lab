# Embed preview

Paste a page address, run the bookmarklet on a page, or paste a page's HTML, and see roughly how Telegram, Slack and X would show it as a link card, with the tags behind each card. Served at `lab.ivankristianto.com/experiments/embed-preview/`, shown on the entry at `/lab/embed-preview/`.

## Where the data comes from

The tool runs in the browser and uses no server or service of its own. A browser page can't read another site's HTML, so:

| Input | What happens | Who sees the address |
| --- | --- | --- |
| A YouTube, Vimeo, X, SoundCloud, Spotify, TikTok or Bluesky link | The provider's own oEmbed endpoint, called from the browser | That provider |
| Any other address | One try at WordPress's oEmbed route on the same host, `/wp-json/oembed/1.0/embed`, which answers other origins. Anything else gets a line pointing to the bookmarklet and paste. | That site |
| The bookmarklet | Runs on the visitor's page, reads the tags in `TAGS` and opens the tool with them in the URL fragment (`#url=…&og:title=…`). `lookupFragment` reads them back. | Nobody: a fragment never reaches a server, and the tab opens with `noreferrer` |
| Pasted HTML | Read in the browser by `parseHtml` in `parse.js`, as text | Nobody |

A site whose Content Security Policy blocks bookmarklets needs the paste path. WordPress installed in a subfolder (such as `/news/`) misses the oEmbed try; the bookmarklet covers it.

Preview images load straight from their sites with `referrerpolicy="no-referrer"`, so the image host sees the visitor's IP.

On first paint without a fragment the tool shows a saved result (in `app.js`), so a page view sends no request.

## Untrusted output

- Pasted HTML and the fragment are treated the same: page text reaches the DOM only through `textContent`, and nothing is evaluated.
- A URL from a page, a fragment or a provider is used only if it is http or https (`safeUrl` in `parse.js`). The fragment reader drops any other URL and refuses a fragment over 50,000 characters.
- A declared oEmbed link from pasted HTML or the fragment is listed, never fetched.
- oEmbed `html` is shown as text and never rendered.
- Every request sends no cookies and no referrer.
- Strings are cleaned of control characters and cut to length (`clean` in `parse.js`).

## Files

| File | Concern |
| --- | --- |
| `index.html` | Markup |
| `embed-preview.css` | The card and detail parts, tokens only |
| `lookup.js` | Turning each input into a result: the private-host guard, provider and WordPress oEmbed, error messages, pasted HTML, and the bookmarklet with its fragment reader |
| `parse.js` | Pure text work: cleaning strings and URLs, the tag list, reading tags from pasted HTML, and picking each card's fields |
| `render.js` | The cards and the detail sections |
| `app.js` | Wiring, the bookmarklet link, the saved first-paint result, height reports to the entry |

## Run and test

From the repo root, `python3 -m http.server 8787` and open `http://localhost:8787/experiments/embed-preview/`.

From this folder, `npm test` (or `node --test test/*.test.js`). The tests need Node 20 or later and no install. CI runs them on every pull request that touches this folder (`.github/workflows/embed-preview.yml`).

The cards are approximations of each app's layout, not screenshots. Telegram doesn't document which tags it reads.
