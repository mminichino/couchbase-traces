# Acceptance runner (Phase 11)

Proves the finished product meets the acceptance list in `PHASE_11_SPEC.md`.

## Prerequisites

- Node 22+
- Docker Desktop with Compose v2 (recommended ≥ 4 CPUs / 8 GB for `F1`)
- Yarn 4 (repo toolchain)
- Playwright Chromium (installed automatically on first browser check if missing)

## Capella credentials

Export before `--capella`:

```bash
export CBT_ACCEPT_CAPELLA_CONNSTR='couchbases://...'
export CBT_ACCEPT_CAPELLA_ADMIN_USER=...
export CBT_ACCEPT_CAPELLA_ADMIN_PASSWORD=...
export CBT_ACCEPT_CAPELLA_QUERY_USER=...
export CBT_ACCEPT_CAPELLA_QUERY_PASSWORD=...
export CBT_ACCEPT_CAPELLA_INGEST_USER=...
export CBT_ACCEPT_CAPELLA_INGEST_PASSWORD=...
```

Prepare the cluster per `docs/capella.md`. The runner does not drop Capella data.

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
