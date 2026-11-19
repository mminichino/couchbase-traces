#!/bin/bash
# Run E2E tests in full-stack or local mode
# Full-stack mode (default): API + local Couchbase
# Local mode: Frontend only (no API/Couchbase)
#
# Usage:
#   ./scripts/test-e2e.sh                      # Run all tests in fullstack mode
#   ./scripts/test-e2e.sh --local              # Run in local mode (frontend only)
#   ./scripts/test-e2e.sh --keep-running       # Keep containers running after tests (fast iteration!)
#   ./scripts/test-e2e.sh --ui                 # Run with Playwright UI
#   ./scripts/test-e2e.sh --last-failed        # Run only failed tests
#   ./scripts/test-e2e.sh --headed             # Run with visible browser
#   ./scripts/test-e2e.sh --debug              # Run in debug mode
#   ./scripts/test-e2e.sh --grep "dashboard"   # Run tests matching pattern
#
# Development workflow (recommended):
#   ./scripts/test-e2e.sh --keep-running --ui  # Start containers and open UI
#   # Make changes, tests auto-rerun in UI mode
#   # When done:
#   docker compose -p e2e-<slot> -f packages/app/tests/e2e/docker-compose.yml down -v
#
# All Playwright flags are passed through automatically

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_COMPOSE_FILE="$REPO_ROOT/packages/app/tests/e2e/docker-compose.yml"

# Agent / minimal PATH shells often lack a yarn binary. Playwright webServer
# commands also invoke `yarn`, so put a shim ahead of PATH when needed.
if ! command -v yarn >/dev/null 2>&1; then
  _CBT_YARN_SHIM_DIR="${TMPDIR:-/tmp}/cbt-e2e-yarn-shim"
  mkdir -p "$_CBT_YARN_SHIM_DIR"
  cat > "$_CBT_YARN_SHIM_DIR/yarn" <<EOF
#!/bin/bash
exec node "$REPO_ROOT/.yarn/releases/yarn-4.13.0.cjs" "\$@"
EOF
  chmod +x "$_CBT_YARN_SHIM_DIR/yarn"
  export PATH="$_CBT_YARN_SHIM_DIR:$PATH"
  echo "Using bundled Yarn shim at $_CBT_YARN_SHIM_DIR/yarn"
fi

# ---------------------------------------------------------------------------
# Multi-agent / worktree isolation
# ---------------------------------------------------------------------------
# E2E gets its own slot and port range so worktrees can run E2E tests in
# parallel with each other, the dev stack, and integration tests. See
# scripts/slots.sh for the ports. Override with CBT_E2E_SLOT.
# ---------------------------------------------------------------------------
# shellcheck source=./slots.sh
. "$SCRIPT_DIR/slots.sh"
hdx_e2e_ports "$REPO_ROOT"

# Prevent Playwright's html reporter from spawning a blocking server on port
# 9323 ("Serving HTML report... Press Ctrl+C to quit.") after a failed/flaky
# run. Without this, the test process never exits in interactive terminals,
# which breaks non-interactive (agent) invocations of `make dev-e2e`.
# The Makefile's `REPORT=1` flag still works because it invokes
# `npx playwright show-report` separately after the test process exits.
# CI is already unaffected (Playwright skips auto-open when process.env.CI is set).
export PLAYWRIGHT_HTML_OPEN=never

# --- Log capture for dev-portal visibility ---
CBT_E2E_SLOTS_DIR="${HOME}/.config/hyperdx/dev-slots"
CBT_E2E_LOGS_DIR="${CBT_E2E_SLOTS_DIR}/${CBT_E2E_SLOT}/logs-e2e"
mkdir -p "$CBT_E2E_LOGS_DIR"
exec > >(tee "$CBT_E2E_LOGS_DIR/e2e.log") 2>&1

# --- Start dev portal in background if not already running ---
# shellcheck source=./ensure-dev-portal.sh
source "${REPO_ROOT}/scripts/ensure-dev-portal.sh"

echo "Using E2E slot ${CBT_E2E_SLOT} (project=${E2E_PROJECT} cb-mgmt=${CBT_E2E_CB_MGMT_PORT} api=${CBT_E2E_API_PORT} app=${CBT_E2E_APP_PORT} app-local=${CBT_E2E_APP_LOCAL_PORT} opamp=${CBT_E2E_OPAMP_PORT})"

# Configuration constants
readonly MAX_COUCHBASE_WAIT_ATTEMPTS=60
readonly COUCHBASE_WAIT_DELAY_SECONDS=2
# CBT_E2E_CB_* ports come from hdx_e2e_ports (slot-based).
export CBT_E2E_CB_QUERY_PORT CBT_E2E_CB_MGMT_PORT CBT_E2E_CB_KV_PORT \
  CBT_E2E_CB_VIEW_PORT CBT_E2E_CB_FTS_PORT CBT_E2E_CB_ANALYTICS_PORT \
  CBT_E2E_CB_EVENTING_PORT CBT_E2E_CB_BACKUP_PORT

# Parse arguments
LOCAL_MODE=false
SKIP_CLEANUP=false
PLAYWRIGHT_FLAGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --local)
      LOCAL_MODE=true
      shift
      ;;
    --keep-running|--no-cleanup)
      SKIP_CLEANUP=true
      shift
      ;;
    *)
      # Pass any other flags through to Playwright
      PLAYWRIGHT_FLAGS+=("$1")
      shift
      ;;
  esac
done


cleanup_services() {
  echo "Stopping E2E services and removing volumes..."
  docker compose -p "$E2E_PROJECT" -f "$DOCKER_COMPOSE_FILE" down -v
  # Archive logs to history instead of deleting
  if [ -d "$CBT_E2E_LOGS_DIR" ] && [ -n "$(ls -A "$CBT_E2E_LOGS_DIR" 2>/dev/null)" ]; then
    _ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    _hist="${CBT_E2E_SLOTS_DIR}/${CBT_E2E_SLOT}/history/e2e-${_ts}"
    mkdir -p "$_hist"
    mv "$CBT_E2E_LOGS_DIR"/* "$_hist/" 2>/dev/null || true
    _wt=$(basename "$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null || echo "$REPO_ROOT")")
    _br=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    cat > "$_hist/meta.json" <<METAEOF
{"worktree":"${_wt}","branch":"${_br}","worktreePath":"${REPO_ROOT}"}
METAEOF
  fi
  rm -rf "$CBT_E2E_LOGS_DIR" 2>/dev/null || true
}

check_couchbase_health() {
  # /pools is served on the management port (8091 inside the container).
  curl -sf "http://127.0.0.1:${CBT_E2E_CB_MGMT_PORT}/ui/index.html" >/dev/null 2>&1
}

wait_for_couchbase() {
  echo "Waiting for Couchbase to be ready..."
  local attempt=1

  while [ $attempt -le $MAX_COUCHBASE_WAIT_ATTEMPTS ]; do
    if check_couchbase_health >/dev/null 2>&1; then
      echo "Couchbase is ready"
      return 0
    fi

    if [ $attempt -eq $MAX_COUCHBASE_WAIT_ATTEMPTS ]; then
      local total_wait=$((MAX_COUCHBASE_WAIT_ATTEMPTS * COUCHBASE_WAIT_DELAY_SECONDS))
      echo "Couchbase failed to become ready after $total_wait seconds"
      echo "Try running: docker compose -p $E2E_PROJECT -f $DOCKER_COMPOSE_FILE logs couchbase"
      return 1
    fi

    echo "Waiting for Couchbase... ($attempt/$MAX_COUCHBASE_WAIT_ATTEMPTS)"
    attempt=$((attempt + 1))
    sleep $COUCHBASE_WAIT_DELAY_SECONDS
  done
}

setup_couchbase() {
  echo "Starting Couchbase (mgmt=${CBT_E2E_CB_MGMT_PORT} query=${CBT_E2E_CB_QUERY_PORT})..."
  docker compose -p "$E2E_PROJECT" -f "$DOCKER_COMPOSE_FILE" up -d couchbase

  if ! wait_for_couchbase; then
    exit 1
  fi

  local container
  container=$(docker compose -p "$E2E_PROJECT" -f "$DOCKER_COMPOSE_FILE" ps -q couchbase)
  container=$(docker inspect -f '{{.Name}}' "$container" | sed 's#^/##')
  echo "Initializing Couchbase cluster in $container..."
  export CBT_PARITY_COUCHBASE_CONTAINER="$container"
  bash "$REPO_ROOT/port/golden/lib/couchbase-init.sh" || {
    echo "Couchbase cluster-init failed"
    exit 1
  }
  # Publish remapped host ports for SDK clients using ?network=external.
  docker exec "$container" /opt/couchbase/bin/couchbase-cli setting-alternate-address \
    -c 127.0.0.1:8091 -u Administrator -p cbt-test-admin \
    --set --node 127.0.0.1 --hostname localhost \
    --ports mgmt=${CBT_E2E_CB_MGMT_PORT},mgmtSSL=$((CBT_E2E_CB_MGMT_PORT + 1000)),\
kv=${CBT_E2E_CB_KV_PORT},kvSSL=$((CBT_E2E_CB_KV_PORT + 1000)),\
n1ql=${CBT_E2E_CB_QUERY_PORT},n1qlSSL=$((CBT_E2E_CB_QUERY_PORT + 1000)),\
fts=${CBT_E2E_CB_FTS_PORT},ftsSSL=$((CBT_E2E_CB_FTS_PORT + 1000)) \
    || echo "Warning: alternate address not set (may already exist)"
}

# Main execution
setup_cleanup_trap() {
  if [ "$SKIP_CLEANUP" = false ]; then
    trap cleanup_services EXIT ERR
  else
    echo "⚠️  Skipping cleanup - containers will remain running"
    echo "   Use 'docker compose -p $E2E_PROJECT -f $DOCKER_COMPOSE_FILE down -v' to stop them manually"
  fi
}

run_tests() {
  cd "$REPO_ROOT/packages/app"
  
  if [ "$LOCAL_MODE" = true ]; then
    echo "Running tests in local mode (frontend only)..."
    yarn test:e2e --local "${PLAYWRIGHT_FLAGS[@]}"
  else
    echo "Running tests in full-stack mode (API + Couchbase)..."
    yarn test:e2e "${PLAYWRIGHT_FLAGS[@]}"
  fi
}

# Set up cleanup trap
setup_cleanup_trap

# Clean up E2E Next.js build directory to avoid stale lock/cache issues
rm -rf "$REPO_ROOT/packages/app/.next-e2e" 2>/dev/null || true

# Start Couchbase telemetry store (full-stack mode only)
if [ "$LOCAL_MODE" = false ]; then
  setup_couchbase
fi

# Run tests
run_tests
