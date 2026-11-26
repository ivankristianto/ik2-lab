# syntax=docker/dockerfile:1.7

# 1.30.7 fixes the nginx2root CVEs (CVE-2026-123007 and others); keep at or above it.
FROM nginx:1.30.7-alpine

# Production default, so the CSP header never ships with an unfilled ${FRAME_ANCESTORS}.
# A local run against the ik2 dev stack passes -e FRAME_ANCESTORS=http://localhost:8080.
ENV FRAME_ANCESTORS=https://www.ivankristianto.com
# Substitute only this variable, so an env var the host injects can't rewrite the config.
ENV NGINX_ENVSUBST_FILTER=^FRAME_ANCESTORS$

COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template

# The whitelist. Copy only what a visitor loads, file by file, so a tool's
# README, manifest or env file never reaches the web root.
COPY shared/tokens.css shared/lab.css /srv/lab/shared/
COPY experiments/font-split/index.html /srv/lab/experiments/font-split/
COPY experiments/a2ui-playground/index.html experiments/a2ui-playground/playground.css experiments/a2ui-playground/app.js experiments/a2ui-playground/protocol.js experiments/a2ui-playground/evaluate.js experiments/a2ui-playground/render.js experiments/a2ui-playground/presets.js experiments/a2ui-playground/providers.js /srv/lab/experiments/a2ui-playground/
COPY experiments/embed-preview/index.html experiments/embed-preview/embed-preview.css experiments/embed-preview/app.js experiments/embed-preview/lookup.js experiments/embed-preview/microlink.js experiments/embed-preview/oembed.js experiments/embed-preview/parse.js experiments/embed-preview/fields.js experiments/embed-preview/render.js experiments/embed-preview/tags.js experiments/embed-preview/url.js experiments/embed-preview/text.js experiments/embed-preview/messages.js experiments/embed-preview/sample.js /srv/lab/experiments/embed-preview/

# 127.0.0.1, not localhost: the template replaces the packaged default.conf, so
# nginx listens on IPv4 only and localhost (::1 first) would be refused.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O - http://127.0.0.1/healthz || exit 1
