#!/usr/bin/env bash
# D33 guard. v1.0.0's release build failed because both platforms shared the
# `id=yarn-cache` BuildKit mount (default `sharing=shared`) and one platform
# ran `yarn cache clean` while the other linked from it. The release-image CI
# check builds each platform natively on its own runner (P15), which cannot
# reproduce a cross-platform race, so this checks the cause directly: every
# yarn cache mount is `sharing=locked` (or `private`), and no Dockerfile cleans
# the yarn cache. The release build pass (scripts/release/release-images.sh)
# still builds both platforms at once before anything is pushed.
#
#   scripts/ci/check-cache-mounts.sh [Dockerfile ...]
set -euo pipefail

cd "$(dirname "$0")/../.."
if [[ $# -gt 0 ]]; then
  files=("$@")
else
  files=()
  while IFS= read -r f; do files+=("$f"); done \
    < <(git ls-files '*Dockerfile' '*Dockerfile.*' '*.Dockerfile')
fi

status=0
for file in "${files[@]}"; do
  lineno=0
  while IFS= read -r line; do
    lineno=$((lineno + 1))
    for mount in $(grep -oE -- '--mount=type=cache[^ \\]*' <<<"$line" || true); do
      [[ $mount == *yarn* ]] || continue
      if [[ $mount != *sharing=locked* && $mount != *sharing=private* ]]; then
        echo "${file}:${lineno}: yarn cache mount without sharing=locked: ${mount}" >&2
        status=1
      fi
    done
    if grep -qE 'yarn cache clean' <<<"$line" && ! grep -qE '^\s*#' <<<"$line"; then
      echo "${file}:${lineno}: yarn cache clean on a shared cache mount (D33)" >&2
      status=1
    fi
  done <"$file"
done
[[ $status == 0 ]] && echo "cache mounts ok (${#files[@]} Dockerfiles)"
exit "$status"
