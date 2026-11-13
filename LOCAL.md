# Couchbase Traces Local (pending)

The previous **no-auth local** image (`couchbase-traces-local`) bundled
ClickHouse for keyless local debugging. That image is **not** rebuilt on
Couchbase yet (see Phase 9 pending decisions in `docs/port-notes.md`).

## What to use instead

| Goal | Command |
| --- | --- |
| Full dev stack with Couchbase | `make dev` — [docs/development.md](docs/development.md) |
| Single container (auth, local build) | `make build-all-in-one` then run with ≥ 4 GB RAM |
| Browser-only ClickHouse UI | `yarn app:dev:local` (ClickHouse connections only) |

## All-in-one (local build)

```bash
make build-all-in-one
docker run --memory=4g \
  -p 8080:8080 -p 4317:4317 -p 4318:4318 \
  ghcr.io/mminichino/couchbase-traces-all-in-one:2
```

Register on first visit; secrets persist under `/data/cbt/` in the container.

## OpenTelemetry endpoints

- HTTP: `http://localhost:4318`
- gRPC: `localhost:4317`

Send logs with the team ingestion API key (`Authorization: <key>`).

## Production

See [DEPLOY.md](DEPLOY.md) and [docs/self-managed.md](docs/self-managed.md).
