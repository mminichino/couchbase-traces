# Couchbase Traces

Couchbase Traces is an observability UI for logs, traces, metrics, and sessions. It is derived from HyperDX and is being ported to run on **Couchbase Server Enterprise 8.x** and Capella.

## Status

The port is in progress. Feature-by-feature progress is tracked in [docs/parity.md](docs/parity.md). New development stacks target Couchbase; ClickHouse remains in CI until Phase 10 removes the legacy data layer.

## Development

Requirements: Docker (6 GB+ memory), Node.js 22+, and Yarn 4.

Full setup, sample data, and tests: **[docs/development.md](docs/development.md)**.

External Couchbase:

- [Capella](docs/capella.md)
- [Self-managed](docs/self-managed.md)

Quick start:

```bash
yarn setup
make dev              # Couchbase dev stack (when compose Phase 9 land is merged)
make dev-sample-data  # synthetic OTLP after first login

make ci-lint
make ci-unit
make ci-e2e-couchbase # Playwright on Couchbase
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
