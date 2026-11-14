# Couchbase parity goldens (Phase 10 commit 1)

This directory holds **Couchbase-only** normalized results captured from the parity suites while ClickHouse still exists. After Phase 10 removes ClickHouse, `port/golden/run.sh` replaces `port/ingest-parity`, `port/query-parity`, and `port/server-parity` for regression checks.

## Anchor time

Every golden uses an **anchor**: current time floored to 00:00 UTC on the most recent Monday. Datasets are loaded in the hour before that anchor (see `lib/dataset.mjs`). Timestamp fields in stored results are **offsets in milliseconds** from the anchor (`lib/anchor.mjs`).

## Capture (once, with ClickHouse)

```bash
port/golden/capture.sh
```

1. Runs `port/ingest-parity`, `port/query-parity` (all chart slices), and `port/server-parity` — all must pass.
2. Brings parity stacks back up and writes Couchbase-side results under `port/golden/<suite>/<case-id>.json`.
3. Writes `port/golden/manifest.json` with per-suite counts and the git SHA.

If any gate suite fails, capture exits `1` and does not install staged goldens.

**Requirements:** Docker, free host ports, `packages/common-utils` buildable, ClickHouse + Couchbase Enterprise images as used by ingest-parity.

## Replay (Couchbase only)

```bash
port/golden/run.sh              # all suites with goldens
port/golden/run.sh --suite charts
```

Uses `port/golden/docker-compose.yml` (Couchbase + ingest + couchbase-only collector). Mongo/API services are present for future server-parity goldens; replay does not need them today.

Comparison reuses normalization from `lib/compare.mjs` and chart runners in `lib/charts-runner.mjs`.

## Layout

| Path | Purpose |
|------|---------|
| `lib/anchor.mjs` | Anchor instant and offset helpers |
| `lib/types.mjs` | Golden + manifest schema (JSDoc) |
| `lib/compare.mjs` | Normalize + compare row sets |
| `lib/dataset.mjs` | Anchored query dataset loader |
| `lib/capture-*.mjs` / `lib/replay-*.mjs` | Suite drivers |
| `lib/stack-*-capture.sh` | Docker capture stacks |
| `lib/stack-replay.sh` | Couchbase-only replay stack |
| `docker-compose.yml` | Replay infrastructure |
| `collector-couchbase-only.yaml` | Collector without ClickHouse exporters |

Case definitions still live under `port/query-parity/cases/` until a later commit moves them here.

## Server parity

`port/server-parity` currently has no live case files. Capture records zero cases per server suite in the manifest; replay skips them until goldens exist.
