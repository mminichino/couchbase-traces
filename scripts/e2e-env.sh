#!/bin/bash
# Sourced by scripts/test-e2e.sh. The E2E stack owns its Couchbase node and
# credentials, but the API (dotenv does not override exported variables), the
# golden cluster init, and the Playwright helpers all read the caller's
# environment first. A developer shell with, say, CBT_COUCHBASE_ADMIN_PASSWORD
# exported for the dev stack would make cluster init use that password while
# global setup uses the E2E one, and every call then fails with
# "authentication failure".

# The E2E admin login. One value for golden init (CBT_COUCHBASE_ADMIN_*) and
# the Playwright helpers (COUCHBASE_USERNAME / COUCHBASE_PASSWORD).
CBT_E2E_ADMIN_USER=Administrator
CBT_E2E_ADMIN_PASSWORD=cbt-test-admin

# Unset inherited CBT_* variables except the E2E slot and port overrides
# (CBT_E2E_*), CBT_SLOT_FROM (scripts/slots.sh), and the dev portal port
# (CBT_PORTAL_*, scripts/ensure-dev-portal.sh), which are documented inputs.
# Also drop the COUCHBASE_* overrides the Playwright helpers read. Then export
# the E2E admin login. Prints the names it dropped (never values) to stderr.
cbt_e2e_isolate_env() {
  local name dropped=()
  while IFS= read -r name; do
    case "$name" in
      CBT_E2E_*|CBT_SLOT_FROM|CBT_PORTAL_*) ;;
      CBT_*|COUCHBASE_URL|COUCHBASE_USERNAME|COUCHBASE_PASSWORD)
        unset "$name"
        dropped+=("$name")
        ;;
    esac
  done < <(compgen -e)

  if [ "${#dropped[@]}" -gt 0 ]; then
    echo "E2E: ignoring inherited ${dropped[*]}" >&2
  fi

  export CBT_COUCHBASE_ADMIN_USER="$CBT_E2E_ADMIN_USER"
  export CBT_COUCHBASE_ADMIN_PASSWORD="$CBT_E2E_ADMIN_PASSWORD"
  export COUCHBASE_USERNAME="$CBT_E2E_ADMIN_USER"
  export COUCHBASE_PASSWORD="$CBT_E2E_ADMIN_PASSWORD"
}
