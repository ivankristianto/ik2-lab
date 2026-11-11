# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

Small tools and experiments for [ivankristianto.com/lab](https://www.ivankristianto.com/lab/). Each tool lives in its own folder, is served from `lab.ivankristianto.com/<slug>/`, and is shown on its entry page on the main site inside a sandboxed, cross-origin iframe. The pages around the tools (the index, the entry, the frame) live in the main repo, [ivankristianto/ik2](https://github.com/ivankristianto/ik2). Don't build page chrome here.

Read `PRODUCT.md` for who the tools are for and `docs/tool-guidelines.md` before touching any tool's markup or CSS.

## Layout

| Path | What |
| --- | --- |
| `<slug>/` | One tool. `index.html` plus whatever it needs. |
| `shared/lab.css` | The parts every tool uses. Owned by this repo. |
| `shared/tokens.css` | Copy of the site's design tokens. Synced, never edited. |
| `DESIGN.md` | Copy of the site's design system. Synced, never edited. |
| `docs/tool-guidelines.md` | Copy of the brand rules for tools. Synced, never edited. |
| `shared/BRAND_VERSION` | The ik2 ref and commit the three copies came from. |
| `scripts/sync-brand.sh` | Refreshes the copies. |

## Commands

```bash
python3 -m http.server 8787        # serve the repo; the ik2 dev stack frames tools from http://localhost:8787
scripts/sync-brand.sh              # copy the brand files from ../ik2 at its newest release tag
scripts/sync-brand.sh <ref>        # or from a specific tag or branch
scripts/sync-brand.sh --check      # fail if a copy differs from ik2 at the recorded commit
```

`sync-brand.sh` reads a sibling checkout at `../ik2`. Set `IK2_DIR` if it is somewhere else. There is no build step, no package manager and no test runner yet.

## Brand

This repo has no brand of its own. It follows the main site's, "Ink, Paper, and Signal".

- `DESIGN.md`, `docs/tool-guidelines.md` and `shared/tokens.css` are copies. To change the brand, change it in ik2, release, then run `scripts/sync-brand.sh`. Never edit the copies; `--check` will fail.
- File paths inside `DESIGN.md` (`theme.json`, `src/styles/`, `blocks/`) refer to the ik2 repo, not this one. Use it for the rules, not for the paths.
- `docs/tool-guidelines.md` is the part of the brand written for tools. Where it and `DESIGN.md` seem to disagree about something inside a tool, the guidelines win.

Rules that constrain every change:

- **Tokens only.** A tool links `shared/tokens.css` and `shared/lab.css` and writes no colour, size, spacing, radius or duration of its own. If a second tool needs a new part, add it to `shared/lab.css`.
- **One accent**, Bookcloth green (`--wp--preset--color--signal`): links, focus ring, caret, selection. Status colours mean status only.
- **Light only.** No `prefers-color-scheme` block.
- **System fonts only.** No `@font-face`, no webfont.
- **No shadows, gradients, glass effects, icon fonts or emoji in controls.** No modal.
- **No `!important`.**
- **Focus ring** is 2px Bookcloth with a 3px offset on every control.
- **Motion** is `200ms ease` on colour, background and border only.

## What every tool must do

1. Set `data-embedded` on `<html>` before first paint when `window.top !== window`. Framed, it sits on Surface with no header. On its own, it sits on Paper with a `.lab-standalone` header linking back to its entry.
2. Post `{ type: 'ik2-lab:resize', height }` to the parent whenever `document.body` changes height (a `ResizeObserver` on `document.body`). Never scroll inside the frame.
3. Open every link in a new tab (`target="_blank" rel="noopener"`). The sandbox blocks top navigation.
4. Show a useful result on load.
5. Say under the input whether it stays in the browser.
6. Work with the keyboard alone, with controls 44px tall or more and 16px text on phones.

`font-split/index.html` is the reference for all six.

## Adding a tool

1. Copy `font-split/` to `<slug>/` and replace its content. Keep the two stylesheet links and the `data-embedded` script.
2. Use the classes in `shared/lab.css`. Check the result against the "Checking a tool" list in `docs/tool-guidelines.md`.
3. Add the tool to the table in `README.md`.
4. The entry page is content in WordPress on the main site, not a file here.

## Voice

First person, working engineer, plain. Labels are lowercase (`sample text`, `result`). Errors are sentences that say what went wrong and what to do. No exclamation marks, no em dashes. Buttons are verb first with no period.

## Code conventions

- Plain HTML, CSS and JavaScript that runs in a current browser without a build. No framework and no dependency unless a tool cannot work without one.
- Comment why, never what. Keep doc blocks to four lines or fewer.
- Branch names use hyphens, no `/`.
- Atomic commits in Conventional Commits form: `feat(font-split): ...`, `fix(shared): ...`, `docs: ...`. Stage files by name, never `git add -A`.
- This repo is public. Never put a client name or a private repo link in a commit, branch or file.

## Not decided yet

Hosting, response headers (`frame-ancestors https://www.ivankristianto.com`, `X-Robots-Tag: noindex, indexifembedded`), the Worker for server-side fetches, and releases. Don't add any of them without asking. The demo posts its resize message to `*`; a deployed tool should name the site's origin.
