#!/usr/bin/env bash
# Shared Docker image builds for golden capture/replay stacks.
set -euo pipefail

golden_compose_build_ingest() {
  local root=$1
  local stage
  stage=$(mktemp -d)
  cp "$root/package.json" "$root/yarn.lock" "$root/.yarnrc.yml" "$root/tsconfig.base.json" "$stage/"
  mkdir -p "$stage/.yarn/releases" "$stage/.yarn/patches" "$stage/packages"
  cp -R "$root/.yarn/releases/." "$stage/.yarn/releases/"
  cp -R "$root/.yarn/patches/." "$stage/.yarn/patches/"
  local name
  for name in api app cli common-utils hdx-eval ingest otel-collector; do
    mkdir -p "$stage/packages/$name"
    cp "$root/packages/$name/package.json" "$stage/packages/$name/package.json"
  done
  cp -R "$root/packages/common-utils/." "$stage/packages/common-utils/"
  rm -rf "$stage/packages/common-utils/node_modules" "$stage/packages/common-utils/dist" "$stage/packages/common-utils/coverage"
  cp -R "$root/packages/ingest/." "$stage/packages/ingest/"
  rm -rf "$stage/packages/ingest/node_modules" "$stage/packages/ingest/dist" "$stage/packages/ingest/coverage"
  docker build -f "$root/packages/ingest/Dockerfile" \
    -t cbt-golden-ingest:local \
    -t cbt-ingest-parity:local \
    "$stage"
  rm -rf "$stage"
}

golden_compose_build_collector() {
  local root=$1
  local tag=${2:-cbt-golden-collector:local}
  local stage
  stage=$(mktemp -d)
  mkdir -p "$stage/packages" "$stage/docker"
  cp -R "$root/packages/otel-collector" "$stage/packages/otel-collector"
  cp -R "$root/docker/otel-collector" "$stage/docker/otel-collector"
  docker build -f "$root/docker/otel-collector/Dockerfile" \
    -t "$tag" \
    -t cbt-ingest-parity-collector:local \
    "$stage"
  rm -rf "$stage"
}
