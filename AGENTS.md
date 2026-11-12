# AGENTS.md

Project context for coding assistants working on Couchbase Traces. Read this file in full before any task. The phased work plan is in `COUCHBASE_PORT_PLAN.md`; run its phases in order and follow the rules here throughout.

## Goal

Turn this project into Couchbase Traces: the full HyperDX product, rebranded, running on Couchbase Server Enterprise 8.x / Capella with SQL++ in place of ClickHouse. Every HyperDX feature is preserved.

## Constants

Change these here and nowhere else. The plan and every phase refer to them by name.

| Name | Value |
|---|---|
| `UPSTREAM_PATH` | `/Users/michael/IdeaProjects/hyperdx` |
| `ORIGIN_URL` | `https://github.com/mminichino/couchbase-traces.git` |
| `PRODUCT_NAME` | `Couchbase Traces` |
| `PRODUCT_SLUG` | `couchbase-traces` |
| `NPM_SCOPE` | `@couchbase-traces` |
| `ENV_PREFIX` | `CBT_` |
| `BRAND_ASSETS` | `branding/` in this project (logo SVGs, favicon, color tokens) |
| `COUCHBASE_VERSION` | Couchbase Server Enterprise 8.x; minimum 8.0 |
| `COUCHBASE_DOCS` | `https://docs.couchbase.com/server/8.0/` |

## Target platform

- Couchbase Server Enterprise Edition 8.x, self-managed, and Capella clusters running 8.x. No support for 7.x or Community Edition, so Enterprise-only features such as window functions and anything introduced in 8.0 are allowed.
- Services required: Data, Query, Index, Search.
- Buckets use Magma storage, the 8.0 default.
- Check every SQL++ function, system keyspace, RBAC role, and REST endpoint against `COUCHBASE_DOCS`, not against older documentation or memory.
- Use the current Couchbase Node SDK 4.x release that lists Server 8.0 as supported.
- Dev and CI pin one Enterprise 8.0.x image tag, the latest maintenance release available on Docker Hub. Record the tag in `docs/port-notes.md`.

## Scope

Full feature parity with the imported HyperDX commit:

- Search: Lucene and SQL filters, histogram, results table, row detail, field sidebar, live tail, saved searches, event patterns, event deltas.
- Chart explorer and dashboards, including every aggregation and chart type.
- Traces: span search, waterfall, service map, log and trace correlation.
- Metrics: gauge, sum, histogram, exponential histogram, summary.
- Session replay.
- Alerts and every scheduled task that queries the data store.
- Kubernetes and any other preset views.
- Ingestion through the OpenTelemetry collector.
- Sources and connections, teams, users, auth, API keys, and the external API.

Nothing is removed for being hard to port. A feature is dropped only with written sign-off recorded in `docs/parity.md`.

## Rules

1. Work one phase at a time. Each phase ends with lint, type check, and unit tests green, then one commit. Do not start the next phase with a red build.
2. Verify every path and symbol named in the plan against the imported source before editing. Upstream moves fast and names here come from a point-in-time reading. Record corrections in `docs/port-notes.md`.
3. Never import the `couchbase` npm package from `packages/app` or from any module the browser bundle reaches. It is a native addon and runs server-side only.
4. Every SQL++ statement uses named parameters for values. Identifiers are backtick-quoted through one helper that rejects any identifier containing a backtick.
5. Do not edit ClickHouse modules in place. Build the Couchbase data layer alongside them and switch features over one slice at a time through the seam in Phase 6. ClickHouse code is deleted in Phase 10.
6. The upstream unit and integration tests are the specification. Port each test with its feature: same inputs, SQL++ expected output, same result shape.
7. Never push to `origin` without an explicit instruction from the user. Do not commit credentials, `.env` files with secrets, or Capella connection strings.
8. Keep `LICENSE` and the upstream copyright line intact in every phase.
9. Stop and ask when: an existing file conflicts with an imported path at Phase 0, brand assets are missing from `BRAND_ASSETS`, or a feature cannot be expressed in SQL++ with the same result shape.
