#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Dev stack setup for `yarn dev`
# ---------------------------------------------------------------------------
# Sets this worktree's slot and ports (see scripts/slots.sh for the scheme),
# then prepares its dev stack: clears stale Next.js output, registers the slot
# with the dev portal, and archives its logs on exit.
#
# Only source this when starting or stopping the stack. Tools that just need
# the ports should use scripts/with-slots.sh, which has no side effects.
#
# Usage:
#   source scripts/dev-env.sh        # export env vars into current shell
#   . scripts/dev-env.sh             # same thing, POSIX style
#
# Override the slot manually:
#   CBT_DEV_SLOT=5 . scripts/dev-env.sh
# ---------------------------------------------------------------------------

# shellcheck source=./slots.sh
. "${BASH_SOURCE[0]%/*}/slots.sh"
hdx_dev_ports

# Git metadata for portal labels
CBT_DEV_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
CBT_DEV_WORKTREE="$(basename "$PWD")"

# --- Shared NX build cache across all worktrees ---
# NX cache is content-hash based so changed files get cache misses (correct
# behavior). Unchanged packages reuse cached output regardless of worktree.
NX_CACHE_DIRECTORY="${HOME}/.config/hyperdx/nx-cache"
mkdir -p "$NX_CACHE_DIRECTORY"

export CBT_DEV_BRANCH
export CBT_DEV_WORKTREE
export NX_CACHE_DIRECTORY

# --- Clean up stale Next.js state from previous sessions ---
# Nuke the entire .next directory to avoid stale webpack bundles, lock files,
# and cached module resolutions after common-utils rebuilds.
rm -rf "${PWD}/packages/app/.next" 2>/dev/null || true

# --- Set up directories for portal discovery + logs ---
CBT_DEV_SLOTS_DIR="${HOME}/.config/hyperdx/dev-slots"
CBT_DEV_LOGS_DIR="${CBT_DEV_SLOTS_DIR}/${CBT_DEV_SLOT}/logs"
mkdir -p "$CBT_DEV_LOGS_DIR"

export CBT_DEV_SLOTS_DIR
export CBT_DEV_LOGS_DIR

cat > "${CBT_DEV_SLOTS_DIR}/${CBT_DEV_SLOT}.json" <<EOF
{
  "slot": ${CBT_DEV_SLOT},
  "branch": "${CBT_DEV_BRANCH}",
  "worktree": "${CBT_DEV_WORKTREE}",
  "worktreePath": "${PWD}",
  "apiPort": ${CBT_API_PORT},
  "appPort": ${CBT_APP_PORT},
  "opampPort": ${CBT_OPAMP_PORT},
  "chHttpPort": ${CBT_DEV_CH_HTTP_PORT},
  "chNativePort": ${CBT_DEV_CH_NATIVE_PORT},
  "otelHttpPort": ${CBT_DEV_OTEL_HTTP_PORT},
  "otelGrpcPort": ${CBT_DEV_OTEL_GRPC_PORT},
  "otelJsonHttpPort": ${CBT_DEV_OTEL_JSON_HTTP_PORT},
  "logsDir": "${CBT_DEV_LOGS_DIR}",
  "pid": $$,
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# --- Start dev portal in background if port 9900 is free ---
# shellcheck source=./ensure-dev-portal.sh
source "${BASH_SOURCE[0]%/*}/ensure-dev-portal.sh"

# Clean up slot file and archive logs on exit
_hdx_cleanup_slot() {
  if [ -n "$CBT_PORTAL_PID" ] && kill -0 "$CBT_PORTAL_PID" 2>/dev/null; then
    kill "$CBT_PORTAL_PID" 2>/dev/null || true
  fi
  rm -f "${CBT_DEV_SLOTS_DIR}/${CBT_DEV_SLOT}.json" 2>/dev/null || true
  # Archive logs to history instead of deleting
  if [ -d "$CBT_DEV_LOGS_DIR" ] && [ -n "$(ls -A "$CBT_DEV_LOGS_DIR" 2>/dev/null)" ]; then
    _ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _hist="${CBT_DEV_SLOTS_DIR}/${CBT_DEV_SLOT}/history/dev-${_ts}"
    mkdir -p "$_hist"
    mv "$CBT_DEV_LOGS_DIR"/* "$_hist/" 2>/dev/null || true
    cat > "$_hist/meta.json" <<METAEOF
{"worktree":"${CBT_DEV_WORKTREE}","branch":"${CBT_DEV_BRANCH}","worktreePath":"${PWD}"}
METAEOF
  fi
  rm -rf "$CBT_DEV_LOGS_DIR" 2>/dev/null || true
}
trap _hdx_cleanup_slot EXIT

# Print summary
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Couchbase Traces Dev Environment — Slot ${CBT_DEV_SLOT}$(printf '%*s' $((27 - ${#CBT_DEV_SLOT})) '')║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Branch:     ${CBT_DEV_BRANCH}$(printf '%*s' $((45 - ${#CBT_DEV_BRANCH})) '')║"
echo "║  Worktree:   ${CBT_DEV_WORKTREE}$(printf '%*s' $((45 - ${#CBT_DEV_WORKTREE})) '')║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  App (Next.js)     http://localhost:${CBT_APP_PORT}$(printf '%*s' $((22 - ${#CBT_APP_PORT})) '')║"
echo "║  API               http://localhost:${CBT_API_PORT}$(printf '%*s' $((22 - ${#CBT_API_PORT})) '')║"
echo "║  Couchbase UI      http://localhost:${CBT_DEV_CB_MGMT_PORT}$(printf '%*s' $((22 - ${#CBT_DEV_CB_MGMT_PORT})) '')║"
echo "║  Ingest            http://localhost:${CBT_DEV_INGEST_PORT}$(printf '%*s' $((22 - ${#CBT_DEV_INGEST_PORT})) '')║"
echo "║  OTel HTTP         http://localhost:${CBT_DEV_OTEL_HTTP_PORT}$(printf '%*s' $((22 - ${#CBT_DEV_OTEL_HTTP_PORT})) '')║"
echo "║  OTel gRPC         localhost:${CBT_DEV_OTEL_GRPC_PORT}$(printf '%*s' $((29 - ${#CBT_DEV_OTEL_GRPC_PORT})) '')║"
echo "║  OpAMP             localhost:${CBT_OPAMP_PORT}$(printf '%*s' $((29 - ${#CBT_OPAMP_PORT})) '')║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Portal:  http://localhost:${CBT_PORTAL_PORT}$(printf '%*s' $((28 - ${#CBT_PORTAL_PORT})) '')║"
echo "╚══════════════════════════════════════════════════════════════╝"
