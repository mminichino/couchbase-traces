#!/usr/bin/env bash
# Ingest-parity stack capture (Couchbase document summaries).
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$HERE/../../.." && pwd -P)
STACK="$ROOT/port/ingest-parity"
GOLDEN_LIB="$ROOT/port/golden/lib"
PROJECT=cbt-golden-ingest-capture
export CBT_PARITY_COUCHBASE_CONTAINER=cbt-golden-ingest-couchbase

source "$GOLDEN_LIB/compose-images.sh"

log() { printf '[golden-ingest-capture] %s\n' "$*" >&2; }

port_busy() { nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }
pick_port() {
  for port in "$@"; do
    if ! port_busy "$port"; then printf '%s' "$port"; return 0; fi
  done
  return 1
}

compose() { docker compose -p "$PROJECT" -f "$STACK/docker-compose.yml" "$@"; }
cleanup() { compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -n "${GOLDEN_CAPTURE_DIR:-}" ] || { log "GOLDEN_CAPTURE_DIR required"; exit 1; }

compose down -v >/dev/null 2>&1 || true
CH_HTTP_PORT=$(pick_port 8123 18123) || exit 1
CB_QUERY_PORT=$(pick_port 18093 28093) || exit 1
OTLP_PORT=$(pick_port 4318 14318) || exit 1
export CH_HTTP_PORT CB_QUERY_PORT OTLP_PORT

golden_compose_build_ingest "$ROOT"
golden_compose_build_collector "$ROOT" cbt-golden-collector:local

compose up -d ch-server couchbase
"$STACK/init.sh"

for _attempt in 1 2 3 4 5; do
  compose run --rm --no-deps ingest \
    node packages/ingest/dist/setup/cli.js \
    --create-bucket --create-users --bucket-ram-mb 1024 --index-replicas 0 && break
  sleep 5
done

for table in otel_logs hyperdx_sessions otel_traces otel_metrics_gauge otel_metrics_sum \
  otel_metrics_histogram otel_metrics_exponential_histogram otel_metrics_summary; do
  docker exec "$CBT_PARITY_COUCHBASE_CONTAINER" curl -s -u Administrator:cbt-test-admin \
    http://127.0.0.1:8093/query/service -H 'content-type: application/json' \
    -d "{\"statement\":\"CREATE PRIMARY INDEX IF NOT EXISTS ON \`otel\`.\`default\`.\`${table}\`\"}" \
    | grep -q '"status": *"success"'
done

compose up -d ingest collector

token=0123456789abcdef0123456789abcdef
until compose exec -T ingest node -e "
fetch('http://127.0.0.1:4320/health', { headers: { authorization: 'Bearer ${token}' } })
  .then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))
"; do sleep 2; done

export GOLDEN_ANCHOR_MS="${GOLDEN_ANCHOR_MS:-$(node "$GOLDEN_LIB/anchor.mjs" print | tail -1)}"
payload=$(GOLDEN_ANCHOR_MS="$GOLDEN_ANCHOR_MS" node "$STACK/payloads.mjs")
post() {
  node -e "
    const body = JSON.parse(process.argv[1])[process.argv[2]];
    const res = await fetch('http://127.0.0.1:${OTLP_PORT}' + process.argv[3], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) process.exit(1);
  " "$payload" "$1" "$2"
}
post logs /v1/logs
post rrweb /v1/logs
post traces /v1/traces
post metrics /v1/metrics

deadline=$((SECONDS + 120))
while [ "$SECONDS" -lt "$deadline" ]; do
  if [ "$(curl -sf "http://127.0.0.1:${CH_HTTP_PORT}/?user=parity&password=parity" --data 'SELECT count() FROM parity.otel_logs FORMAT TabSeparated')" = "4" ]; then
    break
  fi
  sleep 2
done

export CB_URL="http://127.0.0.1:${CB_QUERY_PORT}"
GOLDEN_ANCHOR_MS="${GOLDEN_ANCHOR_MS:-$(node "$GOLDEN_LIB/anchor.mjs" print | tail -1)}" \
  node "$GOLDEN_LIB/capture-ingest.mjs"

log "ingest capture complete"
