## base #############################################################################################
ARG OTEL_COLLECTOR_VERSION=0.155.0
ARG OTEL_COLLECTOR_CORE_VERSION=1.61.0

FROM otel/opentelemetry-collector-opampsupervisor:${OTEL_COLLECTOR_VERSION} AS supervisor
FROM hairyhenderson/gomplate:v4.3.3-alpine AS gomplate

# Build the custom Couchbase Traces collector binary using OCB (OpenTelemetry Collector Builder).
# This replaces the pre-built otel/opentelemetry-collector-contrib image so we can
# include custom receiver/processor components alongside the standard contrib ones.
# Note: Build context must be repo root (use: docker build -f docker/otel-collector/Dockerfile .)
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

# From: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/aa5c3aa4c7ec174361fcaf908de8eaca72263078/cmd/opampsupervisor/Dockerfile#L18
FROM alpine:3.23@sha256:25109184c71bdad752c8312a8623239686a9a2071e8825f20acb8f2198c3f659 AS base

ARG USER_UID=10001
ARG USER_GID=10001

# Install certs, create user/group, and make the writable data dir
RUN apk add --no-cache ca-certificates && \
  addgroup -S -g ${USER_GID} otel && \
  adduser  -S -u ${USER_UID} -G otel otel && \
  install -d -m 0777 -o ${USER_UID} -g ${USER_GID} /etc/otel/supervisor-data && \
  install -d -m 0755 -o ${USER_UID} -g ${USER_GID} /etc/otelcol-contrib

# Copy gomplate binary from the gomplate image
COPY --from=gomplate /bin/gomplate /usr/local/bin/gomplate

USER ${USER_UID}:${USER_GID}

COPY --from=supervisor --chmod=755 /usr/local/bin/opampsupervisor /opampsupervisor
COPY --from=ocb-builder --chmod=755 /build/output/otelcol-couchbase-traces /otelcontribcol

# Copy entrypoint script
COPY --chmod=755 docker/otel-collector/entrypoint.sh /entrypoint.sh

## dev ##############################################################################################
FROM base AS dev

LABEL org.opencontainers.image.vendor="Couchbase Traces" \
  org.opencontainers.image.title="Couchbase Traces OTel Collector (Dev)" \
  org.opencontainers.image.description="OpenTelemetry Collector for Couchbase Traces development" \
  org.opencontainers.image.source="https://github.com/mminichino/couchbase-traces" \
  org.opencontainers.image.licenses="MIT"

COPY --chown=10001:10001 docker/otel-collector/config.yaml /etc/otelcol-contrib/config.yaml
COPY --chown=10001:10001 docker/otel-collector/config.standalone.yaml /etc/otelcol-contrib/standalone-config.yaml
COPY --chown=10001:10001 docker/otel-collector/config.standalone.auth.yaml /etc/otelcol-contrib/standalone-auth-config.yaml
COPY --chown=10001:10001 docker/otel-collector/config.standalone.oidc.yaml /etc/otelcol-contrib/standalone-oidc-config.yaml
COPY --chown=10001:10001 docker/otel-collector/supervisor_docker.yaml.tmpl /etc/otel/supervisor.yaml.tmpl

EXPOSE 4317 4318 13133 8125/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:13133/ || exit 1

ENTRYPOINT ["/entrypoint.sh", "/opampsupervisor"]

## prod #############################################################################################
FROM base AS prod

LABEL org.opencontainers.image.vendor="Couchbase Traces" \
  org.opencontainers.image.title="Couchbase Traces OTel Collector" \
  org.opencontainers.image.description="OpenTelemetry Collector for Couchbase Traces observability platform" \
  org.opencontainers.image.source="https://github.com/mminichino/couchbase-traces" \
  org.opencontainers.image.licenses="MIT"

COPY --chown=10001:10001 docker/otel-collector/config.yaml /etc/otelcol-contrib/config.yaml
COPY --chown=10001:10001 docker/otel-collector/config.standalone.yaml /etc/otelcol-contrib/standalone-config.yaml
COPY --chown=10001:10001 docker/otel-collector/config.standalone.auth.yaml /etc/otelcol-contrib/standalone-auth-config.yaml
COPY --chown=10001:10001 docker/otel-collector/config.standalone.oidc.yaml /etc/otelcol-contrib/standalone-oidc-config.yaml
COPY --chown=10001:10001 docker/otel-collector/supervisor_docker.yaml.tmpl /etc/otel/supervisor.yaml.tmpl

EXPOSE 4317 4318 13133 8125/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:13133/ || exit 1

ENTRYPOINT ["/entrypoint.sh", "/opampsupervisor"]