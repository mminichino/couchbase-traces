# @couchbase-traces/api

## 1.1.1

### Patch Changes

- Self-telemetry uses `@couchbase-traces/otel-node` instead of
  `@clickhouse/clickstack-node`. `CLICKSTACK_CAPTURE_HTTP_BODY` is renamed
  `CBT_CAPTURE_HTTP_BODY` (the old name is not read).

## 1.1.0

### Minor Changes

- Lock-stepped with the product at 1.1.0; no changes in this package.

## 1.0.2

### Patch Changes

- Lock-stepped with the product at 1.0.2. The development image locks its
  shared Yarn cache mount; the unused `IS_LOCAL_IMAGE` flag is removed.

## 1.0.1

### Patch Changes

- The UI and API image builds for amd64 and arm64 in one run again (locked Yarn
  cache mount).

## 1.0.0

### Major Changes

- First Couchbase Traces release, lock-stepped with the product at 1.0.0. See
  the root `CHANGELOG.md` for release notes.
