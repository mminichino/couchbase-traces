# Couchbase ingest service. Build context is the repository root.
# The native Couchbase SDK needs glibc, so this is bookworm rather than alpine.
FROM node:22.23.4-bookworm-slim

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml tsconfig.base.json ./
COPY .yarn ./.yarn
COPY packages/api/package.json packages/api/package.json
COPY packages/app/package.json packages/app/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/common-utils/package.json packages/common-utils/package.json
COPY packages/hdx-eval/package.json packages/hdx-eval/package.json
COPY packages/ingest/package.json packages/ingest/package.json
COPY packages/otel-collector/package.json packages/otel-collector/package.json

RUN corepack enable && yarn install --mode=skip-build

COPY packages/common-utils packages/common-utils
RUN yarn workspace @couchbase-traces/common-utils build

COPY packages/ingest packages/ingest
RUN yarn workspace @couchbase-traces/ingest build

LABEL org.opencontainers.image.vendor="Couchbase Traces" \
      org.opencontainers.image.title="Couchbase Traces Ingest" \
      org.opencontainers.image.description="Couchbase Traces OTLP ingest service writing to Couchbase" \
      org.opencontainers.image.source="https://github.com/mminichino/couchbase-traces" \
      org.opencontainers.image.licenses="MIT"

# Release version and commit (set by make build-* and
# scripts/release/release-images.sh; empty for ad hoc builds).
ARG CODE_VERSION
ARG GIT_SHA
LABEL org.opencontainers.image.version="$CODE_VERSION" \
      org.opencontainers.image.revision="$GIT_SHA"
# Read by `setup` as the appVersion marker and reported by the service.
ENV CODE_VERSION=$CODE_VERSION

EXPOSE 4320
CMD ["node", "packages/ingest/dist/index.js"]
