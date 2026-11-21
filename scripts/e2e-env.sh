#!/bin/bash
# Sourced by scripts/test-e2e.sh and scripts/int-env.sh. The E2E and
# integration stacks own their Couchbase node and credentials, but the API
# (dotenv does not override exported variables), cluster init, compose
# interpolation, and the test helpers all read the caller's environment first.
# A developer shell with, say, CBT_COUCHBASE_ADMIN_PASSWORD exported for the
# dev stack would make cluster init use that password while the tests use the
# stack's own, and every call then fails with "authentication failure".

# The E2E admin login. One value for golden init (CBT_COUCHBASE_ADMIN_*) and
# the Playwright helpers (COUCHBASE_USERNAME / COUCHBASE_PASSWORD).
CBT_E2E_ADMIN_USER=Administrator
CBT_E2E_ADMIN_PASSWORD=cbt-test-admin

# cbt_isolate_env LABEL [KEEP_GLOB...]
# Unset inherited CBT_* variables and the COUCHBASE_URL / COUCHBASE_USERNAME /
# COUCHBASE_PASSWORD overrides the Playwright helpers read. Always kept:
# CBT_SLOT_FROM (scripts/slots.sh) and the dev portal port (CBT_PORTAL_*,
# scripts/ensure-dev-portal.sh), plus any name matching a KEEP_GLOB. Prints
# the names it dropped (never values) to stderr.
cbt_isolate_env() {
  local label=$1 name keep kept dropped=()
  shift
  while IFS= read -r name; do
    case "$name" in
      CBT_SLOT_FROM|CBT_PORTAL_*) continue ;;
      CBT_*|COUCHBASE_URL|COUCHBASE_USERNAME|COUCHBASE_PASSWORD) ;;
      *) continue ;;
    esac
    kept=
    for keep in "$@"; do
      # shellcheck disable=SC2254 # KEEP_GLOB is a pattern on purpose.
      case "$name" in $keep) kept=1; break ;; esac
    done
    [ -n "$kept" ] && continue
    unset "$name"
    dropped+=("$name")
  done < <(compgen -e)

  if [ "${#dropped[@]}" -gt 0 ]; then
    echo "$label: ignoring inherited ${dropped[*]}" >&2
  fi
}

# E2E keeps its slot and port overrides (CBT_E2E_*), then exports its login.
cbt_e2e_isolate_env() {
  cbt_isolate_env E2E 'CBT_E2E_*'
  export CBT_COUCHBASE_ADMIN_USER="$CBT_E2E_ADMIN_USER"
  export CBT_COUCHBASE_ADMIN_PASSWORD="$CBT_E2E_ADMIN_PASSWORD"
  export COUCHBASE_USERNAME="$CBT_E2E_ADMIN_USER"
  export COUCHBASE_PASSWORD="$CBT_E2E_ADMIN_PASSWORD"
}
