#!/usr/bin/env bash
# Build the three release CLI binaries and run the ones this host can execute.
# D34: v1.0.0's binaries crashed on every command and would have reported
# 0.0.0, and nothing ran them before release. This runs `--version` (must equal
# packages/cli/package.json) and `--help` on each runnable binary.
#
# Bun comes from PATH when it is the pinned engines.bun version; otherwise it
# is installed from npm into a temp dir (no system install).
#
# Usage: scripts/ci/check-cli-binaries.sh [--no-build]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$ROOT/packages/cli"
cd "$ROOT"

want_version=$(node -p "require('./packages/cli/package.json').version")
bun_version=$(node -p "require('./packages/cli/package.json').engines.bun")

if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version)" != "$bun_version" ]; then
  BUN_DIR="${CBT_BUN_DIR:-$(mktemp -d)}"
  if [ ! -x "$BUN_DIR/node_modules/.bin/bun" ]; then
    echo "installing bun@$bun_version into $BUN_DIR"
    (cd "$BUN_DIR" && npm init -y >/dev/null && npm install --silent "bun@$bun_version" >/dev/null)
  fi
  export PATH="$BUN_DIR/node_modules/.bin:$PATH"
fi
echo "bun $(bun --version)"

if [ "${1:-}" != "--no-build" ]; then
  # The CLI imports common-utils' built dist.
  yarn workspace @couchbase-traces/common-utils build >/dev/null
  for t in compile:linux compile:macos compile:macos-x64; do
    yarn workspace @couchbase-traces/cli "$t" >/dev/null
  done
fi

host="$(uname -s)-$(uname -m)"
fail=0
ran=0
for bin in cbt-linux-x64 cbt-darwin-arm64 cbt-darwin-x64; do
  path="$CLI/dist/$bin"
  if [ ! -s "$path" ]; then
    echo "::error::$bin was not built"
    fail=1
    continue
  fi
  case "$bin:$host" in
    cbt-linux-x64:Linux-x86_64 | cbt-darwin-arm64:Darwin-arm64 | \
      cbt-darwin-x64:Darwin-x86_64) ;;
    # Apple silicon runs x64 binaries when Rosetta is installed.
    cbt-darwin-x64:Darwin-arm64)
      if ! arch -x86_64 /usr/bin/true 2>/dev/null; then
        echo "skip $bin (no Rosetta)"
        continue
      fi
      ;;
    *)
      echo "skip $bin (cannot run on $host)"
      continue
      ;;
  esac
  got=$(env -u npm_package_version "$path" --version 2>&1) || {
    echo "::error::$bin --version failed: $got"
    fail=1
    continue
  }
  if [ "$got" != "$want_version" ]; then
    echo "::error::$bin --version printed '$got', want '$want_version'"
    fail=1
    continue
  fi
  if ! "$path" --help >/dev/null 2>&1; then
    echo "::error::$bin --help failed"
    fail=1
    continue
  fi
  echo "ok $bin $got"
  ran=$((ran + 1))
done

if [ "$ran" -eq 0 ]; then
  echo "::error::no CLI binary could run on $host"
  fail=1
fi
exit "$fail"
