# Font split inspector

Paste `@font-face` rules and sample text, and see which font file draws each character. Useful when a family is split by `unicode-range` and you want to know which files a page will actually download.

Entry page: [ivankristianto.com/lab/font-split-inspector](https://www.ivankristianto.com/lab/font-split-inspector/) (not live yet).

Status: demo. It is the reference tool for this repo, so new tools start as a copy of this folder.

## Run it

No install, no build. It is one `index.html` that links `../shared/tokens.css` and `../shared/lab.css`, so serve from the repo root, not from this folder:

```bash
cd ..
python3 -m http.server 8787
```

Then open `http://localhost:8787/font-split/`.

## Where the data goes

Nowhere. The rules and text are parsed in the browser and nothing is sent to a server.

## Local and production

The back link and the resize message both go to the main site. Production is `https://www.ivankristianto.com`. When the tool is served from `localhost`, it uses the ik2 dev stack at `http://localhost:8080`. When the tool is framed, the parent's origin comes from the referrer, so a tool on `localhost:8787` framed by the dev stack resizes correctly.
