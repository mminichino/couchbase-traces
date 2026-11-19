#!/usr/bin/env bash
# Fails if MongoDB comes back. App metadata lives in the Couchbase `cbt_meta`
# bucket (docs/mongo-elimination-plan.md); nothing in the product may depend on
# Mongo again. Docs, the plan, and upstream attribution may mention it.
set -uo pipefail

cd "$(dirname "$0")/../.."

status=0
fail() {
  echo "::error::$1"
  status=1
}

# Packages whose presence in any manifest means a Mongo dependency.
dep_pattern='"(mongoose|mongodb|mongodb-memory-server|migrate-mongo|connect-mongo|passport-local-mongoose|bson|mongoose-[a-z-]+|@types/mongoose)"[[:space:]]*:'
manifests=$(git ls-files 'package.json' '*/package.json' '*/*/package.json')
# shellcheck disable=SC2086
if hits=$(grep -nE "$dep_pattern" $manifests); then
  fail "Mongo packages in a package.json:"$'\n'"$hits"
fi

# The lockfile catches transitive reintroduction.
if hits=$(grep -nE '^"(mongoose|mongodb|bson|migrate-mongo|connect-mongo|passport-local-mongoose)@' yarn.lock); then
  fail "Mongo packages in yarn.lock:"$'\n'"$hits"
fi

# Code and config the product runs from. Excludes docs, the plan, upstream
# changelogs, and this script.
paths=(packages scripts docker docker-compose.yml docker-compose.dev.yml
  docker-compose.ci.yml Makefile .github port/couchbase-test port/golden
  port/stack-smoke .env .env.example)

import_pattern="(from|require\\()[[:space:]]*['\"](mongoose|mongodb|bson|migrate-mongo|connect-mongo)(['\"/])"
if hits=$(git grep -nE "$import_pattern" -- "${paths[@]}" ':!scripts/ci/check-no-mongo.sh'); then
  fail "Imports of Mongo packages:"$'\n'"$hits"
fi

infra_pattern='MONGO_URI|_MONGO_PORT|image:[[:space:]]*mongo|mongosh|mongod[[:space:]]|migrate-mongo'
if hits=$(git grep -nE "$infra_pattern" -- "${paths[@]}" ':!scripts/ci/check-no-mongo.sh' ':!scripts/ci/smoke-all-in-one.sh' ':!packages/*/eslint.config.mjs' ':!packages/*/CHANGELOG.md'); then
  fail "Mongo services, env vars, or tooling:"$'\n'"$hits"
fi

# The Mongo compose service was named `db`; a leftover reference (depends_on,
# `compose pull/logs ... db`) breaks stack startup only at run time.
db_pattern='^[[:space:]]+db:[[:space:]]*$|(pull|logs|up|build|exec)[^#]*[[:space:]]db([[:space:]]|$)'
if hits=$(git grep -nE "$db_pattern" -- docker-compose*.yml packages/app/tests/e2e/docker-compose.yml port/golden/docker-compose.yml .github/workflows Makefile scripts ':!scripts/ci/check-no-mongo.sh'); then
  fail "Dangling reference to the removed Mongo \`db\` compose service:"$'\n'"$hits"
fi

if [ "$status" -eq 0 ]; then
  echo "check-no-mongo: clean"
fi
exit "$status"
