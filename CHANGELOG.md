# Couchbase Traces Changelog

Release-level highlights. Upstream history is in docs/upstream/CHANGELOG.md.

## v1.0.0 — 2026-11-26

<!-- cbt-release-notes version=1.0.0 inputs=r8-release -->

**Couchbase Traces 1.0.0**

The first release of Couchbase Traces: the full HyperDX observability product,
rebranded, running on Couchbase Server Enterprise 8.x and Capella with SQL++ in
place of ClickHouse. This release includes the 0.1.0 acceptance baseline, which
was never tagged.

### 💥 Breaking Changes

- **Couchbase replaces ClickHouse**: telemetry is stored in Magma collections
  and queried with SQL++. ClickHouse connections and data cannot be migrated.
- **App metadata is stored in Couchbase**: teams, users, sources, dashboards,
  saved searches, and alerts live in the `cbt_meta` bucket. MongoDB is no longer
  used or supported.
- **New environment prefix**: settings use the `CBT_` prefix (for example
  `CBT_COUCHBASE_CONNSTR`, `CBT_METADATA_*`, and `CBT_INGEST_*`). Upstream
  variable names are not read.
- **PromQL is not available**: Prometheus remote-write and PromQL tiles and
  filters were dropped with sign-off. Use SQL++ charts and filters instead.

### ✨ New Features

- **SQL++ data layer**: search (Lucene and SQL filters), the histogram, live
  tail, event patterns and deltas, charts and dashboards, traces and the service
  map, all five metric types, session replay, alerts, and Kubernetes views query
  Couchbase with named parameters.
- **Feature parity**: every upstream feature is ported or replaced. Two are
  dropped with sign-off (PromQL and the careers page); see
  [docs/parity.md](https://github.com/mminichino/couchbase-traces/blob/main/docs/parity.md).
- **Ingest setup**: the `ingest` service creates collections, indexes, and
  Search indexes, and on self-managed clusters optionally the buckets and users.
- **Capella support**: an override file points the stack at a Capella 8.x
  cluster; see
  [docs/capella.md](https://github.com/mminichino/couchbase-traces/blob/main/docs/capella.md).
- **Query attribution**: each query carries a client context id and a trailing
  comment naming its source, both visible in `system:completed_requests`.

### 🔀 Known differences from upstream

- An outer `HAVING` runs as a `WHERE` on a wrapper query. Results are the same,
  and some shapes that fail upstream now run.
- Unknown field names are rejected before MCP queries run, matching upstream's
  error.
- Table descriptions report indexes and document counts instead of ClickHouse
  table settings.
- Documents have no stored key order, so the JSON viewer's "original" order is
  alphabetical.

### 📋 Supported versions and images

- Couchbase Server Enterprise 8.0 or later (tested on 8.0.3), or Capella on 8.x,
  with the Data, Query, Index, and Search services. Community Edition and 7.x
  are not supported.
- Images: `ghcr.io/mminichino/couchbase-traces`,
  `ghcr.io/mminichino/couchbase-traces-ingest`, and
  `ghcr.io/mminichino/couchbase-traces-otel-collector`, tagged `1.0.0`, `1.0`,
  `1`, and `latest`. The all-in-one image is built locally only.
- The `cbt` CLI is attached to the GitHub release for Linux x64 and macOS.
