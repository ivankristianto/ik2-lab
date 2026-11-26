# Embed preview

Paste a page address and see roughly how Telegram, Slack and X would show it as a link card, with the tags behind each card. Served at `lab.ivankristianto.com/experiments/embed-preview/`, shown on the entry at `/lab/embed-preview/`.

## Where the data comes from

The tool runs in the browser and has no server of its own. A browser page can't read another site's HTML, so:

| Input | What happens | Who sees the address |
| --- | --- | --- |
| A YouTube, Vimeo, X, SoundCloud, Spotify, TikTok or Bluesky link | The provider's own oEmbed endpoint, called from the browser | That provider |
| Any other address | [Microlink](https://microlink.io/)'s free endpoint, asked for the exact head tags with `data` rules and `meta=false`. If the page's oEmbed link comes back, it is fetched from the browser too. | Microlink |
| Pasted HTML | Read in the browser by `parse.js`, as text | Nobody |

Microlink's free endpoint allows a few lookups a day per visitor (its `x-rate-limit-limit` header said 5 on 2026-11-26). When it answers `ERATE` or 429, the tool says so and opens the paste section. Microlink did not report the oEmbed link of a WordPress post that declares one, so on that path the oEmbed section says "not reported" rather than "none".

Preview images load straight from their sites with `referrerpolicy="no-referrer"`, so the image host sees the visitor's IP.

On first paint the tool shows a saved result (`sample.js`), so a page view costs no lookup.

## Untrusted output

- Page text reaches the DOM only through `textContent`.
- A URL from a page or a service is used only if it is http or https (`url.js`).
- oEmbed `html` is shown as text and never rendered.
- Every request sends no cookies and no referrer.
- Strings are cleaned of control characters and cut to length (`text.js`).

## Files

| File | Concern |
| --- | --- |
| `index.html` | Markup |
| `embed-preview.css` | The card and detail parts, tokens only |
| `app.js` | Wiring, first paint, height reports to the entry |
| `lookup.js` | Chooses provider oEmbed, Microlink or paste |
| `microlink.js` | The Microlink request and its error codes |
| `oembed.js` | Known providers and oEmbed fetching |
| `parse.js` | Reads tags from pasted HTML |
| `tags.js` | The tag list both paths return |
| `fields.js` | Which tag each card uses, and the field statuses |
| `render.js` | Cards and tables |
| `url.js`, `text.js` | URL and string checks |
| `messages.js` | Error copy |
| `sample.js` | The first-paint result |

## Run and test

From the repo root, `python3 -m http.server 8787` and open `http://localhost:8787/experiments/embed-preview/`.

From this folder, `npm test` (or `node --test test/*.test.js`). The tests need Node 20 or later and no install.

The cards are approximations of each app's layout, not screenshots. Telegram doesn't document which tags it reads.
