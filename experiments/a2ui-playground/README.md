# A2UI playground

Pick a canned A2UI v1.0 agent response, read its JSON, and see the interface a renderer draws from it. Live mode sends your own prompt to Anthropic, OpenAI or Gemini with your own API key and renders the reply the same way.

Entry page: [ivankristianto.com/lab/a2ui-playground](https://www.ivankristianto.com/lab/a2ui-playground/) (not live yet).

Status: demo.

## Run it

No install, no build. The page loads plain ES modules and links `/shared/tokens.css` and `/shared/lab.css`, so serve the repo root, not this folder:

```bash
cd ../..
python3 -m http.server 8787
```

Then open `http://localhost:8787/experiments/a2ui-playground/`.

## Test it

The tests use Node's built-in runner (Node 22 or later) and need no install:

```bash
npm test          # from this folder; or: node --test tests/*.test.js
```

`tests/protocol.test.js` covers the validator's rules, each preset, and input nested deep enough to overflow the stack. `tests/providers.test.js` checks each provider's request and reply shape and error sentences against a mocked `fetch`. The renderer is checked in a browser.

## Files

| File | What |
| --- | --- |
| `index.html` | Markup, and the embed and resize script copied from font-split. |
| `app.js` | Wiring: presets, Render, live mode, the action log. |
| `protocol.js` | Parses and validates agent-to-renderer messages and folds them into surface state. No DOM. |
| `evaluate.js` | JSON Pointer access to the data model and the basic-catalog functions. No DOM. |
| `render.js` | Draws validated surfaces with DOM APIs, with two-way binding and checks. |
| `presets.js` | The five canned responses, and the scripted reply in the booking preset. |
| `providers.js` | One entry per provider: request, reply and error shapes, and the system prompt. |
| `playground.css` | The source switch, the key notice and the rendered components. Tokens only. |

## What it supports

The A2UI v1.0 basic catalog, minus five components:

- Drawn: Text, Row, Column, List (including templates), Card, Tabs, Divider, Button, CheckBox, TextField, ChoicePicker, Slider, DateTimeInput.
- Left out: Image, Video and AudioPlayer, because a URL from a response would make the visitor's browser fetch it. Icon, because the brand has no icon font. Modal, because the lab has no modals.
- Functions: required, email, length, numeric, and, or, not, formatString (data paths only), formatNumber, formatCurrency, and `@index` inside templates. regex, openUrl, formatDate and pluralize are reported as unsupported.
- Messages: createSurface, updateComponents, updateDataModel, deleteSurface. callRendererFunction and agentFunctionResponse need a live agent session, so they are reported.

Responses are untrusted. The validator checks the envelope, every component prop and enum, ids, references, cycles, depth (32), size (500 components, 200 template items, 200 KB) and data paths (`__proto__`, `constructor` and `prototype` are refused). Nothing is drawn while any problem stands, and response text reaches the page only through `textContent` and attributes. Drawing stops after 2,000 components, since nested list templates multiply.

## Where the data goes

Preset mode: nowhere. Everything runs in the browser.

Live mode: the prompt and the key go from the browser straight to the chosen provider (`api.anthropic.com`, `api.openai.com` or `generativelanguage.googleapis.com`) and nowhere else. The key lives only in the input field: it is never written to storage, cookies, the URL or the console, and a reload forgets it. The Gemini key travels in the `x-goog-api-key` header, not the query string. Provider error bodies are never shown, since some echo part of the key; the page maps the status code to its own sentence.

All three providers advise against using API keys in a browser, so the page says so above the key field and suggests a low-limit or throwaway key. Anthropic needs the `anthropic-dangerous-direct-browser-access: true` header for a browser request; OpenAI and Gemini answer browser requests without one.

## Models

Defaults, checked against each provider's models page on 2026-11-26: `claude-haiku-5-5`, `gpt-6-luna`, `gemini-3.5-flash-lite`. The model field takes any ID the key can use.

Request shapes were checked against each provider's docs, and Gemini's body against its schema check (it rejects unknown fields before it checks the key). Anthropic uses `anthropic-version: 2023-06-01`, which its versioning page still lists; the current one is `2026-10-21`. No provider has been called with a real key yet.

## Local and production

As font-split: the back link and the resize message go to `https://www.ivankristianto.com` in production and to the ik2 dev stack at `http://localhost:8080` when served from `localhost`.
