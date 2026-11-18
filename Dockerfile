# syntax=docker/dockerfile:1.7

FROM nginx:1.27-alpine

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

# 127.0.0.1, not localhost: the template replaces the packaged default.conf, so
# nginx listens on IPv4 only and localhost (::1 first) would be refused.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O - http://127.0.0.1/healthz || exit 1
