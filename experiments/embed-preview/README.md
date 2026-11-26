# Embed preview

Paste a page address and see roughly how Telegram, Slack and X would show it as a link card, with the tags behind each card. Served at `lab.ivankristianto.com/experiments/embed-preview/`, shown on the entry at `/lab/embed-preview/`.

## Where the data comes from

The tool runs in the browser and has no server of its own. A browser page can't read another site's HTML, so:

| Input | What happens | Who sees the address |
| --- | --- | --- |
| A YouTube, Vimeo, X, SoundCloud, Spotify, TikTok or Bluesky link | The provider's own oEmbed endpoint, called from the browser | That provider |
| Any other address | [Microlink](https://microlink.io/)'s free endpoint, asked for the exact head tags with `data` rules and `meta=false`. If the page's oEmbed link comes back, it is fetched from the browser too. | Microlink |
| Pasted HTML | Read in the browser by `parseHtml` in `parse.js`, as text | Nobody |

Microlink's free endpoint allows a few lookups a day per visitor (its `x-rate-limit-limit` header said 5 on 2026-11-26). When it answers `ERATE` or 429, the tool says so and opens the paste section. Microlink did not report the oEmbed link of a WordPress post that declares one, so on that path the oEmbed section says "not reported" rather than "none".

Preview images load straight from their sites with `referrerpolicy="no-referrer"`, so the image host sees the visitor's IP.

On first paint the tool shows a saved result (in `app.js`), so a page view costs no lookup.

## Untrusted output

- Page text reaches the DOM only through `textContent`.
- A URL from a page or a service is used only if it is http or https (`safeUrl` in `parse.js`).
- oEmbed `html` is shown as text and never rendered.
- Every request sends no cookies and no referrer.
- Strings are cleaned of control characters and cut to length (`clean` in `parse.js`).

## Files

| File | Concern |
| --- | --- |
| `index.html` | Markup |
| `embed-preview.css` | The card and detail parts, tokens only |
| `lookup.js` | Looking up an address: the private-host guard, provider oEmbed, Microlink, error messages, and reading pasted HTML into the same shape |
| `parse.js` | Pure text work: cleaning strings and URLs, the tag list, reading tags from pasted HTML, and picking each card's fields |
| `render.js` | The cards and the detail sections |
| `app.js` | Wiring, the saved first-paint result, height reports to the entry |

## Run and test

From the repo root, `python3 -m http.server 8787` and open `http://localhost:8787/experiments/embed-preview/`.

From this folder, `npm test` (or `node --test test/*.test.js`). The tests need Node 20 or later and no install. CI runs them on every pull request that touches this folder (`.github/workflows/embed-preview.yml`).

The cards are approximations of each app's layout, not screenshots. Telegram doesn't document which tags it reads.
