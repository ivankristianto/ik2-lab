# ik2-lab

Small tools and experiments for [ivankristianto.com/lab](https://www.ivankristianto.com/lab/). Each tool is served from `lab.ivankristianto.com/<slug>/` and shown on its entry page inside a sandboxed frame. The site's shell (the pages, the frame, the index) lives in [ivankristianto/ik2](https://github.com/ivankristianto/ik2).

This repo is a starting point, not a deployed service yet. It holds the shared styles and one demo tool.

## Layout

| Path | What |
| --- | --- |
| `shared/tokens.css` | Copy of `design-system/tokens.css` from ik2. Never edit by hand; copy it again from a tagged ik2 release. |
| `shared/lab.css` | The parts every tool uses: fields, buttons, output, tables, status, the framed and standalone modes. |
| `font-split/` | Demo tool: which font file draws each character, from `@font-face` rules and sample text. |

## Rules for a tool

The brand rules are in ik2 at `docs/lab-tool-guidelines.md`, and the technical contract is in `docs/specs/2026-11-11-lab-section-design.md`. In short:

- Link `shared/tokens.css` and `shared/lab.css`. Write no colour, size or spacing value of your own.
- Set `data-embedded` on `<html>` before first paint when `window.top !== window`.
- Post `{ type: 'ik2-lab:resize', height }` to the parent whenever `document.body` changes height.
- Open every link in a new tab.
- Show a useful result on load.

## Run it locally

```bash
python3 -m http.server 8787
```

The ik2 dev stack frames tools from `http://localhost:8787`. Set an entry's tool URL to `http://localhost:8787/font-split/`.

## Not here yet

Hosting, response headers (`frame-ancestors`, `X-Robots-Tag`), the Worker for server-side fetches, and a build step. The demo posts its resize message to `*`; a deployed tool should name the site's origin.
