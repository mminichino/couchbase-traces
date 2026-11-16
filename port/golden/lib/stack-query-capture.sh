#!/usr/bin/env bash
# Query-parity stack (ClickHouse + Couchbase) solely to capture Couchbase goldens.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$HERE/../../.." && pwd -P)
STACK="$ROOT/port/ingest-parity"
GOLDEN_LIB="$ROOT/port/golden/lib"
PROJECT=cbt-golden-query-capture
export CBT_PARITY_COUCHBASE_CONTAINER=cbt-golden-query-couchbase

# shellcheck source=compose-images.sh
source "$GOLDEN_LIB/compose-images.sh"

log() { printf '[golden-query-capture] %s\n' "$*" >&2; }

port_busy() { nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }
pick_port() {
  local port
  for port in "$@"; do
    if ! port_busy "$port"; then printf '%s' "$port"; return 0; fi
  done
  return 1
}

compose() { docker compose -p "$PROJECT" -f "$STACK/docker-compose.yml" "$@"; }

cleanup() {
  compose down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -z "${GOLDEN_CAPTURE_DIR:-}" ] || [ -z "${GOLDEN_ANCHOR_MS:-}" ]; then
  log "GOLDEN_CAPTURE_DIR and GOLDEN_ANCHOR_MS are required"
  exit 1
fi

node "$ROOT/.yarn/releases/yarn-4.13.0.cjs" --cwd "$ROOT/packages/common-utils" build

compose down -v >/dev/null 2>&1 || true
CH_HTTP_PORT=$(pick_port 18123 28123 38123) || exit 1
CB_QUERY_PORT=$(pick_port 18093 28093 38093 48093) || exit 1
OTLP_PORT=$(pick_port 14318 24318 34318) || exit 1
export CH_HTTP_PORT CB_QUERY_PORT OTLP_PORT

log "Building images"
golden_compose_build_ingest "$ROOT"
golden_compose_build_collector "$ROOT" cbt-golden-collector:local

compose up -d ch-server couchbase
CBT_PARITY_COUCHBASE_CONTAINER="$CBT_PARITY_COUCHBASE_CONTAINER" "$STACK/init.sh"

for _attempt in 1 2 3 4 5; do
  if compose run --rm --no-deps ingest \
    node packages/ingest/dist/setup/cli.js \
    --create-bucket --create-users --bucket-ram-mb 1024 --index-replicas 0; then
    break
  fi
  sleep 5
done

for table in otel_logs otel_traces otel_metrics_gauge otel_metrics_sum otel_metrics_histogram otel_metrics_exponential_histogram otel_sessions; do
  docker exec "$CBT_PARITY_COUCHBASE_CONTAINER" curl -s -u Administrator:cbt-test-admin \
    http://127.0.0.1:8093/query/service -H 'content-type: application/json' \
    -d "{\"statement\":\"CREATE PRIMARY INDEX IF NOT EXISTS ON \`otel\`.\`default\`.\`${table}\`\"}" \
    | grep -q '"status": *"success"'
done

compose up -d ingest collector

token=0123456789abcdef0123456789abcdef
deadline=$((SECONDS + 120))
until compose exec -T ingest node -e "
fetch('http://127.0.0.1:4320/health', { headers: { authorization: 'Bearer ${token}' } })
  .then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))
"; do
  [ "$SECONDS" -ge "$deadline" ] && exit 1
  sleep 2
done

export OTLP_PORT GOLDEN_ANCHOR_MS
PARITY_WINDOW=$(node "$GOLDEN_LIB/dataset.mjs")
export PARITY_WINDOW

cb_count() {
  node -e "
    const res = await fetch('http://127.0.0.1:${CB_QUERY_PORT}/query/service', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from('Administrator:cbt-test-admin').toString('base64'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        statement: 'SELECT RAW COUNT(*) FROM \`otel\`.\`default\`.\`' + process.argv[1] + '\`',
      }),
    });
    const body = await res.json();
    process.stdout.write(String(body.results[0]));
  " "$1"
}

deadline=$((SECONDS + 180))
while [ "$SECONDS" -lt "$deadline" ]; do
  if [ "$(cb_count otel_logs)" = "10000" ] && [ "$(cb_count otel_traces)" = "5000" ]; then
    break
  fi
  sleep 3
done

export CB_URL="http://127.0.0.1:${CB_QUERY_PORT}"
node "$GOLDEN_LIB/capture-query.mjs"

CHART_SLICES=(search traces sessions metrics charts presets)
for slice in "${CHART_SLICES[@]}"; do
  PARITY_SLICE="$slice" node "$GOLDEN_LIB/charts-runner.mjs" capture "$slice"
done

log "capture complete"
