# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

Small tools and experiments for [ivankristianto.com/lab](https://www.ivankristianto.com/lab/). Each tool lives in its own folder, is served from `lab.ivankristianto.com/<slug>/`, and is shown on its entry page on the main site inside a sandboxed, cross-origin iframe. The pages around the tools (the index, the entry, the frame) live in the main repo, [ivankristianto/ik2](https://github.com/ivankristianto/ik2). Don't build page chrome here.

Read `PRODUCT.md` for who the tools are for and `docs/tool-guidelines.md` before touching any tool's markup or CSS.

## Layout

| Path | What |
| --- | --- |
| `<slug>/` | One tool. Its own `README.md`, `index.html` and whatever else it needs. |
| `shared/lab.css` | The parts every tool uses. Owned by this repo. |
| `shared/tokens.css` | Copy of the site's design tokens. Synced, never edited. |
| `DESIGN.md` | Copy of the site's design system. Synced, never edited. |
| `docs/tool-guidelines.md` | Copy of the brand rules for tools. Synced, never edited. |
| `shared/BRAND_VERSION` | The ik2 ref and commit the three copies came from. |
| `scripts/sync-brand.sh` | Refreshes the copies. |
| `Dockerfile` | The nginx image that serves the static tools. Its `COPY` lines are the whitelist of public files. |
| `docker/nginx/default.conf.template` | The nginx config, filled from env vars at start. Holds every response header. |
| `scripts/release.sh` | Tags `main` as the next `vX.Y.Z`. The tag runs `.github/workflows/build.yml`, which pushes the image and redeploys. |

## Commands

```bash
python3 -m http.server 8787        # serve the repo; the ik2 dev stack frames tools from http://localhost:8787
scripts/sync-brand.sh              # copy the brand files from ../ik2 at its newest release tag
scripts/sync-brand.sh <ref>        # or from a specific tag or branch
scripts/sync-brand.sh --check      # fail if a copy differs from ik2 at the recorded commit

docker build -t ik2-lab .          # the image Dokploy runs
docker run --rm -p 8787:80 -e FRAME_ANCESTORS=http://localhost:8080 ik2-lab   # same port, with the prod headers
scripts/release.sh patch --dry-run # release; only when Ivan asks
```

`sync-brand.sh` reads a sibling checkout at `../ik2`. Set `IK2_DIR` if it is somewhere else. The repo root has no package manager and no test runner. Its only build is the `Dockerfile`.

## Repo versus tool

The repo will hold tools of any kind: a static page, a Worker, something with native binaries. The root assumes nothing about a tool's stack.

- The root `README.md` is about the repo: what it is, the tools table, the layout, the brand, how to add a tool. It never holds one tool's setup or usage.
- Each tool's `<slug>/README.md` holds everything about that tool: what it does, how to run it, how to install and build it, what runs where, and anything that only works locally.
- A tool's dependencies, lockfile, build config, env example and scripts stay inside its folder (`<slug>/package.json`, `<slug>/wrangler.toml`, `<slug>/.env.example`). Install and build from that folder. Never add a `package.json` or other manifest at the root.
- Only `shared/`, `scripts/`, the `Dockerfile`, `docker/nginx/` and the workflows are shared. If two tools need the same code, ask before adding it to `shared/`.

## Brand

This repo has no brand of its own. It follows the main site's, "Ink, Paper, and Signal".

- `DESIGN.md`, `docs/tool-guidelines.md` and `shared/tokens.css` are copies. To change the brand, change it in ik2, release, then run `scripts/sync-brand.sh`. Never edit the copies; `--check` will fail, and CI runs it on every pull request and push to `main` (`.github/workflows/brand.yml`).
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
2. Post `{ type: 'ik2-lab:resize', height }` to the parent whenever `document.body` changes height (a `ResizeObserver` on `document.body`). Never scroll inside the frame. Post to the site origin, never `'*'`.
   - Work out the site origin from an allowlist, `https://www.ivankristianto.com` and the dev stack's `http://localhost:8080`. Pick the one that matches `document.referrer`. If none matches, use the dev origin when the tool is served from `localhost` and the production origin otherwise. Don't use `location.ancestorOrigins`; only Chromium has it.
   - Write every link to the main site with its production URL and a `data-site-link` attribute. The same script swaps in the site origin, so a dev checkout links back to `localhost:8080`.
   - Copy that script from `font-split/index.html`.
3. Open every link in a new tab (`target="_blank" rel="noopener"`). The sandbox blocks top navigation.
4. Show a useful result on load.
5. Say under the input whether it stays in the browser.
6. Work with the keyboard alone, with controls 44px tall or more and 16px text on phones.

`font-split/index.html` is the reference for all six.

## Adding a tool

1. Copy `font-split/` to `<slug>/` and replace its content. Keep the two stylesheet links and the `data-embedded` script.
2. Use the classes in `shared/lab.css`. Check the result against the "Checking a tool" list in `docs/tool-guidelines.md`.
3. Rewrite `<slug>/README.md` for the new tool, with its own setup and run steps. Keep any install or build inside the folder.
4. Add one row for the tool to the table in the root `README.md`. Nothing else about the tool goes there.
5. Add a `COPY` line to the `Dockerfile` for each file a visitor loads. Never copy the tool's `README.md`, manifest, lockfile or env file. A file left out is a 404 in production.
6. The entry page is content in WordPress on the main site, not a file here.

## Voice

First person, working engineer, plain. Labels are lowercase (`sample text`, `result`). Errors are sentences that say what went wrong and what to do. No exclamation marks, no em dashes. Buttons are verb first with no period.

## Code conventions

- Plain HTML, CSS and JavaScript that runs in a current browser without a build. No framework and no dependency unless a tool cannot work without one.
- Comment why, never what. Keep doc blocks to four lines or fewer.
- Branch names use hyphens, no `/`.
- Atomic commits in Conventional Commits form: `feat(font-split): ...`, `fix(shared): ...`, `docs: ...`. Stage files by name, never `git add -A`.
- This repo is public. Never put a client name or a private repo link in a commit, branch or file.

## Hosting

The static tools ship as one nginx image for Dokploy, the server that runs the main site, where it runs as its own application at `lab.ivankristianto.com`. It is not deployed yet.

- Response headers live in `docker/nginx/default.conf.template`, all at server level. An `add_header` inside a `location` drops every server-level header, so never add one there. Use `expires` for cache rules.
- `FRAME_ANCESTORS` sets `Content-Security-Policy: frame-ancestors`. It defaults to `https://www.ivankristianto.com`; pass `http://localhost:8080` for the dev stack.
- Never send `X-Frame-Options`, `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy`: each one stops the site framing a tool. HSTS comes from Cloudflare, not nginx.
- After changing either file, run the image and check `curl -sI` on an HTML page, a CSS file and a 404.
- Release only when Ivan asks, with `scripts/release.sh`. A tag redeploys production. If Cloudflare proxies `lab`, purge its cache after a release that changes `shared/`.

## Not decided yet

The Worker for server-side fetches. Don't add it without asking.
