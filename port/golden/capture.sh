#!/usr/bin/env bash
# Capture Couchbase parity goldens (Phase 10 §5). Requires ClickHouse parity stacks.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd -P)
REPO=$(cd "$HERE/../.." && pwd -P)
PORT="$REPO/port"
LIB="$HERE/lib"

log() { printf '[golden-capture] %s\n' "$*" >&2; }

ANCHOR_ISO=$(node "$LIB/anchor.mjs" print | head -1)
ANCHOR_MS=$(node "$LIB/anchor.mjs" print | tail -1)
export GOLDEN_ANCHOR_MS="$ANCHOR_MS"

STAGING=$(mktemp -d)
cleanup_staging() { rm -rf "$STAGING"; }
trap cleanup_staging EXIT

export GOLDEN_CAPTURE_DIR="$STAGING"

log "Anchor ${ANCHOR_ISO} (${ANCHOR_MS})"
log "Staging ${STAGING}"

if [ "${GOLDEN_SKIP_GATE:-}" = "1" ]; then
  log "GOLDEN_SKIP_GATE=1: skipping parity gate runs (caller must have verified)"
else
  log "Running ingest-parity (gate)"
  "$PORT/ingest-parity/run.sh"

  log "Running query-parity base (lucene + functions)"
  "$PORT/query-parity/run.sh"

  CHART_SLICES=(search traces sessions metrics charts presets)
  for slice in "${CHART_SLICES[@]}"; do
    log "Running query-parity charts slice ${slice}"
    "$PORT/query-parity/run.sh" --slice "$slice"
  done

  log "Running server-parity"
  "$PORT/server-parity/run.sh"
fi

log "Capturing ingest goldens"
"$LIB/stack-ingest-capture.sh"

log "Capturing query goldens"
"$LIB/stack-query-capture.sh"

SERVER_COUNTS=$(GOLDEN_CAPTURE_DIR="$STAGING" node "$LIB/capture-server.mjs")

count_json_files() {
  local dir=$1
  if [ -d "$dir" ]; then
    find "$dir" -maxdepth 1 -name '*.json' | wc -l | tr -d ' '
  else
    echo 0
  fi
}

install_suite_dir() {
  local suite=$1
  local src="$STAGING/$suite"
  local dest="$HERE/$suite"
  if [ -d "$src" ]; then
    rm -rf "$dest"
    cp -R "$src" "$dest"
  fi
  count_json_files "$dest"
}

INGEST_COUNT=$(install_suite_dir ingest)
LUCENE_COUNT=$(install_suite_dir lucene)
FUNCTIONS_COUNT=$(install_suite_dir functions)
CHARTS_COUNT=$(install_suite_dir charts)

read -r ALERTS_COUNT EXTERNAL_API_COUNT MCP_COUNT CLI_COUNT <<EOF
$(node -e "const c=JSON.parse(process.argv[1]);process.stdout.write([c.alerts,c.external_api,c.mcp,c.cli].join(' '))" "$SERVER_COUNTS")
EOF

GIT_SHA=$(git -C "$REPO" rev-parse HEAD)

node -e '
const fs = require("fs");
const [
  outPath, gitSha, anchorIso, anchorMs,
  ingest, lucene, functions, charts,
  alerts, external_api, mcp, cli,
] = process.argv.slice(1);
const manifest = {
  schemaVersion: 1,
  gitSha,
  anchorIso,
  anchorMs: Number(anchorMs),
  capturedAtIso: new Date().toISOString(),
  suites: {
    ingest: Number(ingest),
    lucene: Number(lucene),
    functions: Number(functions),
    charts: Number(charts),
    alerts: Number(alerts),
    external_api: Number(external_api),
    mcp: Number(mcp),
    cli: Number(cli),
  },
};
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
' "$HERE/manifest.json" "$GIT_SHA" "$ANCHOR_ISO" "$ANCHOR_MS" \
  "$INGEST_COUNT" "$LUCENE_COUNT" "$FUNCTIONS_COUNT" "$CHARTS_COUNT" \
  "$ALERTS_COUNT" "$EXTERNAL_API_COUNT" "$MCP_COUNT" "$CLI_COUNT"

log "Wrote manifest.json at commit ${GIT_SHA}"
log "Capture complete"
