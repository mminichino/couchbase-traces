# Starts several services in a single container
# For production build:
# - API (Node)
# - App (Frontend)
# For all-in-one build:
# - Couchbase (external)
# - Otel Collector (otelcol)

ARG NODE_VERSION=22.23.4
ARG COUCHBASE_IMAGE=couchbase/server:enterprise-8.0.3
ARG EVAL_STORE_VERSION=26.8.36.3
ARG OTEL_COLLECTOR_VERSION=0.155.0
ARG OTEL_COLLECTOR_CORE_VERSION=1.61.0

# base #############################################################################################
# == Otel Collector Image ==
FROM otel/opentelemetry-collector-opampsupervisor:${OTEL_COLLECTOR_VERSION} AS otel_collector_opampsupervisor_base
FROM kukymbr/goose-docker@sha256:0cd025636df126e7f66472861ca4db3683bc649be46cd1f6ef1a316209058e23 AS goose

# Build the custom Couchbase Traces collector binary using OCB (OpenTelemetry Collector Builder).
# This replaces the pre-built otel/opentelemetry-collector-contrib image so we can
# include custom receiver/processor components alongside the standard contrib ones.
# Note: The official OCB image may ship an older Go than the contrib modules require,
# so we copy the ocb binary into a golang base with a newer toolchain.
FROM otel/opentelemetry-collector-builder:${OTEL_COLLECTOR_VERSION} AS ocb-bin
FROM golang:1.26-alpine AS ocb-builder
ARG OTEL_COLLECTOR_VERSION
ARG OTEL_COLLECTOR_CORE_VERSION
COPY --from=ocb-bin /usr/local/bin/ocb /usr/local/bin/ocb
WORKDIR /build
COPY packages/otel-collector/builder-config.yaml .
RUN --mount=type=cache,target=/go/pkg/mod,id=ocb-gomod \
    --mount=type=cache,target=/root/.cache/go-build,id=ocb-gobuild \
    sed -i "s/__OTEL_COLLECTOR_VERSION__/${OTEL_COLLECTOR_VERSION}/g; s/__OTEL_COLLECTOR_CORE_VERSION__/${OTEL_COLLECTOR_CORE_VERSION}/g" builder-config.yaml && \
    CGO_ENABLED=0 ocb --config=builder-config.yaml

# Build the Go migration tool with full TLS support (upstream ClickHouse tooling)
FROM golang:1.26-alpine AS migrate-builder
WORKDIR /build
COPY packages/otel-collector/go.mod packages/otel-collector/go.sum ./
RUN go mod download
COPY packages/otel-collector/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /migrate ./cmd/migrate

FROM node:${NODE_VERSION}-bookworm-slim AS node_bookworm
WORKDIR /ingest
COPY .yarn ./.yarn
COPY .yarnrc.yml yarn.lock package.json tsconfig.base.json ./
COPY packages/common-utils/package.json packages/common-utils/package.json
COPY packages/ingest/package.json packages/ingest/package.json
RUN corepack enable && yarn install --mode=skip-build
COPY packages/common-utils packages/common-utils
RUN yarn workspace @couchbase-traces/common-utils run build
COPY packages/ingest packages/ingest
RUN yarn workspace @couchbase-traces/ingest run build && \
    yarn workspaces focus @couchbase-traces/ingest --production

FROM node:${NODE_VERSION}-alpine AS node_base

WORKDIR /app

COPY .yarn ./.yarn
COPY .yarnrc.yml yarn.lock package.json nx.json .prettierrc .prettierignore ./tsconfig.base.json ./
# Only copy package.json for workspace resolution during yarn install;
# full source is copied in the build stages that need it.
COPY ./packages/common-utils/package.json ./packages/common-utils/package.json
COPY ./packages/api/jest.config.js ./packages/api/tsconfig.json ./packages/api/tsconfig.build.json ./packages/api/package.json ./packages/api/
COPY ./packages/app/jest.config.js ./packages/app/tsconfig.json ./packages/app/tsconfig.build.json ./packages/app/package.json ./packages/app/next.config.mjs ./packages/app/mdx.d.ts ./packages/app/css.d.ts ./packages/app/eslint.config.mjs ./packages/app/

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

# Use BuildKit cache mount to persist Yarn download cache across builds,
# so unchanged packages aren't re-downloaded even when yarn.lock changes.
RUN --mount=type=cache,target=/root/.yarn/berry/cache,id=yarn-cache \
    yarn install --mode=skip-build && yarn cache clean


## common-utils builder ############################################################################
# Separate stage so common-utils build is cached independently of API/App source changes.
FROM node_base AS common-utils-builder

COPY ./packages/common-utils ./packages/common-utils
RUN yarn workspace @couchbase-traces/common-utils run build


## API/APP Builder Image ##########################################################################
FROM node_base AS builder

WORKDIR /app

# Copy pre-built common-utils from its dedicated build stage
COPY --from=common-utils-builder /app/packages/common-utils ./packages/common-utils

COPY --from=api ./src ./packages/api/src
COPY --from=api ./bin ./packages/api/bin
COPY --from=app ./src ./packages/app/src
COPY --from=app ./pages ./packages/app/pages
COPY --from=app ./public ./packages/app/public
COPY --from=app ./styles ./packages/app/styles
COPY --from=app ./types ./packages/app/types
# next build finds instrumentation.ts only next to pages/, not under src/
COPY --from=app ./instrumentation.ts ./instrumentation-client.ts ./packages/app/
# Build inputs for public/whats-new.json, generated by next.config.mjs for the
# in-app "What's new" section: the root changelog it parses and the parser
# itself. WORKDIR is /app, and next.config resolves the changelog as
# /app/packages/app/../../CHANGELOG.md. The build fails loudly if either is
# missing (see next.config.mjs).
COPY ./CHANGELOG.md ./CHANGELOG.md
COPY --from=app ./scripts ./packages/app/scripts

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_STANDALONE=true
ENV NEXT_PUBLIC_IS_LOCAL_MODE=false
RUN yarn workspace @couchbase-traces/api run build && \
    yarn workspace @couchbase-traces/app run build
RUN --mount=type=cache,target=/root/.yarn/berry/cache,id=yarn-cache \
    rm -rf node_modules && yarn workspaces focus @couchbase-traces/api --production


# prod ############################################################################################
FROM node:${NODE_VERSION}-alpine AS prod

LABEL org.opencontainers.image.vendor="Couchbase Traces" \
      org.opencontainers.image.title="Couchbase Traces Production" \
      org.opencontainers.image.description="Couchbase Traces production image with API and App services" \
      org.opencontainers.image.source="https://github.com/mminichino/couchbase-traces" \
      org.opencontainers.image.licenses="MIT"

# Release version and commit (set by make build-* and
# scripts/release/release-images.sh; empty for ad hoc builds).
ARG CODE_VERSION
ARG GIT_SHA
LABEL org.opencontainers.image.version="$CODE_VERSION" \
      org.opencontainers.image.revision="$GIT_SHA"

ENV CODE_VERSION=$CODE_VERSION
ENV OTEL_RESOURCE_ATTRIBUTES="service.version=$CODE_VERSION"
# Service name for Couchbase Traces's own telemetry, sent only when CBT_API_KEY or
# OTEL_EXPORTER_OTLP_HEADERS is set. The API and alert task use it as is, the
# Next.js server adds "-next". Override it with -e OTEL_SERVICE_NAME=<name>.
ENV OTEL_SERVICE_NAME=hdx-oss-app
ENV NODE_ENV=production

# Remove package managers from production image (not needed at runtime)
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg

USER node

# Set up API and App
WORKDIR /app
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/api/build ./packages/api/build
COPY --chown=node:node --from=builder /app/packages/api/bin ./packages/api/bin
COPY --chown=node:node --from=builder /app/packages/common-utils/dist ./packages/common-utils/dist
COPY --chown=node:node --from=node_base /app/packages/common-utils/node_modules ./packages/common-utils/node_modules
COPY --chown=node:node --from=builder /app/packages/app/.next/standalone ./packages/app
COPY --chown=node:node --from=builder /app/packages/app/.next/static ./packages/app/packages/app/.next/static
COPY --chown=node:node --from=builder /app/packages/app/public ./packages/app/packages/app/public

# Set up start scripts
COPY --chown=node:node --from=hyperdx ./refresh-env.js /etc/local/refresh-env.js
COPY --chown=node:node --from=hyperdx ./entry.prod.sh /etc/local/entry.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8000/health',r=>r.statusCode===200?process.exit(0):process.exit(1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["sh", "/etc/local/entry.sh"]

# all-in-one base ############################################################################################
FROM hairyhenderson/gomplate:v4.3.3-alpine AS gomplate
FROM ${COUCHBASE_IMAGE} AS all-in-one-base

ARG CODE_VERSION
ARG COUCHBASE_IMAGE
ARG USER_UID=10001
ARG USER_GID=10001

ENV CODE_VERSION=$CODE_VERSION
ENV OTEL_RESOURCE_ATTRIBUTES="service.version=$CODE_VERSION"
ENV OTEL_SERVICE_NAME=hdx-oss-app

COPY --from=ocb-builder --chmod=755 /build/output/otelcol-couchbase-traces /otelcontribcol
COPY --from=otel_collector_opampsupervisor_base --chmod=755 /usr/local/bin/opampsupervisor /usr/local/bin/opampsupervisor

# Node.js runtime (glibc) for API, app, and ingest
COPY --from=node_bookworm --link /usr/local/bin /usr/local/bin
COPY --from=node_bookworm --link /usr/local/lib /usr/local/lib
COPY --from=node_bookworm /usr/local/include /usr/local/include

COPY --from=otel-collector ./config.yaml /etc/otelcol-contrib/config.yaml
COPY --from=otel-collector ./supervisor_docker.yaml.tmpl /etc/otel/supervisor.yaml.tmpl
COPY --from=otel-collector --chmod=755 ./entrypoint.sh /otel-entrypoint.sh
COPY --from=gomplate /bin/gomplate /usr/local/bin/gomplate

COPY --from=node_bookworm /ingest /opt/cbt/ingest
COPY --chmod=755 ./docker/couchbase/init.sh /opt/cbt/bin/init.sh

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl openssl && \
    apt-get clean && rm -rf /var/lib/apt/lists/* && \
    groupadd --gid ${USER_GID} otel && \
    useradd --uid ${USER_UID} --gid otel --shell /usr/sbin/nologin otel && \
    mkdir -p /data/cbt && \
    install -d -m 0777 -o ${USER_UID} -g ${USER_GID} /etc/otel/supervisor-data && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production

COPY --from=prod /app /app
COPY --from=hyperdx ./refresh-env.js /etc/local/refresh-env.js

WORKDIR /app

EXPOSE 8080 4317 4318 13133 4320 8091-8097 11210

# all-in-one no auth ############################################################################################
FROM all-in-one-base AS all-in-one-noauth

LABEL org.opencontainers.image.vendor="Couchbase Traces" \
      org.opencontainers.image.title="Couchbase Traces All-in-One (No Auth)" \
      org.opencontainers.image.description="Couchbase Traces all-in-one image with Couchbase and OTel Collector (no authentication)" \
      org.opencontainers.image.source="https://github.com/mminichino/couchbase-traces" \
      org.opencontainers.image.licenses="MIT"

# Release version and commit (set by make build-* and
# scripts/release/release-images.sh; empty for ad hoc builds).
ARG CODE_VERSION
ARG GIT_SHA
LABEL org.opencontainers.image.version="$CODE_VERSION" \
      org.opencontainers.image.revision="$GIT_SHA"

COPY --from=hyperdx ./entry.local.noauth.sh /etc/local/entry.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["sh", "/etc/local/entry.sh"]

# all-in-one with auth ############################################################################################
FROM all-in-one-base AS all-in-one-auth

LABEL org.opencontainers.image.vendor="Couchbase Traces" \
      org.opencontainers.image.title="Couchbase Traces All-in-One (With Auth)" \
      org.opencontainers.image.description="Couchbase Traces all-in-one image with Couchbase Server and OTel Collector (with authentication)" \
      org.opencontainers.image.source="https://github.com/mminichino/couchbase-traces" \
      org.opencontainers.image.licenses="MIT"

# Release version and commit (set by make build-* and
# scripts/release/release-images.sh; empty for ad hoc builds).
ARG CODE_VERSION
ARG GIT_SHA
LABEL org.opencontainers.image.version="$CODE_VERSION" \
      org.opencontainers.image.revision="$GIT_SHA"

COPY --from=hyperdx --chmod=755 ./entry.cbt.sh /etc/local/entry.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# entry.cbt.sh requires bash (pipefail / arrays); do not run under dash.
ENTRYPOINT ["bash", "/etc/local/entry.sh"]

