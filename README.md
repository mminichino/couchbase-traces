# Couchbase Traces

Couchbase Traces is an observability UI for logs, traces, metrics, and sessions. It is derived from HyperDX and is being ported to run on Couchbase Server 8.x and Capella.

## Status

The port is in progress. The app currently still stores and queries telemetry in ClickHouse. Feature-by-feature progress is tracked in [docs/parity.md](docs/parity.md).

## Development

Requirements: Docker, Node.js 22 or later, and Yarn 4. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

```bash
# Install dependencies
yarn setup

# Start the API, the Next.js frontend, the OpenTelemetry collector, and ClickHouse
yarn dev

# Stop the stack
yarn dev:down

# Lint and type check all packages
make ci-lint

# Auto-fix formatting and lint
yarn lint:fix

# Unit tests for all packages
make ci-unit

# Integration tests (build once, then run a file)
make dev-int-build
make dev-int FILE=checkAlerts

# End-to-end tests
make e2e
```

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
