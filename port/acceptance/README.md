# Acceptance runner (Phase 11)

Proves the finished product meets the acceptance list in `docs/history/PHASE_11_SPEC.md`.

## Prerequisites

- Node 22+
- Docker Desktop with Compose v2 (recommended ≥ 4 CPUs / 8 GB for `F1`)
- Yarn 4 (repo toolchain)
- Playwright Chromium (installed automatically on first browser check if missing)

## Capella credentials

Set these in the ignored `.env.local` and load them for the one run, so they
never reach your shell:

```bash
CBT_ACCEPT_CAPELLA_CONNSTR='couchbases://...'
CBT_ACCEPT_CAPELLA_ADMIN_USER=...
CBT_ACCEPT_CAPELLA_ADMIN_PASSWORD=...
CBT_ACCEPT_CAPELLA_QUERY_USER=...
CBT_ACCEPT_CAPELLA_QUERY_PASSWORD=...
CBT_ACCEPT_CAPELLA_INGEST_USER=...
CBT_ACCEPT_CAPELLA_INGEST_PASSWORD=...
# Optional; the app uses the setup credential for cbt_meta when unset.
CBT_ACCEPT_CAPELLA_METADATA_USER=...
CBT_ACCEPT_CAPELLA_METADATA_PASSWORD=...
```

```bash
(set -a; . ./.env.local; set +a; node port/acceptance/run.mjs --capella)
```

Prepare the cluster per `docs/capella.md`, including both the `otel` and
`cbt_meta` buckets. The runner does not drop Capella data.

## Run

```bash
# Full local acceptance (blocks C1/C2 without --capella; blocks K2 until push)
node port/acceptance/run.mjs

# With Capella
node port/acceptance/run.mjs --capella

# After pushing, record CI
node port/acceptance/run.mjs --record-ci https://github.com/mminichino/couchbase-traces/actions/runs/<id>

# Iterate on a subset (never produces a final passing report)
node port/acceptance/run.mjs --only A1,H1,J1
node port/acceptance/run.mjs --skip M1,K1 --keep-stack
```

Compose project name: `cbt-acceptance`. Host ports are offset by **+10000** from `.env.example` so a developer stack can keep running.

## Outputs

- `port/state/acceptance/report.json`
- `port/state/acceptance/evidence/` (gitignored except `summary.json`)
- `docs/acceptance.md`

## Unit tests

```bash
node --test port/acceptance/test/*.test.mjs
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All selected checks passed |
| 1 | At least one failed |
| 2 | At least one blocked and none failed |
| 3 | Runner error (Docker missing, evidence not writable, …) |
