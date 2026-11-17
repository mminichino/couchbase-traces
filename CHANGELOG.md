# Couchbase Traces Changelog

Release-level highlights. Upstream history is in docs/upstream/CHANGELOG.md.

## v0.1.0 — 2026-11-16

<!-- cbt-release-notes version=0.1.0 inputs=phase11-acceptance -->

**Couchbase Traces acceptance baseline**

Phase 11 acceptance runs against Couchbase Server Enterprise 8.x with SQL++.
PromQL was dropped with sign-off in docs/parity.md.

### 💥 Breaking Changes

- **PromQL is not available**: Prometheus remote-write / PromQL tiles and filters
  were removed; use SQL++ charts and filters against Couchbase collections.

### ✨ New Features

- **SQL++ chart and search path**: charts, search, traces, metrics, sessions, and
  alerts query Couchbase via SQL++ with named parameters and Magma collections.
