#!/usr/bin/env bash
# Fails if a @clickhouse/* package comes back (P3). Couchbase Traces ships its
# own UI primitives and self-telemetry; NOTICE credits the ported code. Docs
# and attribution comments may still name the packages.
set -uo pipefail

cd "$(dirname "$0")/../.."

status=0
fail() {
  echo "::error::$1"
  status=1
}

manifests=$(git ls-files 'package.json' '*/package.json' '*/*/package.json' \
  ':!port/rebrand/test/fixtures/**')
# shellcheck disable=SC2086
if hits=$(grep -nE '"@clickhouse/[^"]+"[[:space:]]*:' $manifests); then
  fail "@clickhouse packages in a package.json:"$'\n'"$hits"
fi

# The lockfile catches transitive reintroduction.
if hits=$(grep -nE '^"@clickhouse/' yarn.lock); then
  fail "@clickhouse packages in yarn.lock:"$'\n'"$hits"
fi

# Imports, requires, jest mocks, and config entries such as
# serverExternalPackages or transpilePackages: a quoted specifier anywhere in
# code the product builds or runs from. Backticks are left out so comments
# can name the packages they credit.
paths=(packages scripts docker Makefile .github port/couchbase-test
  port/golden port/stack-smoke port/acceptance)
spec_pattern="['\"]@clickhouse/"
if hits=$(git grep -nE "$spec_pattern" -- "${paths[@]}" \
  ':!scripts/ci/check-no-clickhouse-packages.sh' ':!packages/*/CHANGELOG.md'); then
  fail "References to @clickhouse packages:"$'\n'"$hits"
fi

if [ "$status" -eq 0 ]; then
  echo "check-no-clickhouse-packages: clean"
fi
exit "$status"
