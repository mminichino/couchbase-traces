# Couchbase parity goldens (Phase 10)

Normalized Couchbase-only results captured before ClickHouse was removed.
`port/golden/run.sh` is the regression gate (replaces the old parity suites).

## Anchor time

Every golden uses an **anchor**: current time floored to 00:00 UTC on the most
recent Monday. Datasets load in the hour before that anchor (see `lib/dataset.mjs`).
Timestamps in stored results are **offsets in milliseconds** from the anchor.

## Capture

```bash
port/golden/capture.sh
```

Historical one-shot capture while dual-store parity existed. Replay does not
require ClickHouse.

## Replay

```bash
port/golden/run.sh              # all suites with goldens
port/golden/run.sh --suite charts
```

Uses `port/golden/docker-compose.yml` (Couchbase + ingest + Couchbase-only collector).

## Layout

| Path | Purpose |
|------|---------|
| `cases/` | Chart, Lucene, and function case definitions |
| `divergences.json` | Allowed chart divergences |
| `lib/couchbase-init.sh` | Cluster init for replay/E2E |
| `lib/ingest-payloads.mjs` | OTLP payloads for ingest goldens |
| `lib/stack-replay.sh` | Couchbase-only replay stack |