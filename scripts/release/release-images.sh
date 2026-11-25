#!/usr/bin/env bash
# Builds and pushes the release images (docs/v1-release-plan.md sections 5.1
# and 6.2). Run only on the user's explicit instruction, from a clean checkout
# of the v<version> tag (R8 step 5). --dry-run prints the plan and builds
# nothing.
#
#   scripts/release/release-images.sh <version> [--latest] \
#     [--platforms linux/amd64,linux/arm64] [--images app,ingest,otel-collector] \
#     [--dry-run]
#
# Every image is built for every platform first and pushed only after all
# builds succeed, so a failed architecture leaves nothing partial on ghcr.io.
# A re-run is idempotent: same inputs, same tags.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$REPO_ROOT"

REGISTRY=ghcr.io
NAMESPACE=mminichino
SOURCE_URL=https://github.com/mminichino/couchbase-traces

usage() {
  sed -n '7,10p' "$0" >&2
  exit 2
}

VERSION=""
LATEST=0
PLATFORMS=linux/amd64,linux/arm64
IMAGES=app,ingest,otel-collector
DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case $1 in
    --latest) LATEST=1 ;;
    --platforms) PLATFORMS=${2:?}; shift ;;
    --images) IMAGES=${2:?}; shift ;;
    --dry-run) DRY_RUN=1 ;;
    -*) usage ;;
    *) [[ -z $VERSION ]] || usage; VERSION=$1 ;;
  esac
  shift
done
[[ -n $VERSION ]] || usage

latest_flag=$([[ $LATEST == 1 ]] && echo true || echo false)
TAGS=$(node --input-type=module -e "
  import { imageTags, parseSemver, VersionInputError } from './scripts/release/semver.mjs';
  try {
    console.log(imageTags(parseSemver(process.argv[1]), { latest: ${latest_flag} }).join(' '));
  } catch (e) {
    console.error(e.message);
    process.exit(e instanceof VersionInputError ? 2 : 1);
  }" "$VERSION")

fail() {
  echo "release-images: $*" >&2
  exit 1
}

# image -> "<repo suffix>|<dockerfile>|<target>|<extra build flags>"
image_spec() {
  case $1 in
    app)
      echo "couchbase-traces|docker/hyperdx/Dockerfile|prod|--build-context hyperdx=./docker/hyperdx --build-context api=./packages/api --build-context app=./packages/app"
      ;;
    ingest) echo "couchbase-traces-ingest|packages/ingest/Dockerfile||" ;;
    otel-collector) echo "couchbase-traces-otel-collector|docker/otel-collector/Dockerfile|prod|" ;;
    all-in-one) fail "all-in-one is not published for 1.0 (decision Q1); use make build-all-in-one locally" ;;
    *) fail "unknown image '$1' (expected app, ingest, otel-collector)" ;;
  esac
}

IFS=',' read -r -a IMAGE_LIST <<<"$IMAGES"
for image in "${IMAGE_LIST[@]}"; do image_spec "$image" >/dev/null; done

if [[ $DRY_RUN == 0 ]]; then
  [[ -z $(git status --porcelain) ]] || fail "working tree is not clean"
  tag_sha=$(git rev-parse -q --verify "refs/tags/v${VERSION}^{commit}") ||
    fail "tag v${VERSION} does not exist"
  [[ $(git rev-parse HEAD) == "$tag_sha" ]] || fail "HEAD is not v${VERSION}"
  git fetch -q origin main
  git merge-base --is-ancestor HEAD origin/main || fail "v${VERSION} is not on origin/main"
  node scripts/release/set-version.mjs "$VERSION" --check >/dev/null ||
    fail "version locations are not all ${VERSION}; run make version VERSION=${VERSION}"
  docker buildx inspect >/dev/null 2>&1 || fail "docker buildx is not available"
fi
REVISION=$(git rev-parse HEAD)

build() {
  local image=$1 output=$2
  local suffix dockerfile target extra
  IFS='|' read -r suffix dockerfile target extra <<<"$(image_spec "$image")"
  local args=(buildx build . -f "$dockerfile" --platform "$PLATFORMS"
    --build-arg "CODE_VERSION=${VERSION}" --build-arg "GIT_SHA=${REVISION}"
    --label "org.opencontainers.image.source=${SOURCE_URL}")
  [[ -n $target ]] && args+=(--target "$target")
  # shellcheck disable=SC2206 # extra is a list of flags
  [[ -n $extra ]] && args+=($extra)
  for tag in $TAGS; do args+=(-t "${REGISTRY}/${NAMESPACE}/${suffix}:${tag}"); done
  args+=("$output")
  if [[ $DRY_RUN == 1 ]]; then
    echo "docker ${args[*]}"
  else
    docker "${args[@]}"
  fi
}

echo "Release images ${IMAGES} at ${VERSION} (tags: ${TAGS}; platforms: ${PLATFORMS})"
# Build pass: every image and platform into the builder cache, nothing pushed.
for image in "${IMAGE_LIST[@]}"; do build "$image" --output=type=cacheonly; done
# Push pass: the same builds, served from cache.
for image in "${IMAGE_LIST[@]}"; do
  build "$image" --push || fail "push of ${image} failed; images reported as pushed above landed, re-run to finish"
  if [[ $DRY_RUN == 1 ]]; then
    echo "would push ${image}: ${TAGS}"
  else
    echo "pushed ${image}: ${TAGS}"
  fi
done
