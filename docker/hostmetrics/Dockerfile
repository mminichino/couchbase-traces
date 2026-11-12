## base #############################################################################################
FROM otel/opentelemetry-collector-contrib:0.90.0 AS base


## dev #############################################################################################
FROM base as dev

LABEL org.opencontainers.image.vendor="Couchbase Traces" \
      org.opencontainers.image.title="Couchbase Traces Host Metrics (Dev)" \
      org.opencontainers.image.description="Host metrics collector for Couchbase Traces development" \
      org.opencontainers.image.source="https://github.com/mminichino/couchbase-traces" \
      org.opencontainers.image.licenses="MIT"

COPY ./config.dev.yaml /etc/otelcol-contrib/config.yaml


## prod #############################################################################################
FROM base as prod

LABEL org.opencontainers.image.vendor="Couchbase Traces" \
      org.opencontainers.image.title="Couchbase Traces Host Metrics" \
      org.opencontainers.image.description="Host metrics collector for Couchbase Traces observability platform" \
      org.opencontainers.image.source="https://github.com/mminichino/couchbase-traces" \
      org.opencontainers.image.licenses="MIT"

COPY ./config.dev.yaml /etc/otelcol-contrib/config.yaml
