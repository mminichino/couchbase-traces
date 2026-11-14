# Tech stack

| Layer | Choices |
| --- | --- |
| UI | Next.js, Mantine, TanStack Query, Jotai |
| API | Express, Mongoose (MongoDB) |
| Telemetry store | Couchbase Server 8.x / Capella (SQL++, Search, Analytics) |
| Ingest | Node service (`packages/ingest`) |
| Collector | Custom OTel build (`packages/otel-collector`) |
| Shared logic | `packages/common-utils` (SQL++, chart rendering, Lucene) |
| Tests | Jest (unit/int), Playwright (E2E) |

Self-instrumentation uses telemetry SDKs (`@clickhouse/clickstack-node` /
`@clickhouse/clickstack-browser`) and `@clickhouse/click-ui` for theming — not
part of the telemetry data path.