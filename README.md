# Couchbase Traces

Couchbase Traces is an observability UI for logs, traces, metrics, and sessions.
It is derived from HyperDX and runs on **Couchbase Server Enterprise 8.x**
(self-managed) and **Capella**, with SQL++ in place of ClickHouse. Telemetry and
app metadata (teams, users, dashboards, alerts) both live in Couchbase; no
ClickHouse or MongoDB is needed.

## Status

Version 1.0 has every upstream feature, with these exceptions: PromQL
and the careers page are dropped, and the ClickHouse pages are replaced by
Couchbase equivalents. Each one is signed off in
[docs/parity.md](docs/parity.md). The latest acceptance run is in
[docs/acceptance.md](docs/acceptance.md).

## Supported versions

| Component             | Supported                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Couchbase Server      | Enterprise Edition 8.0 or later (dev and CI use `enterprise-8.0.3`); Community Edition and 7.x are not supported |
| Capella               | Clusters on Server 8.x                                                                                           |
| Services              | Data, Query, Index, Search                                                                                       |
| Bucket storage        | Magma                                                                                                            |
| Node.js (development) | 22 or later                                                                                                      |

## Images

| Image                   | Name                                                 |
| ----------------------- | ---------------------------------------------------- |
| UI and API              | `ghcr.io/mminichino/couchbase-traces`                |
| Ingest                  | `ghcr.io/mminichino/couchbase-traces-ingest`         |
| OpenTelemetry collector | `ghcr.io/mminichino/couchbase-traces-otel-collector` |

Releases are tagged `X.Y.Z`, `X.Y`, `X`, and `latest`. The all-in-one image
bundles Couchbase Server Enterprise and is not published; build it locally with
`make build-all-in-one`. See [DEPLOY.md](DEPLOY.md).

## Upgrading from HyperDX

Couchbase Traces is not a drop-in replacement for a HyperDX deployment:

- There is no ClickHouse or MongoDB. Telemetry goes to Couchbase collections
  through the ingest service, and app metadata goes to the `cbt_meta` bucket.
- Environment variables use the `CBT_` prefix (for example `HYPERDX_API_KEY` is
  `CBT_API_KEY`).
- HyperDX data is not migrated.

## Deploy

- [DEPLOY.md](DEPLOY.md): images, Docker Compose, and configuration
- [Self-managed Couchbase](docs/self-managed.md)
- [Capella](docs/capella.md)

## Development

Requirements: Docker (6 GB+ memory), Node.js 22+, and Yarn 4.

```bash
yarn setup
make dev              # Couchbase dev stack
make dev-sample-data  # synthetic OTLP after first login

make ci-lint
make ci-unit
make e2e              # Playwright full stack on Couchbase
```

Full setup, sample data, and tests: [docs/development.md](docs/development.md).
Releases: [docs/release.md](docs/release.md). Open and proposed work:
[docs/backlog.md](docs/backlog.md). Contribution workflow:
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
