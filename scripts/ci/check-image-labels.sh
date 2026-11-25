#!/usr/bin/env bash
# Asserts a built image carries the release version metadata
# (docs/v1-release-plan.md section 6.2): the OCI version, revision, source and
# license labels, and CODE_VERSION in its environment.
#
#   scripts/ci/check-image-labels.sh <image> <expected-version> [<expected-revision>]
set -euo pipefail

IMAGE=${1:?usage: check-image-labels.sh <image> <expected-version> [<expected-revision>]}
VERSION=${2:?expected version required}
REVISION=${3:-}

label() {
  docker image inspect "$IMAGE" --format "{{ index .Config.Labels \"$1\" }}"
}

failures=0
expect() {
  local name=$1 want=$2 got=$3
  if [[ $got == "$want" ]]; then
    echo "ok   $name=$got"
  else
    echo "FAIL $name: expected '$want', got '$got'" >&2
    failures=$((failures + 1))
  fi
}

expect org.opencontainers.image.version "$VERSION" "$(label org.opencontainers.image.version)"
expect org.opencontainers.image.source https://github.com/mminichino/couchbase-traces \
  "$(label org.opencontainers.image.source)"
expect org.opencontainers.image.licenses MIT "$(label org.opencontainers.image.licenses)"
if [[ -n $REVISION ]]; then
  expect org.opencontainers.image.revision "$REVISION" "$(label org.opencontainers.image.revision)"
fi
code_version=$(docker image inspect "$IMAGE" --format '{{ range .Config.Env }}{{ println . }}{{ end }}' |
  sed -n 's/^CODE_VERSION=//p')
expect CODE_VERSION "$VERSION" "$code_version"

if [[ $failures -gt 0 ]]; then
  echo "$IMAGE: $failures version metadata check(s) failed" >&2
  exit 1
fi
