# Handover: put the lab on Dokploy

Written 2026-11-17, updated 2026-11-18. Delete this file once the tasks below are done.

The goal is `https://lab.ivankristianto.com/font-split/` served from Dokploy and framed on its entry page on `https://www.ivankristianto.com/lab/`. Read `CLAUDE.md` and `PRODUCT.md` first. The tool contract is in the ik2 spec, section "Contract for a tool": [docs/specs/2026-11-11-lab-section-design.md](https://github.com/ivankristianto/ik2/blob/main/docs/specs/2026-11-11-lab-section-design.md). The reasoning for a separate instance is in [ADR 0005](https://github.com/ivankristianto/ik2/blob/main/docs/adr/0005-lab-shell-and-separate-instance.md).

## Where things stand

- **The site side is live.** ik2 [v0.33.0](https://github.com/ivankristianto/ik2/releases/tag/v0.33.0) shipped on 2026-11-17 with the `lab` post type, the frame and the index. The page [www.ivankristianto.com/lab/](https://www.ivankristianto.com/lab/) is published (page ID 2188) and shows "Nothing here yet." because prod has no lab entries.
- **ik2 needs no change for this work.** It frames tools from `https://lab.ivankristianto.com` by default (`IK2_LAB_ORIGIN` only overrides it locally), and refuses any tool URL on another origin.
- **Brand copies are pinned** to ik2 `v0.33.0` (`shared/BRAND_VERSION`), and the `brand` workflow checks them on every pull request.
- **The demo is deployable.** `font-split/` sends its resize message and its back link to the site origin, with `http://localhost:8080` for the dev stack (PR 1).
- **Tasks 1 to 3 are written**, on the branches `dokploy-image` (image and nginx config) and `dokploy-release` (build workflow and `scripts/release.sh`, stacked on the first). The image passes every local check in task 5. The workflow has not run yet: it can only run once it is on `main`.
- **Nothing is hosted.**

## Decided

- **Hosting is Dokploy**, the same server that runs the main site, as its own application with its own releases. Ivan, 2026-11-17.
- **Static first.** Every tool so far is plain files, so the image is nginx serving a whitelist of files.
- **Release flow** is the same shape as ik2: `scripts/release.sh` pushes a `v*` tag, which builds the image, pushes it to GHCR and calls the Dokploy webhook. Ivan, 2026-11-18.
- **The Dokploy application** is created by Claude with the Dokploy credential in the `Agents` vault, after showing Ivan the calls. Ivan, 2026-11-18.

## Still Ivan's call

Ask before building any of these.

1. **Releases.** Run `scripts/release.sh` only when Ivan asks.
2. **The Worker** for the link and oEmbed preview tool. Not part of this handover.
3. **DNS and repo secrets.** The DNS record and the `DOKPLOY_WEBHOOK_URL` secret are Ivan's. The Cloudflare token in the `Agents` vault can read the zone and purge its cache, nothing more.

## Tasks, in order

### 1. Image (done, `dokploy-image`)

Done when `docker run` serves the demo locally with the headers below.

- `Dockerfile` from `nginx:1.27-alpine` (the version ik2 uses). Copy only what a visitor needs: `shared/` and each tool folder. Never copy `docs/`, `scripts/`, `.github/`, `.impeccable/`, `*.md` or `shared/BRAND_VERSION`. Inside a tool folder, skip its `README.md` and any manifest, lockfile or env file. An explicit `COPY` per folder is safer than a `.dockerignore` that has to remember every new file.
- A health check on `/healthz`, as in ik2's `docker/nginx/Dockerfile`. Use `127.0.0.1`, not `localhost`: if the config listens on IPv4 only, `localhost` resolves to `::1` first and the check fails.
- Put the nginx config in `docker/nginx/` and keep the folder out of the image's web root.

### 2. nginx config (done, `dokploy-image`)

Use the official image's template support (`/etc/nginx/templates/default.conf.template`, filled from env vars at start) so one image works in prod and locally.

- **`FRAME_ANCESTORS`**: `https://www.ivankristianto.com` in prod. For a local run against the ik2 dev stack, `http://localhost:8080`. Send `Content-Security-Policy: frame-ancestors ${FRAME_ANCESTORS}` on every HTML response.
- **No `X-Frame-Options`** (a browser that ignores `frame-ancestors` would fall back to it and refuse the frame), and **no `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy`**.
- **`X-Robots-Tag: noindex, indexifembedded`**, so search results point at the entry page and not the bare tool. Google documented `indexifembedded` in 2022; it only works together with `noindex`. Check Google's robots meta tag page before relying on it.
- **`X-Content-Type-Options: nosniff`** and **`Referrer-Policy: strict-origin-when-cross-origin`**.
- **No HSTS in nginx.** HSTS is a Cloudflare zone setting for the site; a second header would duplicate it.
- **Cache.** Files are not fingerprinted, so no `immutable`. HTML `no-cache`; `shared/*.css` and tool assets a short `max-age` (5 minutes) with ETags.
- **`absolute_redirect off;`** so `/font-split` redirects to `/font-split/` without leaking the container's port or `http://` behind the proxy.
- **`/` redirects** to `https://www.ivankristianto.com/lab/` (302 for now). There is no lab home page.
- **Deny dotfiles**, and 404 anything outside the whitelist.
- **The `add_header` gotcha** that bit ik2: an `add_header` inside a `location` replaces every `add_header` from the server block. Either keep all headers at server level or repeat them in each location. Check with `curl -sI` on an HTML page and on a CSS file.

### 3. Build and deploy workflow (done, `dokploy-release`)

Mirror `build.yml` in ik2 ([source](https://github.com/ivankristianto/ik2/blob/main/.github/workflows/build.yml)), with one image instead of four.

- Trigger on `v*` tags and `workflow_dispatch`.
- Image `ghcr.io/ivankristianto/ik2-lab`, tagged by `docker/metadata-action` like ik2: branch, semver, `major.minor`, long sha, and `latest` only on a tag. `linux/amd64`.
- A deploy job that runs only on a tag and POSTs to `secrets.DOKPLOY_WEBHOOK_URL`, skipping with a message when the secret is missing. This is a different webhook from ik2's: each Dokploy application has its own.
- The repo is public, so the GHCR package can be public and Dokploy can pull it without registry credentials. If it ends up private, Dokploy needs a registry login.

### 4. Dokploy and DNS (with Ivan)

In this order, after both branches merge:

1. Run the build workflow by hand (`workflow_dispatch`). It builds without deploying and creates the GHCR package.
2. Make the package public in its GitHub settings; new packages on a personal account start private.
3. Create the Dokploy application and the DNS record (below).
4. Check that a bare POST to the new application's webhook redeploys an image application. ik2's webhook working does not prove it.
5. Add the secret, run `scripts/release.sh patch --dry-run` on `main` to check the brand gate, then cut the first release when Ivan asks.

- A Dokploy application from the image `ghcr.io/ivankristianto/ik2-lab:latest`, port 80, env `FRAME_ANCESTORS=https://www.ivankristianto.com`, domain `lab.ivankristianto.com` with HTTPS.
- A DNS record for `lab` in the Cloudflare zone pointing at the Dokploy server, configured the same way as `www` (proxied or not, match it).
- Add `DOKPLOY_WEBHOOK_URL` to this repo's Actions secrets.
- If the record is proxied, Cloudflare caches the CSS; purge after a deploy that changes `shared/`.

### 5. Verify

On the host:

```bash
curl -sI https://lab.ivankristianto.com/font-split/     # 200, frame-ancestors, X-Robots-Tag, no X-Frame-Options or COOP
curl -sI https://lab.ivankristianto.com/shared/lab.css  # 200, same security headers, short max-age
curl -sI https://lab.ivankristianto.com/font-split      # 301 to /font-split/, relative Location
curl -sI https://lab.ivankristianto.com/README.md       # 404
curl -sI https://lab.ivankristianto.com/docs/tool-guidelines.md  # 404
curl -sI https://lab.ivankristianto.com/                # 302 to www.ivankristianto.com/lab/
```

The ik2 dev container may predate the `IK2_LAB_ORIGIN` line in ik2's `docker-compose.yml`. If `docker exec <app container> printenv IK2_LAB_ORIGIN` prints nothing, the entry page renders no frame; recreate the app container first.

Locally, run the image on port 8787 with `FRAME_ANCESTORS=http://localhost:8080` and open `http://localhost:8080/lab/font-split-inspector/` on the ik2 dev stack: the bar should go from `loading` to the tool, and the frame should follow the tool's height. If the local entry is gone, create one with the tool URL `http://localhost:8787/font-split/`.

### 6. Publish the first entry on prod (content work, with Ivan)

Not a change in this repo. In wp-admin on the main site, a lab entry needs:

- **Fields:** title, slug `font-split-inspector`, an excerpt (the index blurb), and the write-up in the body.
- **Tool and source:** in the "Lab tool" panel, the tool URL `https://lab.ivankristianto.com/font-split/` and the source `https://github.com/ivankristianto/ik2-lab/tree/main/font-split`.
- **Heights:** both starting heights, measured from the hosted tool at desktop and phone widths. On the dev stack the content measured 464px at 1440 wide and 938px at 390 wide (2026-11-18), so the 900px narrow start was short.
- **Specimen:** up to four lines of real output for the index row, for example the sample sentence, then one line per font file with its character count.

The write-up is Ivan's to write or approve. Create it as a draft over REST if asked; publish only on his word. Then walk "Checking a tool" at the end of `docs/tool-guidelines.md` on the live entry. That includes stopping the container and confirming the sheet says "The tool did not load." after eight seconds.

### 7. Optional: header check in CI

A small script that fetches each tool's headers from the deployed host and fails when `frame-ancestors` or `X-Robots-Tag` is missing, run after a deploy. Worth it once there are two tools.

## Later, not in this handover

- **Link and oEmbed preview** needs the Worker. Say plainly under its input that the URL is fetched by a server.
- **JPEG XL round-trip** needs native binaries. Today it is a write-up with a results table.
- **New tools** start from `font-split/`: keep the two stylesheet links, the `data-embedded` script and the origin rules, add each one to the README table, and add its folder to the Dockerfile whitelist.

## Rules to keep in mind

- Never edit `shared/tokens.css`, `DESIGN.md` or `docs/tool-guidelines.md`. Change the brand in ik2, release, then run `scripts/sync-brand.sh` with no argument.
- Tokens only in tools. A new part goes into `shared/lab.css`.
- The repo is public. No client names or private links in commits, branches or files.
- Atomic Conventional Commits, files staged by name, no `/` in branch names. Pull requests, as for PR 1 and PR 2.
- Release only when Ivan asks.
