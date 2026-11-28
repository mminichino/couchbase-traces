# Tech stack

| Layer | Choices |
| --- | --- |
| UI | Next.js, Mantine, TanStack Query, Jotai |
| API | Express, Couchbase metadata store (`cbt_meta`) |
| Telemetry store | Couchbase Server 8.x / Capella (SQL++, Search, Analytics) |
| Ingest | Node service (`packages/ingest`) |
| Collector | Custom OTel build (`packages/otel-collector`) |
| Shared logic | `packages/common-utils` (SQL++, chart rendering, Lucene) |
| Tests | Jest (unit/int), Playwright (E2E) |

Self-instrumentation uses `@couchbase-traces/otel-node` (`packages/otel-node`,
API and Next.js server) and `packages/app/src/telemetry` (browser RUM and
session replay), both on the plain OpenTelemetry SDKs — not part of the
telemetry data path. No `@clickhouse/*` package is installed;
`scripts/ci/check-no-clickhouse-packages.sh` keeps it that way.