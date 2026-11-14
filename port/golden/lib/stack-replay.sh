#!/usr/bin/env bash
# Couchbase-only stack for golden replay.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$HERE/../../.." && pwd -P)
GOLDEN="$ROOT/port/golden"
GOLDEN_LIB="$GOLDEN/lib"
PROJECT=cbt-golden-replay
export CBT_GOLDEN_COUCHBASE_CONTAINER=cbt-golden-replay-couchbase

source "$GOLDEN_LIB/compose-images.sh"

log() { printf '[golden-replay] %s\n' "$*" >&2; }

port_busy() { nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }
pick_port() {
  for port in "$@"; do
    if ! port_busy "$port"; then printf '%s' "$port"; return 0; fi
  done
  return 1
}

compose() { docker compose -p "$PROJECT" -f "$GOLDEN/docker-compose.yml" "$@"; }
cleanup() { compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

SUITE_FILTER="${GOLDEN_SUITE:-all}"
ANCHOR_MS=$(node "$GOLDEN_LIB/anchor.mjs" print | tail -1)
export GOLDEN_ANCHOR_MS="$ANCHOR_MS"

node "$ROOT/.yarn/releases/yarn-4.13.0.cjs" --cwd "$ROOT/packages/common-utils" build

compose down -v >/dev/null 2>&1 || true
CB_QUERY_PORT=$(pick_port 18093 28093 38093) || exit 1
OTLP_PORT=$(pick_port 14318 24318 34318) || exit 1
export CB_QUERY_PORT OTLP_PORT

golden_compose_build_ingest "$ROOT"
golden_compose_build_collector "$ROOT" cbt-golden-collector:local

compose up -d couchbase

CBT_PARITY_COUCHBASE_CONTAINER="$CBT_GOLDEN_COUCHBASE_CONTAINER" \
  CBT_COUCHBASE_ADMIN_PASSWORD=cbt-test-admin \
  "$ROOT/port/ingest-parity/init.sh"

setup_ok=0
for _attempt in 1 2 3 4 5; do
  if compose run --rm --no-deps ingest \
    node packages/ingest/dist/setup/cli.js \
    --create-bucket --create-users --bucket-ram-mb 1024 --index-replicas 0; then
    setup_ok=1
    break
  fi
  sleep 5
done
if [ "$setup_ok" != "1" ]; then
  log "Couchbase setup failed"
  exit 1
fi

for table in otel_logs otel_traces otel_metrics_gauge otel_metrics_sum otel_metrics_histogram otel_metrics_exponential_histogram otel_metrics_summary hyperdx_sessions; do
  docker exec "$CBT_GOLDEN_COUCHBASE_CONTAINER" curl -s -u Administrator:cbt-test-admin \
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
  if [ "$SECONDS" -ge "$deadline" ]; then
    log "Ingest did not become healthy"
    compose logs --tail 80 ingest || true
    exit 1
  fi
  sleep 2
done

export CB_URL="http://127.0.0.1:${CB_QUERY_PORT}"
export GOLDEN_DIR="$GOLDEN"
STACK_INGEST="$ROOT/port/ingest-parity"

# Ingest goldens use the small ingest-parity OTLP batch — load and compare first.
payload=$(GOLDEN_ANCHOR_MS="$ANCHOR_MS" node "$STACK_INGEST/payloads.mjs")
post_parity() {
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
post_parity logs /v1/logs
post_parity rrweb /v1/logs
post_parity traces /v1/traces
post_parity metrics /v1/metrics
sleep 5

run_suite() {
  local name=$1
  case "$name" in
    ingest) node "$GOLDEN_LIB/replay-ingest.mjs" ;;
    lucene|functions) node "$GOLDEN_LIB/replay-query.mjs" ;;
    charts)
      for slice in search traces sessions metrics charts presets; do
        node "$GOLDEN_LIB/charts-runner.mjs" replay "$slice"
      done
      ;;
    alerts|external_api|mcp|cli)
      log "server suite $name: replay not wired (0 goldens expected)"
      ;;
    *) log "unknown suite $name"; return 2 ;;
  esac
}

if [ "$SUITE_FILTER" = "all" ] || [ "$SUITE_FILTER" = "ingest" ]; then
  run_suite ingest
fi

if [ "$SUITE_FILTER" = "all" ] || [ "$SUITE_FILTER" != "ingest" ]; then
  # Ingest-parity payloads overlap the query window; wipe before loading the
  # query-parity dataset so lucene/functions/charts match capture (clean stack).
  if [ "$SUITE_FILTER" = "all" ] || [ "$SUITE_FILTER" = "ingest" ]; then
    log "Clearing collections after ingest suite"
    for table in otel_logs otel_traces otel_metrics_gauge otel_metrics_sum \
      otel_metrics_histogram otel_metrics_exponential_histogram otel_metrics_summary \
      hyperdx_sessions; do
      docker exec "$CBT_GOLDEN_COUCHBASE_CONTAINER" curl -s -u Administrator:cbt-test-admin \
        http://127.0.0.1:8093/query/service -H 'content-type: application/json' \
        -d "{\"statement\":\"DELETE FROM \`otel\`.\`default\`.\`${table}\`\"}" \
        | grep -q '"status": *"success"'
    done
    # Let indexes settle after mass delete.
    sleep 3
  fi

  # Query/chart goldens use the anchored query-parity dataset (load once).
  PARITY_WINDOW=$(GOLDEN_ANCHOR_MS="$ANCHOR_MS" OTLP_PORT="$OTLP_PORT" \
    node "$GOLDEN_LIB/dataset.mjs")
  export PARITY_WINDOW
  # Wait until the full dataset is queryable (same gate as capture).
  cb_count() {
    node -e "
      const res = await fetch(process.env.CB_URL + '/query/service', {
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
  if [ "$(cb_count otel_logs)" != "10000" ] || [ "$(cb_count otel_traces)" != "5000" ]; then
    log "Query dataset did not reach expected counts (logs=$(cb_count otel_logs) traces=$(cb_count otel_traces))"
    exit 1
  fi

  if [ "$SUITE_FILTER" = "all" ]; then
    run_suite lucene
    run_suite charts
  else
    run_suite "$SUITE_FILTER"
  fi
fi

log "replay ok"
