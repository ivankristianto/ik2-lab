# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS and JavaScript. One folder per tool, no build step, plain files that link `shared/tokens.css` and `shared/lab.css`. A tool that needs more (a Cloudflare Worker for a server-side fetch, native binaries) says so in its own folder.

## Users

**Primary:** working web engineers and WordPress developers, the same readers as [ivankristianto.com](https://www.ivankristianto.com/). They land on a lab entry from a post, a search or a shared link, use the tool once with their own input, and leave. They meet the tool inside a frame on its entry page at `/lab/<slug>/`, not on this host.

**Secondary:** Ivan, who builds each tool to answer a question he had.

**What they want:**

- A result from their own input within seconds, with no account and no setup.
- To know whether what they paste leaves the browser.
- The source, one click away.

## Product Purpose

The lab holds small tools and experiments for ivankristianto.com. Each one answers one specific question, for example which font file draws each character of a sentence. A tool is done when a stranger can paste their input and read the answer without reading instructions first.

The tools are built, released and hosted apart from the WordPress site, so a tool can change without a site release. The site owns the pages around them.

## Positioning

A tool here is never a standalone product. It is the working part of a write-up: the entry page explains why the tool exists and how to read its result, and the tool shows that result with the reader's own data.

## Operating Context

- Each tool is served from `https://lab.ivankristianto.com/<slug>/` and framed on `https://www.ivankristianto.com/lab/<slug>/` in a sandboxed, cross-origin iframe.
- The entry page owns the title, the lead, the date and the `source` and `new tab` links. The framed tool shows none of them.
- The frame is as wide as the article text (60rem) and runs edge to edge on phones. The page scrolls; the tool reports its height and never scrolls inside the frame.
- Opened on its own, a tool shows its name and a link back to its entry.
- The site's shell lives in [ivankristianto/ik2](https://github.com/ivankristianto/ik2). Its spec (`docs/specs/2026-11-11-lab-section-design.md`) holds the technical contract.

## Capabilities and Constraints

- Tools render untrusted input (pasted CSS, metadata and images from other sites). That is why they run on their own origin.
- The sandbox blocks top navigation, so every link in a tool opens a new tab.
- A tool posts `{ type: 'ik2-lab:resize', height }` to its parent whenever `document.body` changes height.
- No account, no tracking of what a visitor pastes. Input stays in the browser unless the tool's purpose is a server call, and the tool says which.
- Search engines index the entry page, not the bare tool.
- **Undecided:** hosting for this repo, the response headers (`frame-ancestors`, `X-Robots-Tag`), the Worker for server-side fetches, and how releases are cut.

## Brand Commitments

The lab carries the same brand as the main site, "Ink, Paper, and Signal". It has no brand of its own.

- `DESIGN.md` is a copy of the main repo's design system. `docs/tool-guidelines.md` is a copy of the rules for tools. `shared/tokens.css` is a copy of the site's tokens. `scripts/sync-brand.sh` refreshes all three from a tagged ik2 release; they are never edited here.
- One accent, Bookcloth green. Light only. System fonts only. Mono for labels, data and code.
- No shadows beyond the site's two presets, no gradients, no emoji in controls, no modal.
- Voice: first person, working engineer, plain. Labels are lowercase. No exclamation marks, no em dashes.
- Buttons are verb first with no period: **Inspect**, **Fetch**, **Copy**.

## Evidence on Hand

- `font-split/`: a working demo, the font split inspector.
- `shared/lab.css`: fields, buttons, output, tables and status marks, built from the tokens.
- Ideas not built yet: a link and oEmbed preview (needs a server-side fetch) and a JPEG XL round-trip experiment (needs native binaries).
- There are no usage numbers, testimonials or benchmarks. Don't invent any.

## Product Principles

1. **One question per tool.** If a tool needs a menu, it is two tools.
2. **A result on first paint.** A tool loads with a useful default, never an empty form.
3. **Part of the page.** Inside the frame a tool should be indistinguishable from the site around it.
4. **Say where the data goes.** Every input says whether it stays in the browser.
5. **Small enough to read.** A visitor who opens the source should understand the tool in one sitting.

## Accessibility & Inclusion

- Every control is reachable by keyboard and shows the site's focus ring: 2px Bookcloth, 3px offset.
- Controls are 44px tall or more, and 16px text on phones so iOS doesn't zoom on focus.
- Text meets WCAG AA contrast on both Surface and Paper.
- Colour never carries meaning alone: a status is a word with a dot.
- Results that change announce themselves (`aria-live="polite"`).
