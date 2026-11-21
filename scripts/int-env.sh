#!/bin/bash
# Usage: scripts/int-env.sh [KEEP_GLOB...] -- COMMAND [ARGS...]
#
# Runs COMMAND with leftover CBT_* / COUCHBASE_* shell variables removed, so a
# local integration run (make ci-int, make dev-int, port/couchbase-test/run.sh)
# uses the credentials and ports of the stack it starts, not whatever a dev
# shell exported. Keeps the CI slot (CBT_CI_*, set by the Makefile and by
# `make dev-int CBT_CI_SLOT=n`) and any extra KEEP_GLOB. Same rules as E2E:
# see cbt_isolate_env in scripts/e2e-env.sh.
set -euo pipefail

# shellcheck source=./e2e-env.sh
. "$(dirname "${BASH_SOURCE[0]}")/e2e-env.sh"

keep=('CBT_CI_*')
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
  keep+=("$1")
  shift
done
if [ "$#" -lt 2 ]; then
  echo "usage: $0 [KEEP_GLOB...] -- COMMAND [ARGS...]" >&2
  exit 2
fi
shift

cbt_isolate_env int "${keep[@]}"
# The compose stack these targets start has no `test` bucket, so the
# *.couchbase.int.test.ts suites skip on purpose instead of failing auth.
export CBT_TEST_COUCHBASE_REQUIRED=0
echo "[int] CBT_TEST_COUCHBASE_REQUIRED=0: live-cluster suites (*.couchbase.int.test.ts) are skipped here; they run in port/couchbase-test/run.sh." >&2
exec "$@"
