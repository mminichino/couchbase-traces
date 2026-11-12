#!/usr/bin/env bash
# Self-contained Phase 0 preflight test runner.
set -euo pipefail

TEST_ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
PORT_SRC="$TEST_ROOT/port"
PREFLIGHT="$PORT_SRC/preflight.sh"

PASS=0
FAIL=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ok() {
  printf 'ok %s\n' "$1"
  PASS=$((PASS + 1))
}

not_ok() {
  printf 'not ok %s — %s\n' "$1" "$2"
  FAIL=$((FAIL + 1))
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    return 0
  fi
  printf '  assert_eq %s: expected %s got %s\n' "$label" "$expected" "$actual" >&2
  return 1
}

assert_file_contains() {
  local file="$1" needle="$2"
  if grep -q -F "$needle" "$file"; then
    return 0
  fi
  printf '  missing in %s: %s\n' "$file" "$needle" >&2
  return 1
}

json_field() {
  # Very small extractor for flat "key": value on its own line / nested simple paths.
  # Usage: json_field FILE key   or json_field FILE parent.child
  local file="$1" path="$2"
  local key
  key="${path##*.}"
  # Prefer exact key match with optional nesting awareness via awk.
  awk -v key="$key" '
    {
      # Match "key": value
      re = "\"" key "\"[[:space:]]*:"
      if (match($0, re)) {
        line = $0
        sub(/^[^:]*:[[:space:]]*/, "", line)
        sub(/,[[:space:]]*$/, "", line)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        # Strip surrounding quotes for strings
        if (line ~ /^"/) {
          sub(/^"/, "", line)
          sub(/"$/, "", line)
        }
        print line
        exit
      }
    }
  ' "$file"
}

make_upstream() {
  local dir="$1"
  local with_tags="${2:-1}"
  local with_api="${3:-1}"

  mkdir -p "$dir/packages/app" "$dir/packages/common-utils"
  if [ "$with_api" = "1" ]; then
    mkdir -p "$dir/packages/api"
    echo 'api' >"$dir/packages/api/index.js"
  fi
  echo 'app' >"$dir/packages/app/index.js"
  echo 'common' >"$dir/packages/common-utils/index.js"
  echo 'space content' >"$dir/file with space.txt"
  printf 'v22.16.0\n' >"$dir/.nvmrc"
  printf '{\n  "name": "hyperdx",\n  "packageManager": "yarn@4.5.1"\n}\n' >"$dir/package.json"
  echo 'MIT' >"$dir/LICENSE"
  echo 'upstream readme' >"$dir/README.md"

  git -C "$dir" init -q
  git -C "$dir" symbolic-ref HEAD refs/heads/main
  git -C "$dir" config user.email 'test@example.com'
  git -C "$dir" config user.name 'Test'
  git -C "$dir" add -A
  git -C "$dir" commit -qm 'initial'
  if [ "$with_tags" = "1" ]; then
    git -C "$dir" tag '@hyperdx/app@9.9.9'
  fi
}

make_origin() {
  local dir="$1"
  local seed="${2:-}"

  git init --bare -q "$dir"
  if [ "$seed" = "seed" ] || [ "$seed" = "identical" ]; then
    local work
    work=$(mktemp -d)
    git -C "$work" init -q
    git -C "$work" symbolic-ref HEAD refs/heads/main
    git -C "$work" config user.email 'test@example.com'
    git -C "$work" config user.name 'Test'
    if [ "$seed" = "identical" ]; then
      echo 'upstream readme' >"$work/README.md"
    else
      echo 'remote readme different' >"$work/README.md"
    fi
    git -C "$work" add README.md
    git -C "$work" commit -qm 'seed'
    git -C "$work" remote add origin "$dir"
    git -C "$work" push -q origin main
    # Set HEAD symref on bare repo
    git -C "$dir" symbolic-ref HEAD refs/heads/main
    rm -rf "$work"
  fi
}

make_project() {
  local dir="$1"
  local upstream="$2"
  local origin="$3"

  mkdir -p "$dir"
  rm -rf "$dir/port"
  cp -R "$PORT_SRC" "$dir/port"
  # Do not copy generated state into fixtures.
  rm -rf "$dir/port/state" "$dir/port/test"
  mkdir -p "$dir/port/state"

  cat >"$dir/AGENTS.md" <<EOF
# AGENTS.md

## Constants

| Name | Value |
|---|---|
| \`UPSTREAM_PATH\` | \`$upstream\` |
| \`ORIGIN_URL\` | \`$origin\` |
| \`PRODUCT_NAME\` | \`Couchbase Traces\` |
EOF
}

run_preflight() {
  local project="$1"
  shift
  CBT_PORT_UPSTREAM_PATH="${CBT_PORT_UPSTREAM_PATH:-}" \
  CBT_PORT_ORIGIN_URL="${CBT_PORT_ORIGIN_URL:-}" \
  CBT_PORT_AGENTS_FILE="${CBT_PORT_AGENTS_FILE:-}" \
  bash "$project/port/preflight.sh" "$@"
}

# ---------- Cases ----------

case1() {
  local name="1 empty project, empty origin"
  local up origin proj
  up="$TMP/c1/up"
  origin="$TMP/c1/origin.git"
  proj="$TMP/c1/proj"
  mkdir -p "$TMP/c1"
  make_upstream "$up"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -ne 0 ]; then
    not_ok "$name" "exit $ec: $out"
    return
  fi
  local action branch conflicts
  action=$(json_field "$proj/port/state/preflight.json" originAction)
  branch=$(json_field "$proj/port/state/preflight.json" branch)
  conflicts=$(json_field "$proj/port/state/preflight.json" conflicts)
  if [ "$action" = "added" ] && [ "$branch" = "main" ] && [ "$conflicts" = "[]" ]; then
    # stash for case 2
    echo "$proj" >"$TMP/c1/proj_path"
    ok "$name"
  else
    not_ok "$name" "action=$action branch=$branch conflicts=$conflicts"
  fi
}

case2() {
  local name="2 re-run of case 1"
  local proj
  proj=$(cat "$TMP/c1/proj_path")

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  local action init
  action=$(json_field "$proj/port/state/preflight.json" originAction)
  init=$(json_field "$proj/port/state/preflight.json" repoInitialized)
  if [ "$ec" -eq 0 ] && [ "$action" = "unchanged" ] && [ "$init" = "false" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec action=$action init=$init out=$out"
  fi
}

case3() {
  local name="3 origin seeded with differing README"
  local up origin proj
  up="$TMP/c3/up"
  origin="$TMP/c3/origin.git"
  proj="$TMP/c3/proj"
  mkdir -p "$TMP/c3"
  make_upstream "$up"
  make_origin "$origin" seed
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  local action
  action=$(json_field "$proj/port/state/preflight.json" branchAction)
  if [ "$ec" -eq 40 ] && [ "$action" = "checked_out_remote" ] && \
     grep -q '"path": "README.md"' "$proj/port/state/preflight.json"; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec action=$action out=$out"
  fi
}

case4() {
  local name="4 origin seeded with identical README"
  local up origin proj
  up="$TMP/c4/up"
  origin="$TMP/c4/origin.git"
  proj="$TMP/c4/proj"
  mkdir -p "$TMP/c4"
  make_upstream "$up"
  make_origin "$origin" identical
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  local ident
  ident=$(json_field "$proj/port/state/preflight.json" identicalCount)
  if [ "$ec" -eq 0 ] && [ "$ident" = "1" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec identicalCount=$ident out=$out"
  fi
}

case5() {
  local name="5 project has unrelated notes.txt"
  local up origin proj
  up="$TMP/c5/up"
  origin="$TMP/c5/origin.git"
  proj="$TMP/c5/proj"
  mkdir -p "$TMP/c5"
  make_upstream "$up"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"
  echo 'notes' >"$proj/notes.txt"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 0 ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case6() {
  local name="6 project AGENTS.md and upstream tracks AGENTS.md"
  local up origin proj
  up="$TMP/c6/up"
  origin="$TMP/c6/origin.git"
  proj="$TMP/c6/proj"
  mkdir -p "$TMP/c6"
  make_upstream "$up"
  echo '# upstream agents' >"$up/AGENTS.md"
  git -C "$up" add AGENTS.md
  git -C "$up" commit -qm 'add agents'
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  local has
  has=$(json_field "$proj/port/state/preflight.json" hasAgentsMd)
  if [ "$ec" -eq 0 ] && [ "$has" = "true" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec hasAgentsMd=$has out=$out"
  fi
}

case7() {
  local name="7 project has file named packages"
  local up origin proj
  up="$TMP/c7/up"
  origin="$TMP/c7/origin.git"
  proj="$TMP/c7/proj"
  mkdir -p "$TMP/c7"
  make_upstream "$up"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"
  echo 'not a dir' >"$proj/packages"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 40 ] && grep -q 'parent_not_directory' "$proj/port/state/preflight.json"; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case8() {
  local name="8 upstream has modified tracked file"
  local up origin proj
  up="$TMP/c8/up"
  origin="$TMP/c8/origin.git"
  proj="$TMP/c8/proj"
  mkdir -p "$TMP/c8"
  make_upstream "$up"
  echo 'dirty' >>"$up/README.md"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 32 ] && [ ! -d "$proj/.git" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec git_exists=$(test -d "$proj/.git" && echo yes || echo no) out=$out"
  fi
}

case9() {
  local name="9 upstream has only untracked file"
  local up origin proj
  up="$TMP/c9/up"
  origin="$TMP/c9/origin.git"
  proj="$TMP/c9/proj"
  mkdir -p "$TMP/c9"
  make_upstream "$up"
  echo 'scratch' >"$up/untracked.tmp"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 0 ] && grep -q 'W_UPSTREAM_UNTRACKED' "$proj/port/state/preflight.json"; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case10() {
  local name="10 upstream path does not exist"
  local origin proj
  origin="$TMP/c10/origin.git"
  proj="$TMP/c10/proj"
  mkdir -p "$TMP/c10"
  make_origin "$origin"
  make_project "$proj" "$TMP/c10/missing-up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 30 ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case11() {
  local name="11 upstream lacks packages/api"
  local up origin proj
  up="$TMP/c11/up"
  origin="$TMP/c11/origin.git"
  proj="$TMP/c11/proj"
  mkdir -p "$TMP/c11"
  make_upstream "$up" 1 0
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 33 ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case12() {
  local name="12 origin URL points to nonexistent path"
  local up proj
  up="$TMP/c12/up"
  proj="$TMP/c12/proj"
  mkdir -p "$TMP/c12"
  make_upstream "$up"
  make_project "$proj" "$up" "$TMP/c12/no-such-origin.git"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 20 ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case13() {
  local name="13 project origin pointing elsewhere"
  local up origin other proj
  up="$TMP/c13/up"
  origin="$TMP/c13/origin.git"
  other="$TMP/c13/other.git"
  proj="$TMP/c13/proj"
  mkdir -p "$TMP/c13"
  make_upstream "$up"
  make_origin "$origin"
  make_origin "$other"
  make_project "$proj" "$up" "$origin"
  git -C "$proj" init -q
  git -C "$proj" symbolic-ref HEAD refs/heads/main
  git -C "$proj" remote add origin "$other"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  local action
  action=$(json_field "$proj/port/state/preflight.json" originAction)
  if [ "$ec" -eq 0 ] && [ "$action" = "replaced" ] && \
     grep -q 'W_ORIGIN_REPLACED' "$proj/port/state/preflight.json"; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec action=$action out=$out"
  fi
}

case14() {
  local name="14 local commits diverge from origin"
  local up origin proj work
  up="$TMP/c14/up"
  origin="$TMP/c14/origin.git"
  proj="$TMP/c14/proj"
  mkdir -p "$TMP/c14"
  make_upstream "$up"
  make_origin "$origin" seed
  make_project "$proj" "$up" "$origin"
  git -C "$proj" init -q
  git -C "$proj" symbolic-ref HEAD refs/heads/main
  git -C "$proj" config user.email 'test@example.com'
  git -C "$proj" config user.name 'Test'
  echo 'local' >"$proj/local.txt"
  git -C "$proj" add local.txt
  git -C "$proj" commit -qm 'local commit'
  git -C "$proj" remote add origin "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 22 ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case16() {
  local name="16 upstream without tags"
  local up origin proj
  up="$TMP/c16/up"
  origin="$TMP/c16/origin.git"
  proj="$TMP/c16/proj"
  mkdir -p "$TMP/c16"
  make_upstream "$up" 0
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  local tag
  tag=$(json_field "$proj/port/state/preflight.json" appReleaseTag)
  if [ "$ec" -eq 0 ] && [ "$tag" = "null" ] && \
     grep -q 'W_NO_RELEASE_TAG' "$proj/port/state/preflight.json"; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec tag=$tag out=$out"
  fi
}

case17() {
  local name="17 --check-only on configured project"
  local proj mtime1 mtime2
  proj=$(cat "$TMP/c1/proj_path")
  # Ensure report exists from case1/2
  mtime1=$(stat -f %m "$proj/port/state/preflight.json" 2>/dev/null || stat -c %Y "$proj/port/state/preflight.json")
  sleep 1

  set +e
  out=$(run_preflight "$proj" --check-only 2>&1)
  ec=$?
  set -e

  mtime2=$(stat -f %m "$proj/port/state/preflight.json" 2>/dev/null || stat -c %Y "$proj/port/state/preflight.json")
  if [ "$ec" -eq 0 ] && [ "$mtime1" = "$mtime2" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec mtime $mtime1 vs $mtime2 out=$out"
  fi
}

case18() {
  local name="18 --check-only on non-repo"
  local up origin proj
  up="$TMP/c18/up"
  origin="$TMP/c18/origin.git"
  proj="$TMP/c18/proj"
  mkdir -p "$TMP/c18"
  make_upstream "$up"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" --check-only 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 10 ] && [ ! -d "$proj/.git" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec git=$(test -d "$proj/.git" && echo yes || echo no) out=$out"
  fi
}

case19() {
  local name="19 unknown flag"
  local up origin proj
  up="$TMP/c19/up"
  origin="$TMP/c19/origin.git"
  proj="$TMP/c19/proj"
  mkdir -p "$TMP/c19"
  make_upstream "$up"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"

  set +e
  out=$(run_preflight "$proj" --nope 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 2 ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case20() {
  local name="20 normalize_git_url"
  # shellcheck source=/dev/null
  . "$PORT_SRC/lib/gitutil.sh"
  local a b c d
  a=$(normalize_git_url 'https://github.com/owner/repo.git')
  b=$(normalize_git_url 'https://user@github.com/owner/repo')
  c=$(normalize_git_url 'git@github.com:owner/repo.git')
  d=$(normalize_git_url 'ssh://git@github.com/owner/repo.git')
  if [ "$a" = "github.com/owner/repo" ] && [ "$b" = "$a" ] && [ "$c" = "$a" ] && [ "$d" = "$a" ]; then
    ok "$name"
  else
    not_ok "$name" "a=$a b=$b c=$c d=$d"
  fi
}

case21() {
  local name="21 version_satisfies"
  # shellcheck source=/dev/null
  PF_WARN_CODES=()
  PF_WARN_MESSAGES=()
  . "$PORT_SRC/lib/log.sh"
  . "$PORT_SRC/lib/toolchain.sh"
  local ok1=1 ok2=1
  if version_satisfies 22 22.16.0; then ok1=0; fi
  if version_satisfies 22.16.0 22.15.1; then ok2=0; else ok2=1; fi
  if [ "$ok1" -eq 0 ] && [ "$ok2" -eq 1 ]; then
    ok "$name"
  else
    not_ok "$name" "22 vs 22.16.0 -> $ok1; 22.16.0 vs 22.15.1 -> $ok2 (0=true)"
  fi
}

case22() {
  local name="22 json_str escaping"
  # shellcheck source=/dev/null
  . "$PORT_SRC/lib/report.sh"
  local result expected
  result=$(json_str $'quote:" back\\slash\nnewline\ttab')
  expected='"quote:\" back\\slash\nnewline\ttab"'
  if [ "$result" = "$expected" ]; then
    ok "$name"
  else
    not_ok "$name" "got $result expected $expected"
  fi
}

case23() {
  local name="23 preflight.json key order and newline"
  local proj keys
  proj=$(cat "$TMP/c1/proj_path")
  # Re-run to ensure fresh report
  run_preflight "$proj" >/dev/null 2>&1 || true
  # Check trailing newline
  if [ "$(tail -c 1 "$proj/port/state/preflight.json" | wc -l | tr -d ' ')" != "1" ]; then
    not_ok "$name" "missing trailing newline"
    return
  fi
  keys=$(awk '
    /^\{$/ { next }
    /^\}/ { next }
    /^  "[a-zA-Z]+"/ {
      key=$0
      sub(/^  "/, "", key)
      sub(/".*/, "", key)
      if (depth == 0 || NR) {
        # top-level keys only (two-space indent, not more)
      }
    }
    /^  "[^"]+":/ {
      line=$0
      if (line ~ /^  "[^"]+":/) {
        key=line
        sub(/^  "/, "", key)
        sub(/".*/, "", key)
        if (n++) printf " "
        printf "%s", key
      }
    }
  ' "$proj/port/state/preflight.json")
  expected="schemaVersion generatedAt status exitCode error project upstream toolchain conflicts identicalCount warnings"
  if [ "$keys" = "$expected" ]; then
    ok "$name"
  else
    not_ok "$name" "keys=[$keys]"
  fi
}

case24() {
  local name="24 port-notes preserves outside content"
  local up origin proj
  up="$TMP/c24/up"
  origin="$TMP/c24/origin.git"
  proj="$TMP/c24/proj"
  mkdir -p "$TMP/c24"
  make_upstream "$up"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"
  mkdir -p "$proj/docs"
  cat >"$proj/docs/port-notes.md" <<'EOF'
# Port notes

Keep this intro.

<!-- phase0:start -->
## Phase 0: Preflight
old block
<!-- phase0:end -->

Keep this outro.
EOF

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  if [ "$ec" -eq 0 ] && \
     grep -q 'Keep this intro.' "$proj/docs/port-notes.md" && \
     grep -q 'Keep this outro.' "$proj/docs/port-notes.md" && \
     grep -q '<!-- phase0:start -->' "$proj/docs/port-notes.md" && \
     ! grep -q 'old block' "$proj/docs/port-notes.md"; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out notes=$(cat "$proj/docs/port-notes.md")"
  fi
}

case15() {
  local name="15 project is behind origin"
  local up origin proj work
  up="$TMP/c15b/up"
  origin="$TMP/c15b/origin.git"
  proj="$TMP/c15b/proj"
  work="$TMP/c15b/work"
  mkdir -p "$TMP/c15b"
  make_upstream "$up"
  make_origin "$origin" identical

  git clone -q "$origin" "$proj"
  git -C "$proj" config user.email 'test@example.com'
  git -C "$proj" config user.name 'Test'
  rm -rf "$proj/port"
  cp -R "$PORT_SRC" "$proj/port"
  rm -rf "$proj/port/state" "$proj/port/test"
  mkdir -p "$proj/port/state"
  cat >"$proj/AGENTS.md" <<EOF
# AGENTS.md

## Constants

| Name | Value |
|---|---|
| \`UPSTREAM_PATH\` | \`$up\` |
| \`ORIGIN_URL\` | \`$origin\` |
| \`PRODUCT_NAME\` | \`Couchbase Traces\` |
EOF

  git clone -q "$origin" "$work"
  git -C "$work" config user.email 'test@example.com'
  git -C "$work" config user.name 'Test'
  # Add a file that does not conflict with upstream
  echo 'extra' >"$work/extra-remote.txt"
  git -C "$work" add extra-remote.txt
  git -C "$work" commit -qm 'ahead'
  git -C "$work" push -q origin main

  set +e
  out=$(run_preflight "$proj" 2>&1)
  ec=$?
  set -e

  local action
  action=$(json_field "$proj/port/state/preflight.json" branchAction)
  if [ "$ec" -eq 0 ] && [ "$action" = "fast_forwarded" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec action=$action out=$out"
  fi
}

# Run all cases
case1
case2
case3
case4
case5
case6
case7
case8
case9
case10
case11
case12
case13
case14
case15
case16
case17
case18
case19
case20
case21
case22
case23
case24

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
exit 0
