#!/usr/bin/env bash
# Phase 1 import test runner.
set -euo pipefail

TEST_ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
PORT_SRC="$TEST_ROOT/port"
PREFLIGHT="$PORT_SRC/preflight.sh"
IMPORT="$PORT_SRC/import.sh"
CHECK="$PORT_SRC/check.sh"
FIXTURES="$PORT_SRC/test/fixtures"
STUB_YARN="$FIXTURES/stub-yarn"
chmod +x "$STUB_YARN"

PASS=0
FAIL=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"; rm -f "$FIXTURES"/.net-once' EXIT

ok() { printf 'ok %s\n' "$1"; PASS=$((PASS + 1)); }
not_ok() { printf 'not ok %s — %s\n' "$1" "$2"; FAIL=$((FAIL + 1)); }
# Line-buffer status lines when stdout is redirected.
if [ ! -t 1 ]; then
  ok() { printf 'ok %s\n' "$1"; PASS=$((PASS + 1)); }
  not_ok() { printf 'not ok %s — %s\n' "$1" "$2"; FAIL=$((FAIL + 1)); }
fi

json_field() {
  local file="$1" key="$2"
  awk -v key="$key" '
    {
      re = "\"" key "\"[[:space:]]*:"
      if (match($0, re)) {
        line=$0
        sub(/^[^:]*:[[:space:]]*/, "", line)
        sub(/,[[:space:]]*$/, "", line)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if (line ~ /^"/) { sub(/^"/,"",line); sub(/"$/,"",line) }
        print line; exit
      }
    }
  ' "$file"
}

NODE_BIN_DIR=$(cd "$(dirname "$(command -v node)")" && pwd -P)

make_upstream() {
  local dir="$1"
  local with_agents="${2:-0}"
  local license="${3:-mit}"
  local with_notice="${4:-0}"
  local with_claude="${5:-0}"
  local with_port="${6:-0}"
  local with_checks="${7:-1}"

  mkdir -p "$dir/packages/app" "$dir/packages/api" "$dir/packages/common-utils" "$dir/scripts"
  echo 'app' >"$dir/packages/app/index.js"
  echo 'api' >"$dir/packages/api/index.js"
  echo 'common' >"$dir/packages/common-utils/index.js"
  echo '{}' >"$dir/packages/app/tsconfig.json"
  printf '{\n  "name": "@hyperdx/app"\n}\n' >"$dir/packages/app/package.json"
  echo 'space' >"$dir/my file.txt"
  printf 'v22.16.0\n' >"$dir/.nvmrc"
  printf '{\n  "name": "hyperdx",\n  "packageManager": "yarn@4.5.1",\n  "scripts": {}\n}\n' >"$dir/package.json"
  echo 'upstream readme' >"$dir/README.md"

  if [ "$license" = "mit" ]; then
    cat >"$dir/LICENSE" <<'EOF'
MIT License

Copyright (c) 2023 Example, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
EOF
  else
    cat >"$dir/LICENSE" <<'EOF'
Apache License
Version 2.0, January 2004
Copyright (c) 2023 Example, Inc.
EOF
  fi

  echo 'ignored-but-tracked.txt' >"$dir/.gitignore"
  echo 'tracked despite ignore' >"$dir/ignored-but-tracked.txt"
  echo '#!/bin/sh' >"$dir/scripts/run.sh"
  echo 'echo run' >>"$dir/scripts/run.sh"
  chmod +x "$dir/scripts/run.sh"
  ln -s README.md "$dir/link"

  if [ "$with_checks" = "1" ]; then
    cat >"$dir/Makefile" <<'EOF'
ci-lint:
	yarn run lint-stub
ci-unit:
	yarn run unit-stub
EOF
  else
    echo '# no targets' >"$dir/Makefile"
    rm -f "$dir/packages/app/tsconfig.json"
  fi

  if [ "$with_agents" = "1" ]; then
    echo '# upstream agents' >"$dir/AGENTS.md"
  fi
  if [ "$with_claude" = "1" ]; then
    echo '# claude' >"$dir/CLAUDE.md"
  fi
  if [ "$with_notice" = "1" ]; then
    echo 'Upstream NOTICE line' >"$dir/NOTICE"
  fi
  if [ "$with_port" = "1" ]; then
    mkdir -p "$dir/port"
    echo 'x' >"$dir/port/x"
  fi

  git -C "$dir" init -q
  git -C "$dir" symbolic-ref HEAD refs/heads/main
  git -C "$dir" config user.email 'test@example.com'
  git -C "$dir" config user.name 'Test'
  git -C "$dir" add -A
  git -C "$dir" add -f ignored-but-tracked.txt
  git -C "$dir" commit -qm 'initial'
  git -C "$dir" tag '@hyperdx/app@9.9.9'
}

make_origin() {
  local dir="$1"
  git init --bare -q "$dir"
}

make_project() {
  local dir="$1" up="$2" origin="$3"
  mkdir -p "$dir"
  rm -rf "$dir/port"
  cp -R "$PORT_SRC" "$dir/port"
  rm -rf "$dir/port/state" "$dir/port/test"
  mkdir -p "$dir/port/state" "$dir/port/test"
  # keep fixtures available for stub path via absolute STUB_YARN
  cat >"$dir/AGENTS.md" <<EOF
# AGENTS.md

## Constants

| Name | Value |
|---|---|
| \`UPSTREAM_PATH\` | \`$up\` |
| \`ORIGIN_URL\` | \`$origin\` |
| \`PRODUCT_NAME\` | \`Couchbase Traces\` |
EOF
}

run_pf() {
  local proj="$1"
  CBT_PORT_NODE_BIN="$NODE_BIN_DIR" \
    bash "$proj/port/preflight.sh" --quiet "$@"
}

setup_phase0() {
  local proj="$1"
  run_pf "$proj" >/dev/null 2>&1 || true
  # commit phase 0 like outputs
  git -C "$proj" config user.email 'test@example.com'
  git -C "$proj" config user.name 'Test'
  git -C "$proj" add AGENTS.md port docs/port-notes.md 2>/dev/null || true
  # PHASE_0_SPEC optional
  git -C "$proj" add -A port docs 2>/dev/null || true
  git -C "$proj" add AGENTS.md 2>/dev/null || true
  if ! git -C "$proj" diff --cached --quiet 2>/dev/null; then
    git -C "$proj" commit -qm 'Add port preflight'
  elif [ -z "$(git -C "$proj" log --oneline 2>/dev/null)" ]; then
    # force add state
    git -C "$proj" add -f port/state/preflight.json AGENTS.md port docs/port-notes.md 2>/dev/null || true
    git -C "$proj" commit -qm 'Add port preflight' --allow-empty
    git -C "$proj" add -f port AGENTS.md docs/port-notes.md
    git -C "$proj" commit -qm 'Add port preflight' 2>/dev/null || \
      git -C "$proj" commit -qm 'Add port preflight' --allow-empty
  fi
  # Ensure preflight.json exists and is committed
  if [ ! -f "$proj/port/state/preflight.json" ]; then
    run_pf "$proj" >/dev/null 2>&1 || true
  fi
  git -C "$proj" add -f port/state/preflight.json port docs/port-notes.md AGENTS.md
  git -C "$proj" diff --cached --quiet || git -C "$proj" commit -qm 'Add port preflight'
}

run_import() {
  local proj="$1"
  shift
  CBT_PORT_NODE_BIN="$NODE_BIN_DIR" \
  CBT_PORT_YARN_CMD="$STUB_YARN" \
  CBT_PORT_NO_NVM=1 \
  CBT_STUB_NET_FLAG="$TMP/net-once-$$" \
    bash "$proj/port/import.sh" "$@"
}

run_check() {
  local proj="$1"
  shift
  CBT_PORT_NODE_BIN="$NODE_BIN_DIR" \
  CBT_PORT_YARN_CMD="$STUB_YARN" \
  CBT_PORT_NO_NVM=1 \
    bash "$proj/port/check.sh" "$@"
}

# ---- helpers to build a ready project ----
fresh() {
  local name="$1"
  local with_agents="${2:-0}"
  local license="${3:-mit}"
  local with_notice="${4:-0}"
  local with_claude="${5:-0}"
  local with_port="${6:-0}"
  local with_checks="${7:-1}"
  local up origin proj
  up="$TMP/$name/up"
  origin="$TMP/$name/origin.git"
  proj="$TMP/$name/proj"
  mkdir -p "$TMP/$name"
  make_upstream "$up" "$with_agents" "$license" "$with_notice" "$with_claude" "$with_port" "$with_checks"
  make_origin "$origin"
  make_project "$proj" "$up" "$origin"
  # preflight + commit
  set +e
  out=$(CBT_PORT_NODE_BIN="$NODE_BIN_DIR" bash "$proj/port/preflight.sh" --quiet 2>&1)
  ec=$?
  set -e
  if [ "$ec" -ne 0 ]; then
    echo "$proj|$up|$origin|PF_FAIL:$ec:$out"
    return 0
  fi
  git -C "$proj" config user.email 'test@example.com'
  git -C "$proj" config user.name 'Test'
  git -C "$proj" add AGENTS.md port docs/port-notes.md
  git -C "$proj" commit -qm 'Add port preflight'
  echo "$proj|$up|$origin|ok"
}

# ========== cases ==========

case1() {
  local name="1 clean project, no AGENTS.md"
  local info proj
  info=$(fresh c1 0)
  proj="${info%%|*}"; rest="${info#*|}"
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac

  set +e
  out=$(run_import "$proj" run 2>&1)
  ec=$?
  set -e
  next=$(json_field "$proj/port/state/import.json" nextStep)
  count=$(json_field "$proj/port/state/import.json" importedFileCount)
  up_count=$(git -C "${rest%%|*}" ls-files | grep -cv '^AGENTS.md$' || git -C "${info#*|}" ls-files | wc -l)
  # recount from upstream
  up="${info#*|}"; up="${up%%|*}"
  up_count=$(git -C "$up" ls-files -z -- . ':(exclude)AGENTS.md' | tr -cd '\0' | wc -c | tr -d ' ')
  if [ "$ec" -eq 0 ] && [ "$next" = "commit" ] && [ "$count" = "$up_count" ]; then
    echo "$proj" >"$TMP/c1_proj"
    ok "$name"
  else
    not_ok "$name" "ec=$ec next=$next count=$count up=$up_count out=$out"
  fi
}

case2() {
  local name="2 commit after case 1"
  local proj
  proj=$(cat "$TMP/c1_proj")
  set +e
  out=$(run_import "$proj" commit 2>&1)
  ec=$?
  set -e
  subj=$(git -C "$proj" log -1 --format=%s)
  if [ "$ec" -eq 0 ] && [[ "$subj" == Import\ HyperDX\ at\ * ]]; then
    echo "$proj" >"$TMP/c2_proj"
    ok "$name"
  else
    not_ok "$name" "ec=$ec subj=$subj out=$out"
  fi
}

case3() {
  local name="3 upstream tracks AGENTS.md"
  local info proj up
  info=$(fresh c3 1)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  up=$(echo "$info" | cut -d'|' -f2)
  agents_before=$(cat "$proj/AGENTS.md")
  set +e
  out=$(run_import "$proj" run 2>&1)
  ec=$?
  set -e
  next=$(json_field "$proj/port/state/import.json" nextStep)
  if [ "$ec" -eq 0 ] && [ "$next" = "agents_merge" ] && \
     cmp -s "$proj/docs/upstream-AGENTS.md" <(git -C "$up" show HEAD:AGENTS.md) && \
     [ "$(cat "$proj/AGENTS.md")" = "$agents_before" ]; then
    echo "$proj" >"$TMP/c3_proj"
    ok "$name"
  else
    not_ok "$name" "ec=$ec next=$next out=$out"
  fi
}

case4() {
  local name="4 commit without merge"
  local proj
  proj=$(cat "$TMP/c3_proj")
  set +e
  out=$(run_import "$proj" commit 2>&1)
  ec=$?
  set -e
  if [ "$ec" -eq 80 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case5() {
  local name="5 valid agents merge then commit"
  local info proj
  info=$(fresh c5 1)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  run_import "$proj" run >/dev/null 2>&1
  set -e
  sha12=$(json_field "$proj/port/state/preflight.json" sha | cut -c1-12)
  cat >>"$proj/AGENTS.md" <<EOF

## Upstream conventions

Merged from AGENTS.md at upstream commit ${sha12}. The sections above take precedence over anything here.

### Commands
- Use \`make ci-lint\`
EOF
  set +e
  out=$(run_import "$proj" commit 2>&1)
  ec=$?
  set -e
  if [ "$ec" -eq 0 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case6() {
  local name="6 insert above upstream conventions"
  local info proj
  info=$(fresh c6 1)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  run_import "$proj" run >/dev/null 2>&1
  set -e
  sha12=$(json_field "$proj/port/state/preflight.json" sha | cut -c1-12)
  head_content=$(git -C "$proj" show HEAD:AGENTS.md)
  printf '%s\n\nbad line\n\n## Upstream conventions\n\nMerged from AGENTS.md at upstream commit %s.\n' \
    "$head_content" "$sha12" >"$proj/AGENTS.md"
  set +e
  out=$(run_import "$proj" commit 2>&1)
  ec=$?
  set -e
  if [ "$ec" -eq 80 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case7() {
  local name="7 run twice before commit"
  local info proj
  info=$(fresh c7 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out1=$(run_import "$proj" run 2>&1); ec1=$?
  out2=$(run_import "$proj" run 2>&1); ec2=$?
  set -e
  ident=$(json_field "$proj/port/state/import.json" identicalPreexisting)
  count=$(json_field "$proj/port/state/import.json" importedFileCount)
  if [ "$ec1" -eq 0 ] && [ "$ec2" -eq 0 ] && [ "$ident" = "$count" ]; then
    ok "$name"
  else
    not_ok "$name" "ec1=$ec1 ec2=$ec2 ident=$ident count=$count"
  fi
}

case8() {
  local name="8 run after commit"
  local proj
  proj=$(cat "$TMP/c2_proj" 2>/dev/null || true)
  if [ -z "$proj" ] || [ ! -d "$proj" ]; then
    not_ok "$name" "missing c2 project"
    return
  fi
  set +e
  out=$(run_import "$proj" run 2>&1)
  ec=$?
  set -e
  if [ "$ec" -eq 62 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case9() {
  local name="9 upstream HEAD moved"
  local info proj up
  info=$(fresh c9 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"; up=$(echo "$info" | cut -d'|' -f2)
  echo dirty >>"$up/README.md"
  git -C "$up" add README.md
  git -C "$up" commit -qm 'moved'
  set +e
  out=$(run_import "$proj" run 2>&1)
  ec=$?
  set -e
  if [ "$ec" -eq 35 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case10() {
  local name="10 Apache license"
  local info proj
  info=$(fresh c10 0 apache)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(run_import "$proj" run 2>&1)
  ec=$?
  set -e
  if [ "$ec" -eq 37 ] && [ ! -f "$proj/LICENSE" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec license_exists=$(test -f "$proj/LICENSE" && echo y || echo n) out=$out"
  fi
}

case11() {
  local name="11 upstream tracks port/x"
  local info proj
  info=$(fresh c11 0 mit 0 0 1)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(run_import "$proj" run 2>&1)
  ec=$?
  set -e
  if [ "$ec" -eq 41 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case12() {
  local name="12 upstream NOTICE append"
  local info proj
  info=$(fresh c12 0 mit 1)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(run_import "$proj" run 2>&1); ec=$?
  set -e
  if [ "$ec" -ne 0 ]; then not_ok "$name" "run ec=$ec out=$out"; return; fi
  if ! head -1 "$proj/NOTICE" | grep -q 'Upstream NOTICE'; then
    not_ok "$name" "NOTICE missing upstream start"; return
  fi
  if ! grep -q 'derived from HyperDX' "$proj/NOTICE"; then
    not_ok "$name" "NOTICE missing block: $(cat "$proj/NOTICE")"; return
  fi
  set +e
  out=$(run_import "$proj" run 2>&1); ec2=$?
  set -e
  if [ "$ec2" -ne 0 ]; then not_ok "$name" "re-run ec=$ec2 out=$out"; return; fi
  count=$(grep -c 'derived from HyperDX' "$proj/NOTICE" || true)
  set +e
  out=$(run_import "$proj" commit 2>&1); ec=$?
  set -e
  if [ "$count" -eq 1 ] && [ "$ec" -eq 0 ]; then ok "$name"; else not_ok "$name" "count=$count ec=$ec"; fi
}

case13() {
  local name="13 CLAUDE.md only"
  local info proj
  info=$(fresh c13 0 mit 0 1)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(run_import "$proj" run 2>&1); ec=$?
  set -e
  next=$(json_field "$proj/port/state/import.json" nextStep)
  copied=$(json_field "$proj/port/state/import.json" upstreamAgentsCopiedTo)
  if [ "$ec" -eq 0 ] && [ "$next" = "agents_merge" ] && [ "$copied" = "null" ]; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec next=$next copied=$copied out=$out"
  fi
}

case14() {
  local name="14 force-added ignored file"
  local proj
  # c1 already committed in case2 — use c2
  proj=$(cat "$TMP/c2_proj")
  # Avoid `ls-files | grep -q` under pipefail: grep -q closes early → SIGPIPE → false negative.
  if git -C "$proj" ls-files --error-unmatch -- ignored-but-tracked.txt >/dev/null 2>&1; then
    ok "$name"
  else
    not_ok "$name" "not in ls-files"
  fi
}

case15() {
  local name="15 executable and symlink modes"
  local proj
  proj=$(cat "$TMP/c2_proj")
  mode_ex=$(git -C "$proj" ls-files -s -- scripts/run.sh | awk '{print $1}')
  mode_link=$(git -C "$proj" ls-files -s -- link | awk '{print $1}')
  if [ "$mode_ex" = "100755" ] && [ "$mode_link" = "120000" ]; then
    ok "$name"
  else
    not_ok "$name" "ex=$mode_ex link=$mode_link"
  fi
}

case16() {
  local name="16 install fail"
  local info proj
  info=$(fresh c16 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(STUB_INSTALL_FAIL=1 run_import "$proj" run 2>&1); ec=$?
  set -e
  st=$(json_field "$proj/port/state/import.json" status)
  if [ "$ec" -eq 68 ] && [ "$st" = "fail" ]; then ok "$name"; else not_ok "$name" "ec=$ec st=$st out=$out"; fi
}

case17() {
  local name="17 install network retry"
  local info proj
  info=$(fresh c17 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  rm -f "$TMP/net-once-$$" "$FIXTURES/.net-once"
  set +e
  out=$(CBT_STUB_NET_FLAG="$TMP/net-once-$$" STUB_INSTALL_NETWORK_ONCE=1 run_import "$proj" run 2>&1); ec=$?
  set -e
  attempts=$(json_field "$proj/port/state/import.json" attempts)
  if [ "$ec" -eq 0 ] && [ "$attempts" = "2" ]; then ok "$name"; else not_ok "$name" "ec=$ec attempts=$attempts out=$out"; fi
}

case18() {
  local name="18 install mutates tracked file"
  local info proj
  info=$(fresh c18 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(STUB_INSTALL_TOUCH=1 run_import "$proj" run 2>&1); ec=$?
  set -e
  if [ "$ec" -eq 69 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case19() {
  local name="19 check timeout"
  local info proj
  info=$(fresh c19 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(CBT_PORT_TIMEOUT_SECONDS=1 STUB_SLEEP=5 run_import "$proj" run 2>&1); ec=$?
  set -e
  # install also times out with STUB_SLEEP — that would be E_INSTALL_FAILED 68
  # Spec: checks timed_out — so sleep should apply to checks not install.
  # stub sleeps on every invocation including install. Need install without sleep.
  # Re-run with sleep only for checks: install first normally then... 
  # Adjust: STUB_SLEEP only after install by using env in make targets — for stub, skip sleep on install
  not_ok "$name" "deferred-fix-stub: $ec $out"
}

case20() {
  local name="20 parsers"
  # shellcheck disable=SC1090
  PF_PROJECT_ROOT="$TMP"
  PF_WARN_CODES=(); PF_WARN_MESSAGES=()
  . "$PORT_SRC/lib/log.sh"
  . "$PORT_SRC/lib/proc.sh"
  . "$PORT_SRC/lib/baseline.sh"
  parse_jest "$FIXTURES/jest-sample.txt"
  parse_eslint "$FIXTURES/eslint-sample.txt"
  IM_TS_ERRORS=()
  parse_tsc "$FIXTURES/tsc-sample.txt" "packages/app"
  if [ "$IM_T_TOTAL" = "4" ] && [ "$IM_T_FAILED" = "1" ] && [ "$IM_T_PASSED" = "3" ] && \
     [ "$IM_L_ERRORS" = "1" ] && [ "$IM_L_WARNINGS" = "1" ] && \
     [ ${#IM_T_SUITES[@]} -eq 1 ] && [ ${#IM_L_FILES[@]} -eq 1 ] && \
     [ ${#IM_TS_ERRORS[@]} -eq 2 ]; then
    ok "$name"
  else
    not_ok "$name" "t=$IM_T_TOTAL/$IM_T_FAILED l=$IM_L_ERRORS/$IM_L_WARNINGS suites=${#IM_T_SUITES[@]} files=${#IM_L_FILES[@]} ts=${#IM_TS_ERRORS[@]}"
  fi
}

case21() {
  local name="21 baseline empty"
  local info proj
  info=$(fresh c21 0 mit 0 0 0 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(run_import "$proj" run 2>&1); ec=$?
  set -e
  if [ "$ec" -eq 71 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case22() {
  local name="22 check.sh no regressions"
  local info proj
  info=$(fresh c22 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  run_import "$proj" run >/dev/null 2>&1 || true
  run_import "$proj" commit >/dev/null 2>&1 || true
  out=$(run_check "$proj" 2>&1); ec=$?
  set -e
  if [ "$ec" -eq 0 ]; then ok "$name"; echo "$proj" >"$TMP/c22_proj"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case23() {
  local name="23 check.sh regressions"
  local proj
  proj=$(cat "$TMP/c22_proj" 2>/dev/null || true)
  if [ -z "$proj" ]; then not_ok "$name" "no c22"; return; fi
  set +e
  out=$(STUB_UNIT_EXTRA_FAIL=1 run_check "$proj" 2>&1); ec=$?
  set -e
  if [ "$ec" -eq 90 ] && grep -q new_failing_suite "$proj/port/state/check.json" && \
     grep -q failed_count "$proj/port/state/check.json"; then
    ok "$name"
  else
    not_ok "$name" "ec=$ec out=$out"
  fi
}

case24() {
  local name="24 unexpected staged file"
  local info proj
  info=$(fresh c24 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  run_import "$proj" run >/dev/null 2>&1 || true
  set -e
  echo stray >"$proj/stray.txt"
  git -C "$proj" add stray.txt
  set +e
  out=$(run_import "$proj" commit 2>&1); ec=$?
  set -e
  if [ "$ec" -eq 83 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case25() {
  local name="25 wrong branch"
  local info proj
  info=$(fresh c25 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  git -C "$proj" checkout -q -b other
  set +e
  out=$(run_import "$proj" run 2>&1); ec=$?
  set -e
  if [ "$ec" -eq 61 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$out"; fi
}

case26() {
  local name="26 json_get"
  . "$PORT_SRC/lib/state.sh"
  local f="$TMP/sample.json"
  cat >"$f" <<'EOF'
{
  "schemaVersion": 1,
  "upstream": {
    "sha": "abc",
    "appReleaseTag": null
  },
  "msg": "quote:\" back\\slash"
}
EOF
  local v ec
  v=$(json_get "$f" schemaVersion); ec=$?
  v2=$(json_get "$f" upstream.sha); ec2=$?
  set +e
  v3=$(json_get "$f" upstream.appReleaseTag); ec3=$?
  set -e
  v4=$(json_get "$f" msg); ec4=$?
  if [ "$ec" -eq 0 ] && [ "$v" = "1" ] && [ "$v2" = "abc" ] && [ "$ec3" -eq 3 ] && \
     [ "$ec4" -eq 0 ] && [ "$v4" = 'quote:" back\slash' ]; then
    ok "$name"
  else
    not_ok "$name" "v=$v ec3=$ec3 v4=$v4"
  fi
}

case27() {
  local name="27 phase0 suite still passes"
  set +e
  out=$(bash "$PORT_SRC/test/preflight_test.sh" 2>&1)
  ec=$?
  set -e
  if [ "$ec" -eq 0 ]; then ok "$name"; else not_ok "$name" "ec=$ec out=$(echo "$out" | tail -5)"; fi
}

# Fix stub-yarn to not sleep on install
fix_stub_sleep() {
  # patch is in stub: only sleep if not install — already sleeps before all; update stub
  :
}

# Rewrite case19 properly after fixing stub
fix_case19() {
  # Update stub-yarn: move sleep after install check
  cat >"$STUB_YARN" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
FIXTURES=$(cd "$(dirname "$0")" && pwd -P)
if [ "${1:-}" = "--version" ]; then echo '4.5.1'; exit 0; fi
if [ "${1:-}" = "install" ]; then
  if [ "${STUB_INSTALL_NETWORK_ONCE:-0}" = "1" ]; then
    flag="${CBT_STUB_NET_FLAG:-$FIXTURES/.net-once}"
    if [ ! -f "$flag" ]; then touch "$flag"; echo 'ECONNRESET network error' >&2; exit 1; fi
  fi
  if [ "${STUB_INSTALL_FAIL:-0}" = "1" ]; then echo 'install failed' >&2; exit 1; fi
  if [ "${STUB_INSTALL_TOUCH:-0}" = "1" ] && [ -f README.md ]; then echo touched >>README.md; fi
  exit 0
fi
if [ "${STUB_SLEEP:-0}" != "0" ]; then sleep "$STUB_SLEEP"; fi
if [ "${1:-}" = "run" ] && [ "${2:-}" = "lint-stub" ]; then cat "$FIXTURES/eslint-sample.txt"; exit 1; fi
if [ "${1:-}" = "run" ] && [ "${2:-}" = "unit-stub" ]; then
  cat "$FIXTURES/jest-sample.txt"
  if [ "${STUB_UNIT_EXTRA_FAIL:-0}" = "1" ]; then
    echo 'FAIL src/__tests__/extra.test.ts'
    echo 'Tests:       2 failed, 3 passed, 0 skipped, 5 total'
  fi
  exit 1
fi
if [ "${1:-}" = "workspace" ] && [ "${3:-}" = "exec" ]; then cat "$FIXTURES/tsc-sample.txt"; exit 1; fi
echo "stub-yarn: unknown: $*" >&2; exit 1
EOF
  chmod +x "$STUB_YARN"
}

case19_fixed() {
  local name="19 check timeout"
  fix_case19
  local info proj
  info=$(fresh c19b 0)
  case "$info" in *PF_FAIL*) not_ok "$name" "$info"; return ;; esac
  proj="${info%%|*}"
  set +e
  out=$(CBT_PORT_TIMEOUT_SECONDS=1 STUB_SLEEP=5 run_import "$proj" run 2>&1); ec=$?
  set -e
  lint_st=$(json_field "$proj/port/state/baseline.json" status | head -1)
  # get lint status specifically
  lint_st=$(awk '/"lint"/{getline; if (match($0,/"status"/)) {gsub(/.*"status": "|".*/,""); print; exit}}' "$proj/port/state/baseline.json" 2>/dev/null || true)
  lint_st=$(json_get_lint_status "$proj/port/state/baseline.json")
  if [ "$ec" -eq 0 ] && grep -q 'W_CHECK_TIMED_OUT' "$proj/port/state/import.json" && \
     ! pgrep -f "STUB_SLEEP" >/dev/null 2>&1; then
    ok "$name"
  else
    # check baseline lint status timed_out
    if [ "$ec" -eq 0 ] && grep -q timed_out "$proj/port/state/baseline.json"; then
      ok "$name"
    else
      not_ok "$name" "ec=$ec out=$(echo "$out" | tail -3)"
    fi
  fi
}

json_get_lint_status() { json_field "$1" status; }

# Run
fix_case19
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
case19_fixed
case20
case21
case22
case23
case24
case25
case26
case27

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
