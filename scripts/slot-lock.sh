#!/bin/bash
# Usage: scripts/slot-lock.sh acquire|release LOCK_DIR OWNER_PID
#
# Serializes integration runs that share a CI slot (D19). Two `make ci-int`
# runs on one slot share its compose project and logs-int directory: the
# first one's teardown (`down -v`, then archive-int-logs' `rm -rf logs-int`)
# lands under the second, whose `tee` then fails and fails the target after
# every test passed.
#
# The lock is a directory (mkdir is atomic) holding the owner's PID. Recipes
# pass make's PID ($$PPID), so a run that dies mid-recipe leaves a lock whose
# owner is gone, and the next run takes it over. acquire waits up to
# CBT_SLOT_LOCK_WAIT_S (default 1800) for a live owner, then fails.
set -euo pipefail

cmd=${1:-}
lock=${2:-}
owner=${3:-}
if [ -z "$cmd" ] || [ -z "$lock" ] || [ -z "$owner" ]; then
  echo "usage: $0 acquire|release LOCK_DIR OWNER_PID" >&2
  exit 2
fi

holder() { cat "$lock/pid" 2>/dev/null || true; }

case "$cmd" in
  acquire)
    wait_s=${CBT_SLOT_LOCK_WAIT_S:-1800}
    deadline=$((SECONDS + wait_s))
    announced=
    mkdir -p "$(dirname "$lock")"
    while ! mkdir "$lock" 2>/dev/null; do
      pid=$(holder)
      if [ "$pid" = "$owner" ]; then
        exit 0
      fi
      # No PID yet means the holder is between its mkdir and its write.
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        # Rename first (atomic): of two waiters taking over at once, only
        # one moves the stale lock, and neither deletes a fresh one.
        stale="$lock.stale.$$"
        if mv "$lock" "$stale" 2>/dev/null; then
          if [ "$(cat "$stale/pid" 2>/dev/null || true)" = "$pid" ]; then
            echo "slot-lock: took over $lock from exited pid $pid" >&2
            rm -rf "$stale"
          else
            # A live run took the lock between our read and our rename: put
            # it back (mv onto an existing dir would nest it, so check).
            if [ -e "$lock" ] || ! mv "$stale" "$lock" 2>/dev/null; then
              rm -rf "$stale"
            fi
          fi
        fi
        continue
      fi
      if [ "$SECONDS" -ge "$deadline" ]; then
        echo "slot-lock: $lock still held by pid ${pid:-?} after ${wait_s}s; another integration run is using this slot (pick another with CBT_CI_SLOT=n)" >&2
        exit 1
      fi
      if [ -z "$announced" ]; then
        echo "slot-lock: waiting for pid ${pid:-?} to finish its integration run on this slot" >&2
        announced=1
      fi
      sleep 1
    done
    echo "$owner" > "$lock/pid"
    ;;
  release)
    # Only the owner releases, so a run that lost a takeover race cannot
    # free the lock of the run that replaced it.
    if [ "$(holder)" = "$owner" ]; then
      rm -rf "$lock"
    fi
    ;;
  *)
    echo "usage: $0 acquire|release LOCK_DIR OWNER_PID" >&2
    exit 2
    ;;
esac
