#!/bin/sh
# ---------------------------------------------------------------------------
# Slot and port allocation for worktree-isolated stacks
# ---------------------------------------------------------------------------
# The only place that turns a worktree into port numbers. dev-env.sh,
# test-e2e.sh, the Makefile, and tools run through with-slots.sh all use it,
# so they always agree.
#
# Sourcing this file only defines functions, and the functions only set and
# export variables. Nothing is written, deleted, started, or printed (apart
# from a warning on stderr for a bad CBT_SLOT_FROM), so it is safe to use while
# a dev stack is running.
#
#   . scripts/slots.sh && hdx_dev_ports    # dev stack (yarn dev)
#   . scripts/slots.sh && hdx_ci_ports     # integration tests (make dev-int)
#   . scripts/slots.sh && hdx_e2e_ports    # E2E tests (make e2e)
#
# Each function takes an optional directory inside the worktree (default: the
# current directory).
#
# The slot (0-99) is the cksum of the worktree's folder name, mod 100, and each
# service's port is its base plus the slot. Override the slot per stack with
# CBT_DEV_SLOT, CBT_CI_SLOT, or CBT_E2E_SLOT, e.g. `CBT_DEV_SLOT=5 yarn dev`.
#
# If your worktrees share a folder name (a/hyperdx, b/hyperdx), set
# CBT_SLOT_FROM=path, e.g. in your shell profile, to hash the worktree's full
# path instead. The default, CBT_SLOT_FROM=name, keeps existing slots and the
# .volumes/*_<slot> data folders that go with them.
#
# The ranges stay clear of each other, of the default dev ports (4317-4320,
# 8000, 8080, 8123, 8888, 9000, 13133, 14318, 27017), and of the OS ephemeral
# range (32768+ on Linux, 49152+ on macOS).
# ---------------------------------------------------------------------------

# Slot of the worktree containing $1 (default: the current directory).
_hdx_default_slot() {
  _hdx_dir="${1:-.}"
  _hdx_root="$(git -C "$_hdx_dir" rev-parse --show-toplevel 2>/dev/null ||
    (cd "$_hdx_dir" && pwd))"
  case "${CBT_SLOT_FROM:-name}" in
    path) _hdx_key="$(cd "$_hdx_root" && pwd -P)" ;;
    name) _hdx_key="$(basename "$_hdx_root")" ;;
    *)
      echo "slots.sh: CBT_SLOT_FROM must be 'name' or 'path', got '$CBT_SLOT_FROM'; using 'name'" >&2
      _hdx_key="$(basename "$_hdx_root")"
      ;;
  esac
  printf '%s' "$_hdx_key" | cksum | awk '{print $1 % 100}'
}

# Dev stack (yarn dev): 30100-31199.
hdx_dev_ports() {
  CBT_DEV_SLOT="${CBT_DEV_SLOT:-$(_hdx_default_slot "$1")}"
  CBT_API_PORT=$((30100 + CBT_DEV_SLOT))
  CBT_APP_PORT=$((30200 + CBT_DEV_SLOT))
  CBT_OPAMP_PORT=$((30300 + CBT_DEV_SLOT))
  CBT_DEV_MONGO_PORT=$((30400 + CBT_DEV_SLOT))
  CBT_DEV_CH_HTTP_PORT=$((30500 + CBT_DEV_SLOT))
  CBT_DEV_CH_NATIVE_PORT=$((30600 + CBT_DEV_SLOT))
  CBT_DEV_OTEL_HEALTH_PORT=$((30700 + CBT_DEV_SLOT))
  CBT_DEV_OTEL_GRPC_PORT=$((30800 + CBT_DEV_SLOT))
  CBT_DEV_OTEL_HTTP_PORT=$((30900 + CBT_DEV_SLOT))
  CBT_DEV_OTEL_METRICS_PORT=$((31000 + CBT_DEV_SLOT))
  CBT_DEV_OTEL_JSON_HTTP_PORT=$((31100 + CBT_DEV_SLOT))
  CBT_DEV_PROJECT="hdx-dev-${CBT_DEV_SLOT}"
  export CBT_DEV_SLOT CBT_API_PORT CBT_APP_PORT CBT_OPAMP_PORT \
    CBT_DEV_MONGO_PORT CBT_DEV_CH_HTTP_PORT CBT_DEV_CH_NATIVE_PORT \
    CBT_DEV_OTEL_HEALTH_PORT CBT_DEV_OTEL_GRPC_PORT CBT_DEV_OTEL_HTTP_PORT \
    CBT_DEV_OTEL_METRICS_PORT CBT_DEV_OTEL_JSON_HTTP_PORT CBT_DEV_PROJECT
}

# Integration tests (make dev-int): ClickHouse 18123+, MongoDB 39999+,
# API 19000+, OpAMP 14320+.
hdx_ci_ports() {
  CBT_CI_SLOT="${CBT_CI_SLOT:-$(_hdx_default_slot "$1")}"
  CBT_CI_CH_PORT=$((18123 + CBT_CI_SLOT))
  CBT_CI_MONGO_PORT=$((39999 + CBT_CI_SLOT))
  CBT_CI_API_PORT=$((19000 + CBT_CI_SLOT))
  CBT_CI_OPAMP_PORT=$((14320 + CBT_CI_SLOT))
  CBT_CI_PROJECT="int-${CBT_CI_SLOT}"
  export CBT_CI_SLOT CBT_CI_CH_PORT CBT_CI_MONGO_PORT CBT_CI_API_PORT \
    CBT_CI_OPAMP_PORT CBT_CI_PROJECT
}

# E2E tests (make e2e): 20320-21399, plus the Playwright report server at
# 9323+. Ports that are already set are kept, because CI pins them in
# .github/actions/e2e-setup.
hdx_e2e_ports() {
  CBT_E2E_SLOT="${CBT_E2E_SLOT:-$(_hdx_default_slot "$1")}"
  CBT_E2E_OPAMP_PORT="${CBT_E2E_OPAMP_PORT:-$((20320 + CBT_E2E_SLOT))}"
  CBT_E2E_CH_PORT="${CBT_E2E_CH_PORT:-$((20500 + CBT_E2E_SLOT))}"
  CBT_E2E_CH_NATIVE_PORT="${CBT_E2E_CH_NATIVE_PORT:-$((20600 + CBT_E2E_SLOT))}"
  CBT_E2E_API_PORT="${CBT_E2E_API_PORT:-$((21000 + CBT_E2E_SLOT))}"
  CBT_E2E_MONGO_PORT="${CBT_E2E_MONGO_PORT:-$((21100 + CBT_E2E_SLOT))}"
  CBT_E2E_APP_LOCAL_PORT="${CBT_E2E_APP_LOCAL_PORT:-$((21200 + CBT_E2E_SLOT))}"
  CBT_E2E_APP_PORT="${CBT_E2E_APP_PORT:-$((21300 + CBT_E2E_SLOT))}"
  CBT_E2E_REPORT_PORT=$((9323 + CBT_E2E_SLOT))
  E2E_PROJECT="e2e-${CBT_E2E_SLOT}"
  export CBT_E2E_SLOT CBT_E2E_OPAMP_PORT CBT_E2E_CH_PORT \
    CBT_E2E_CH_NATIVE_PORT CBT_E2E_API_PORT CBT_E2E_MONGO_PORT \
    CBT_E2E_APP_LOCAL_PORT CBT_E2E_APP_PORT CBT_E2E_REPORT_PORT E2E_PROJECT
}
