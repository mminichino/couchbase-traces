# Running Couchbase Traces locally

The upstream project shipped a no-auth "local" image that kept everything in the
browser. Couchbase Traces has no equivalent: it needs a Couchbase cluster for
telemetry and for app metadata, and local mode was removed in Phase 10 (see
`docs/port-notes.md`).

## What to use instead

| Goal                                 | Command                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| Full dev stack with Couchbase        | `make dev` ([docs/development.md](docs/development.md))              |
| Published images with Docker Compose | `docker compose up -d` ([DEPLOY.md](DEPLOY.md))                      |
| Single container (local build)       | `make build-all-in-one`, then run it as below                        |
| Frontend hot reload (no Docker)      | `yarn app:dev:local`; features that call the API need `make dev` too |

## All-in-one (local build)

The all-in-one image bundles Couchbase Server Enterprise, so it is not
published; build it yourself:

```bash
make build-all-in-one
docker run --memory=4g \
  -p 8080:8080 -p 4317:4317 -p 4318:4318 \
  ghcr.io/mminichino/couchbase-traces-all-in-one:2
```

The entrypoint refuses to start with less than 4 GB of container memory.
Register on first visit; generated secrets persist under `/data/cbt/` in the
container.

## OpenTelemetry endpoints

- HTTP: `http://localhost:4318`
- gRPC: `localhost:4317`

Send telemetry with the team ingestion API key (`Authorization: <key>`).

## Production

See [DEPLOY.md](DEPLOY.md), [docs/self-managed.md](docs/self-managed.md), and
[docs/capella.md](docs/capella.md).
