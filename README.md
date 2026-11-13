# ik2-lab

Small tools and experiments for [ivankristianto.com/lab](https://www.ivankristianto.com/lab/).

Each tool answers one question, runs in the browser, and needs no account. It is served from `lab.ivankristianto.com/<slug>/` and shown on its entry page on the main site inside a sandboxed frame. The pages around the tools live in [ivankristianto/ik2](https://github.com/ivankristianto/ik2).

This repo is a starting point. Nothing is deployed from it yet.

## Tools

| Tool | What it does | Status |
| --- | --- | --- |
| [`font-split/`](font-split/) | Paste `@font-face` rules and sample text, see which font file draws each character. | demo |

## Layout

| Path | What |
| --- | --- |
| `<slug>/` | One tool: `index.html` plus whatever it needs. |
| `shared/lab.css` | Fields, buttons, output, tables, status marks, and the framed and standalone modes. |
| `shared/tokens.css` | Copy of the site's design tokens. |
| `DESIGN.md` | Copy of the site's design system. |
| `docs/tool-guidelines.md` | Copy of the brand rules for tools. |
| `PRODUCT.md` | Who the tools are for and what they must do. |
| `CLAUDE.md` | Instructions for coding agents. |
| `scripts/sync-brand.sh` | Refreshes the three copies from the main repo. |

## Run it locally

```bash
python3 -m http.server 8787
```

Then open `http://localhost:8787/font-split/`. The ik2 dev stack frames tools from `http://localhost:8787`, so setting a lab entry's tool URL to that address shows the tool on its entry page.

## Brand

The lab follows the main site's design system and has no look of its own. A tool links `shared/tokens.css` and `shared/lab.css` and writes no colour, size or spacing value itself.

`DESIGN.md`, `docs/tool-guidelines.md` and `shared/tokens.css` are copies from the ik2 repo. Don't edit them here. To refresh them, with ik2 checked out next to this repo:

```bash
scripts/sync-brand.sh            # from ik2's newest release tag
scripts/sync-brand.sh <ref>      # or from a specific tag or branch
scripts/sync-brand.sh --check    # fail if a copy has drifted
```

`shared/BRAND_VERSION` records which ik2 ref and commit the copies came from.

The `brand` workflow runs `scripts/sync-brand.sh --check` against that commit on every pull request and push to `main`, so a hand-edited copy fails CI.

## Writing a tool

Start from `font-split/`. Every tool has to:

- set `data-embedded` on `<html>` before first paint when it is framed;
- post `{ type: 'ik2-lab:resize', height }` to its parent whenever `document.body` changes height;
- open every link in a new tab;
- show a useful result on load;
- say whether the input stays in the browser.

The full rules are in [`docs/tool-guidelines.md`](docs/tool-guidelines.md).

## Not here yet

Hosting, response headers, the Worker for server-side fetches, and a release process.
