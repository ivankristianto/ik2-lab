# ik2-lab

Small tools and experiments for [ivankristianto.com/lab](https://www.ivankristianto.com/lab/).

Each tool answers one question, runs in the browser, and needs no account. It is served from `lab.ivankristianto.com/experiments/<slug>/` and shown on its entry page on the main site inside a sandboxed frame. The pages around the tools live in [ivankristianto/ik2](https://github.com/ivankristianto/ik2).

The static tools ship as one nginx image, built to run on Dokploy as `lab.ivankristianto.com`. It is not deployed yet.

## Tools

| Tool | What it does | Status |
| --- | --- | --- |
| [`font-split`](experiments/font-split/) | Paste `@font-face` rules and sample text, see which font file draws each character. | demo |
| [`a2ui-playground`](experiments/a2ui-playground/) | Render canned or live A2UI v1.0 agent responses and see what the validator says about them. | demo |

## Layout

| Path | What |
| --- | --- |
| `experiments/<slug>/` | One tool, with its own `README.md`, setup and dependencies. Served at `lab.ivankristianto.com/experiments/<slug>/`. |
| `shared/lab.css` | Fields, buttons, output, tables, status marks, and the framed and standalone modes. |
| `shared/tokens.css` | Copy of the site's design tokens. |
| `DESIGN.md` | Copy of the site's design system. |
| `docs/tool-guidelines.md` | Copy of the brand rules for tools. |
| `PRODUCT.md` | Who the tools are for and what they must do. |
| `CLAUDE.md` | Instructions for coding agents. |
| `scripts/sync-brand.sh` | Refreshes the three copies from the main repo. |
| `Dockerfile` | The nginx image for the static tools. Its `COPY` lines list every public file. |
| `docker/nginx/` | The nginx config and its response headers. |
| `scripts/release.sh` | Tags a release, which builds the image and redeploys it. |

## Tools are self-contained

A tool can be anything: a static page, a Worker, something with native binaries. Each one keeps its own `README.md`, dependencies, lockfile and build config in its folder, and you install and run it from there. The root has no `package.json` and no build. Start with the tool's README.

The repo's layout is the site's layout: `experiments/font-split/` is served at `/experiments/font-split/`, and tools link `/shared/...` from the root. Serve the repo root:

```bash
python3 -m http.server 8787
```

The ik2 dev stack frames tools from `http://localhost:8787`, so a local entry's tool URL is `http://localhost:8787/experiments/<slug>/`, the same path as in production.

## Running the image

The image serves only the files its `Dockerfile` copies, with the production headers. `FRAME_ANCESTORS` defaults to the main site; point it at the dev stack to frame tools locally:

```bash
docker build -t ik2-lab .
docker run --rm -p 8787:80 -e FRAME_ANCESTORS=http://localhost:8080 ik2-lab
```

To edit a tool without rebuilding, mount it and `shared/` over the copies in the image:

```bash
docker run --rm -p 8787:80 -e FRAME_ANCESTORS=http://localhost:8080 \
  -v "$PWD/shared:/srv/lab/shared:ro" \
  -v "$PWD/experiments/font-split:/srv/lab/experiments/font-split:ro" \
  ik2-lab
```

The mounted folder serves every file in it, README included, so check the whitelist with a plain run before a release.

## Releasing

A `v*` tag builds the image, pushes it to `ghcr.io/ivankristianto/ik2-lab` and calls the Dokploy webhook (`.github/workflows/build.yml`). Cut one from a clean, pushed `main`:

```bash
scripts/release.sh patch --dry-run   # check first
scripts/release.sh patch             # or minor, major, X.Y.Z
```

The script needs `gh` signed in. It refuses when the `brand` check failed on that commit. A manual run of the workflow builds `<branch>` and `sha-*` images and does not deploy.

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

Start from `experiments/font-split/`, copy it to `experiments/<slug>/`, and rewrite its `README.md` for the new tool. Then add a row to the table above. Every tool has to:

- set `data-embedded` on `<html>` before first paint when it is framed;
- post `{ type: 'ik2-lab:resize', height }` to the site's origin, never `'*'`, whenever `document.body` changes height;
- link back to the main site with production URLs marked `data-site-link`, so a dev checkout points at `localhost:8080`;
- open every link in a new tab;
- show a useful result on load;
- say whether the input stays in the browser.

Then add a `COPY` line to the `Dockerfile` for each file a visitor loads. Anything left out is a 404 in production.

The full rules are in [`docs/tool-guidelines.md`](docs/tool-guidelines.md).

## Not here yet

The Worker for server-side fetches.
