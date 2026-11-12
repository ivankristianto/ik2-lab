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
| `<slug>/` | One tool, with its own `README.md`, setup and dependencies. |
| `shared/lab.css` | Fields, buttons, output, tables, status marks, and the framed and standalone modes. |
| `shared/tokens.css` | Copy of the site's design tokens. |
| `DESIGN.md` | Copy of the site's design system. |
| `docs/tool-guidelines.md` | Copy of the brand rules for tools. |
| `PRODUCT.md` | Who the tools are for and what they must do. |
| `CLAUDE.md` | Instructions for coding agents. |
| `scripts/sync-brand.sh` | Refreshes the three copies from the main repo. |

## Tools are self-contained

A tool can be anything: a static page, a Worker, something with native binaries. Each one keeps its own `README.md`, dependencies, lockfile and build config in its folder, and you install and run it from there. The root has no `package.json` and no build. Start with the tool's README.

Static tools can be served together from the root, so `../shared/` resolves:

```bash
python3 -m http.server 8787
```

The ik2 dev stack frames tools from `http://localhost:8787`.

## Brand

The lab follows the main site's design system and has no look of its own. A tool links `shared/tokens.css` and `shared/lab.css` and writes no colour, size or spacing value itself.

`DESIGN.md`, `docs/tool-guidelines.md` and `shared/tokens.css` are copies from the ik2 repo. Don't edit them here. To refresh them, with ik2 checked out next to this repo:

```bash
scripts/sync-brand.sh            # from ik2's newest release tag
scripts/sync-brand.sh <ref>      # or from a specific tag or branch
scripts/sync-brand.sh --check    # fail if a copy has drifted
```

`shared/BRAND_VERSION` records which ik2 ref and commit the copies came from.

## Writing a tool

Start from `font-split/` and rewrite its `README.md` for the new tool. Then add a row to the table above. Every tool has to:

- set `data-embedded` on `<html>` before first paint when it is framed;
- post `{ type: 'ik2-lab:resize', height }` to its parent whenever `document.body` changes height;
- open every link in a new tab;
- show a useful result on load;
- say whether the input stays in the browser.

The full rules are in [`docs/tool-guidelines.md`](docs/tool-guidelines.md).

## Not here yet

Hosting, response headers, the Worker for server-side fetches, and a release process.
