# Dependency license report

Generated: 2026-11-19 (`node port/remove-ch/licenses.mjs`).

## Summary

- npm production packages (external): **977** (via `yarn dlx license-checker-rseidelsohn@5.0.1` at repo root; production closure from workspace `dependencies`).
- Go modules: **485** (via `go run github.com/google/go-licenses@v1.6.0 report` on `packages/otel-collector` and the OCB `builder-config.yaml` module list).
- Review-list entries: **15** (copyleft / network copyleft / unknown — informational only).

### License counts (npm + Go)

| License | Count |
| --- | --- |
| MIT | 786 |
| Apache-2.0 | 444 |
| ISC | 88 |
| BSD-3-Clause | 84 |
| MPL-2.0 | 14 |
| BlueOak-1.0.0 | 12 |
| (MIT OR CC0-1.0) | 9 |
| BSD-2-Clause | 9 |
| 0BSD | 4 |
| CC-BY-4.0 | 2 |
| CC0-1.0 | 2 |
| (AFL-2.1 OR BSD-3-Clause) | 1 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 |
| (MIT AND Zlib) | 1 |
| MIT AND ISC | 1 |
| MIT* | 1 |
| Python-2.0 | 1 |
| UNKNOWN | 1 |
| Unlicense | 1 |

## npm (production)

Packages reachable from workspace `dependencies` (private workspaces are omitted with `--excludePrivatePackages`).

| Package | Version | License | Repository | Dependent workspace(s) |
| --- | --- | --- | --- | --- |
| @ai-sdk/anthropic | 4.0.65 | Apache-2.0 | https://github.com/vercel/ai | @couchbase-traces/api, @couchbase-traces/hdx-eval |
| @ai-sdk/gateway | 4.0.94 | Apache-2.0 | https://github.com/vercel/ai | @couchbase-traces/api |
| @ai-sdk/openai | 4.0.78 | Apache-2.0 | https://github.com/vercel/ai | @couchbase-traces/api, @couchbase-traces/hdx-eval |
| @ai-sdk/otel | 1.0.116 | Apache-2.0 | https://github.com/vercel/ai | @couchbase-traces/api |
| @ai-sdk/provider | 4.0.18 | Apache-2.0 | https://github.com/vercel/ai | @couchbase-traces/api |
| @ai-sdk/provider-utils | 5.0.49 | Apache-2.0 | https://github.com/vercel/ai | @couchbase-traces/api |
| @assemblyscript/loader | 0.19.23 | Apache-2.0 | https://github.com/AssemblyScript/assemblyscript | @couchbase-traces/api |
| @babel/runtime | 7.22.15 | MIT | https://github.com/babel/babel | @couchbase-traces/app |
| @babel/runtime | 7.24.0 | MIT | https://github.com/babel/babel | @couchbase-traces/app |
| @babel/runtime | 7.24.6 | MIT | https://github.com/babel/babel | @couchbase-traces/app |
| @babel/runtime | 7.29.7 | MIT | https://github.com/babel/babel | @couchbase-traces/app |
| @braintree/sanitize-url | 7.1.2 | MIT | https://github.com/braintree/sanitize-url | @couchbase-traces/api |
| @clickhouse/click-ui | 0.12.0 | Apache-2.0 | https://github.com/ClickHouse/click-ui | @couchbase-traces/app |
| @clickhouse/clickstack-browser | 1.2.1 | Apache-2.0 | https://github.com/ClickHouse/clickstack-browser | @couchbase-traces/app |
| @clickhouse/clickstack-node | 1.0.2 | Apache-2.0 | https://github.com/ClickHouse/clickstack-node | @couchbase-traces/api, @couchbase-traces/app |
| @codemirror/autocomplete | 6.13.0 | MIT | https://github.com/codemirror/autocomplete | @couchbase-traces/app |
| @codemirror/commands | 6.3.3 | MIT | https://github.com/codemirror/commands | @couchbase-traces/app |
| @codemirror/lang-json | 6.0.1 | MIT | https://github.com/codemirror/lang-json | @couchbase-traces/app |
| @codemirror/lang-sql | 6.7.0 | MIT | https://github.com/codemirror/lang-sql | @couchbase-traces/app |
| @codemirror/language | 6.10.1 | MIT | https://github.com/codemirror/language | @couchbase-traces/app |
| @codemirror/lint | 6.5.0 | MIT | https://github.com/codemirror/lint | @couchbase-traces/app |
| @codemirror/search | 6.5.6 | MIT | https://github.com/codemirror/search | @couchbase-traces/app |
| @codemirror/state | 6.4.1 | MIT | https://github.com/codemirror/state | @couchbase-traces/app |
| @codemirror/theme-one-dark | 6.1.2 | MIT | https://github.com/codemirror/theme-one-dark | @couchbase-traces/app |
| @codemirror/view | 6.25.1 | MIT | https://github.com/codemirror/view | @couchbase-traces/app |
| @dagrejs/dagre | 1.1.5 | MIT | https://github.com/dagrejs/dagre | @couchbase-traces/app |
| @dagrejs/graphlib | 2.2.4 | MIT | https://github.com/dagrejs/graphlib | @couchbase-traces/app |
| @dnd-kit/accessibility | 3.1.1 | MIT | https://github.com/clauderic/dnd-kit | @couchbase-traces/app |
| @dnd-kit/core | 6.3.1 | MIT | https://github.com/clauderic/dnd-kit | @couchbase-traces/app |
| @dnd-kit/sortable | 10.0.0 | MIT | https://github.com/clauderic/dnd-kit | @couchbase-traces/app |
| @dnd-kit/utilities | 3.2.2 | MIT | https://github.com/clauderic/dnd-kit | @couchbase-traces/app |
| @esm2cjs/p-queue | 7.3.0 | MIT | https://github.com/esm2cjs/p-queue | @couchbase-traces/api |
| @esm2cjs/p-timeout | 5.1.0 | MIT | https://github.com/esm2cjs/p-timeout | @couchbase-traces/api |
| @floating-ui/core | 1.7.5 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @floating-ui/core | 1.8.0 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @floating-ui/dom | 1.7.6 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @floating-ui/dom | 1.8.0 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @floating-ui/react | 0.27.19 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @floating-ui/react-dom | 2.1.8 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @floating-ui/react-dom | 2.1.9 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @floating-ui/utils | 0.2.11 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @floating-ui/utils | 0.2.12 | MIT | https://github.com/floating-ui/floating-ui | @couchbase-traces/app |
| @grpc/grpc-js | 1.14.7 | Apache-2.0 | https://github.com/grpc/grpc-node.git#master | @couchbase-traces/api |
| @grpc/proto-loader | 0.8.1 | Apache-2.0 | https://github.com/grpc/grpc-node | @couchbase-traces/api |
| @h6s/calendar | 2.2.0 | UNKNOWN | https://github.com/toss/h6s | @couchbase-traces/app |
| @hono/node-server | 1.19.17 | MIT | https://github.com/honojs/node-server | @couchbase-traces/api |
| @hookform/resolvers | 3.9.0 | MIT | https://github.com/react-hook-form/resolvers | @couchbase-traces/app |
| @hyperdx/lucene | 3.1.1 | MIT | https://github.com/bripkens/lucene | @couchbase-traces/common-utils |
| @js-sdsl/ordered-map | 4.4.2 | MIT | https://github.com/js-sdsl/js-sdsl | @couchbase-traces/api |
| @lezer/common | 1.5.3 | MIT | git+https://code.haverbeke.berlin/lezer/common | @couchbase-traces/app |
| @lezer/highlight | 1.2.5 | MIT | git+https://code.haverbeke.berlin/lezer/highlight | @couchbase-traces/app |
| @lezer/json | 1.0.2 | MIT | https://github.com/lezer-parser/json | @couchbase-traces/app |
| @lezer/lr | 1.4.11 | MIT | git+https://code.haverbeke.berlin/lezer/lr | @couchbase-traces/app |
| @mantine/core | 9.0.0 | MIT | https://github.com/mantinedev/mantine | @couchbase-traces/app |
| @mantine/dates | 9.0.0 | MIT | https://github.com/mantinedev/mantine | @couchbase-traces/app |
| @mantine/dropzone | 9.0.0 | MIT | https://github.com/mantinedev/mantine | @couchbase-traces/app |
| @mantine/form | 9.0.0 | MIT | https://github.com/mantinedev/mantine | @couchbase-traces/app |
| @mantine/hooks | 9.0.0 | MIT | https://github.com/mantinedev/mantine | @couchbase-traces/app |
| @mantine/notifications | 9.0.0 | MIT | https://github.com/mantinedev/mantine | @couchbase-traces/app |
| @mantine/spotlight | 9.0.0 | MIT | https://github.com/mantinedev/mantine | @couchbase-traces/app |
| @mantine/store | 9.0.0 | MIT | https://github.com/mantinedev/mantine | @couchbase-traces/app |
| @modelcontextprotocol/sdk | 1.29.0 | MIT | https://github.com/modelcontextprotocol/typescript-sdk | @couchbase-traces/api |
| @next/env | 16.4.3 | MIT | https://github.com/vercel/next.js | @couchbase-traces/app |
| @opentelemetry/api | 1.9.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/api | 1.9.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/api-logs | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/auto-instrumentations-node | 0.81.2 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/browser-instrumentation | 0.9.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-browser | @couchbase-traces/app |
| @opentelemetry/browser-sdk | 0.6.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-browser | @couchbase-traces/app |
| @opentelemetry/configuration | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/context-async-hooks | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/core | 1.30.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/core | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/exporter-logs-otlp-grpc | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/exporter-logs-otlp-http | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/exporter-logs-otlp-proto | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/exporter-metrics-otlp-grpc | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/exporter-metrics-otlp-http | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/exporter-metrics-otlp-proto | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/exporter-prometheus | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/exporter-trace-otlp-grpc | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/exporter-trace-otlp-http | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/exporter-trace-otlp-proto | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/exporter-zipkin | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/instrumentation | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/instrumentation-amqplib | 0.70.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-aws-lambda | 0.75.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-aws-sdk | 0.78.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-bunyan | 0.68.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-cassandra-driver | 0.68.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-connect | 0.66.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-console | 0.5.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-cucumber | 0.39.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-dataloader | 0.40.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-dns | 0.66.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-express | 0.71.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-fs | 0.42.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-generic-pool | 0.66.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-graphql | 0.71.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-grpc | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/instrumentation-hapi | 0.69.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-host-metrics | 0.6.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-http | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/instrumentation-ioredis | 0.71.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-kafkajs | 0.32.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-knex | 0.67.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-koa | 0.71.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-long-task | 0.67.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/app |
| @opentelemetry/instrumentation-lru-memoizer | 0.67.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-memcached | 0.66.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-mongodb | 0.76.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-mongoose | 0.69.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-mysql | 0.69.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-mysql2 | 0.69.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-nestjs-core | 0.70.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-net | 0.67.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-openai | 0.21.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-oracledb | 0.48.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-pg | 0.76.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-pino | 0.69.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-redis | 0.71.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-restify | 0.68.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-router | 0.67.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-runtime-node | 0.36.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-socket.io | 0.70.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-tedious | 0.42.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-undici | 0.33.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/instrumentation-winston | 0.68.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/otlp-exporter-base | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/otlp-grpc-exporter-base | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/otlp-transformer | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/propagator-aws-xray | 2.2.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/propagator-b3 | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/propagator-jaeger | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/redis-common | 0.38.3 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/resource-detector-alibaba-cloud | 0.38.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/resource-detector-aws | 2.23.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/resource-detector-azure | 0.31.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/resource-detector-container | 0.8.14 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/resource-detector-gcp | 0.58.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @opentelemetry/resources | 1.30.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/resources | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/sdk-logs | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/sdk-metrics | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/sdk-node | 0.223.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/sdk-trace | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/sdk-trace-base | 1.30.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/sdk-trace-base | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/sdk-trace-node | 2.12.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api |
| @opentelemetry/semantic-conventions | 1.28.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/semantic-conventions | 1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js | @couchbase-traces/api, @couchbase-traces/app |
| @opentelemetry/sql-common | 0.42.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib | @couchbase-traces/api |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @protobufjs/float | 1.0.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @protobufjs/path | 1.1.2 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @protobufjs/utf8 | 1.1.1 | BSD-3-Clause | https://github.com/dcodeIO/protobuf.js | @couchbase-traces/api |
| @radix-ui/primitive | 1.1.7 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-accordion | 1.2.20 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-arrow | 1.1.15 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-avatar | 1.2.6 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-checkbox | 1.3.11 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-collapsible | 1.1.20 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-collection | 1.1.15 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-compose-refs | 1.1.5 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-context | 1.2.2 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-context-menu | 2.3.7 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-dialog | 1.1.23 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-direction | 1.1.4 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-dismissable-layer | 1.1.19 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-dropdown-menu | 2.1.24 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-focus-guards | 1.1.6 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-focus-scope | 1.1.16 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-hover-card | 1.1.23 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-id | 1.1.4 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-menu | 2.1.24 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-popover | 1.1.23 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-popper | 1.3.7 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-portal | 1.1.17 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-presence | 1.1.10 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-primitive | 2.1.10 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-radio-group | 1.4.7 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-roving-focus | 1.1.19 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-separator | 1.1.15 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-slot | 1.3.3 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-switch | 1.3.7 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-tabs | 1.1.21 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-toast | 1.2.23 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-tooltip | 1.2.16 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-use-callback-ref | 1.1.4 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-use-controllable-state | 1.2.6 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-use-effect-event | 0.0.5 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-use-is-hydrated | 0.1.3 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-use-layout-effect | 1.1.4 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-use-rect | 1.1.4 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-use-size | 1.1.4 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/react-visually-hidden | 1.2.11 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @radix-ui/rect | 1.1.3 | MIT | https://github.com/radix-ui/primitives | @couchbase-traces/app |
| @reduxjs/toolkit | 2.12.0 | MIT | https://github.com/reduxjs/redux-toolkit | @couchbase-traces/app |
| @rrweb/record | 2.2.0 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| @rrweb/replay | 2.1.1 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| @rrweb/types | 2.1.1 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| @rrweb/types | 2.2.0 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| @rrweb/utils | 2.1.1 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| @rrweb/utils | 2.2.0 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| @slack/types | 2.20.0 | MIT | https://github.com/slackapi/node-slack-sdk | @couchbase-traces/api |
| @slack/webhook | 7.0.7 | MIT | https://github.com/slackapi/node-slack-sdk | @couchbase-traces/api |
| @standard-schema/spec | 1.1.0 | MIT | https://github.com/standard-schema/standard-schema | @couchbase-traces/api, @couchbase-traces/app |
| @standard-schema/utils | 0.3.0 | MIT | https://github.com/standard-schema/standard-schema | @couchbase-traces/app |
| @swc/helpers | 0.5.23 | Apache-2.0 | https://github.com/swc-project/swc | @couchbase-traces/app |
| @tabler/icons | 3.40.0 | MIT | https://github.com/tabler/tabler-icons | @couchbase-traces/app |
| @tabler/icons-react | 3.40.0 | MIT | https://github.com/tabler/tabler-icons | @couchbase-traces/app |
| @tanstack/query-core | 5.90.20 | MIT | https://github.com/TanStack/query | @couchbase-traces/app |
| @tanstack/query-devtools | 5.93.0 | MIT | https://github.com/TanStack/query | @couchbase-traces/app |
| @tanstack/react-query | 5.90.21 | MIT | https://github.com/TanStack/query | @couchbase-traces/app |
| @tanstack/react-query-devtools | 5.91.3 | MIT | https://github.com/TanStack/query | @couchbase-traces/app |
| @tanstack/react-table | 8.7.9 | MIT | https://github.com/tanstack/table | @couchbase-traces/app |
| @tanstack/react-virtual | 3.0.1 | MIT | https://github.com/tanstack/virtual | @couchbase-traces/app |
| @tanstack/table-core | 8.7.9 | MIT | https://github.com/tanstack/table | @couchbase-traces/app |
| @tanstack/virtual-core | 3.0.0 | MIT | https://github.com/tanstack/virtual | @couchbase-traces/app |
| @types/aws-lambda | 8.10.164 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/connect | 3.4.38 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/css-font-loading-module | 0.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-array | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-color | 3.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-drag | 3.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-ease | 3.0.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-interpolate | 3.0.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-interpolate | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-path | 3.0.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-scale | 4.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-selection | 3.0.11 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-shape | 3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-time | 3.0.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-timer | 3.0.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-transition | 3.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/d3-zoom | 3.0.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/debug | 4.1.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/estree | 0.0.39 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/estree | 1.0.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/estree-jsx | 1.0.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/hast | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/lodash | 4.14.191 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/lodash | 4.14.198 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/lodash | 4.17.21 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/luxon | 3.7.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/mdast | 4.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/memcached | 2.2.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/ms | 0.7.31 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/node | 12.20.55 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/node | 18.16.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/node | 20.13.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/node | 22.15.18 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/node | 25.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/pegjs | 0.10.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/common-utils |
| @types/pg | 8.15.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/pg | 8.6.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/pg-pool | 2.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/api |
| @types/prismjs | 1.26.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/unist | 2.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/unist | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @types/use-sync-external-store | 0.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | @couchbase-traces/app |
| @uiw/codemirror-extensions-basic-setup | 4.23.3 | MIT | https://github.com/uiwjs/react-codemirror | @couchbase-traces/app |
| @uiw/react-codemirror | 4.23.3 | MIT | https://github.com/uiwjs/react-codemirror | @couchbase-traces/app |
| @ungap/structured-clone | 1.3.0 | ISC | https://github.com/ungap/structured-clone | @couchbase-traces/app |
| @vercel/oidc | 3.2.0 | Apache-2.0 | https://github.com/vercel/vercel | @couchbase-traces/api |
| @workflow/serde | 4.1.0 | Apache-2.0 | https://github.com/vercel/workflow | @couchbase-traces/api |
| @xstate/fsm | 1.6.5 | MIT | https://github.com/statelyai/xstate | @couchbase-traces/app |
| @xyflow/react | 12.9.0 | MIT | https://github.com/xyflow/xyflow | @couchbase-traces/app |
| @xyflow/system | 0.0.71 | MIT | https://github.com/xyflow/xyflow | @couchbase-traces/app |
| abort-controller | 3.0.0 | MIT | https://github.com/mysticatea/abort-controller | @couchbase-traces/app |
| accepts | 1.3.8 | MIT | https://github.com/jshttp/accepts | @couchbase-traces/api |
| agent-base | 6.0.2 | MIT | https://github.com/TooTallNate/node-agent-base | @couchbase-traces/api |
| agent-base | 7.1.4 | MIT | https://github.com/TooTallNate/proxy-agents | @couchbase-traces/api |
| ai | 7.0.116 | Apache-2.0 | https://github.com/vercel/ai | @couchbase-traces/api, @couchbase-traces/hdx-eval |
| ajv | 6.12.6 | MIT | https://github.com/ajv-validator/ajv | @couchbase-traces/api |
| ajv | 8.18.0 | MIT | https://github.com/ajv-validator/ajv | @couchbase-traces/api |
| ajv | 8.20.0 | MIT | https://github.com/ajv-validator/ajv | @couchbase-traces/api |
| ajv-formats | 2.1.1 | MIT | https://github.com/ajv-validator/ajv-formats | @couchbase-traces/api |
| ajv-formats | 3.0.1 | MIT | https://github.com/ajv-validator/ajv-formats | @couchbase-traces/api |
| ansi-regex | 5.0.1 | MIT | https://github.com/chalk/ansi-regex | @couchbase-traces/app |
| ansi-regex | 6.0.1 | MIT | https://github.com/chalk/ansi-regex | @couchbase-traces/app |
| ansi-regex | 6.2.2 | MIT | https://github.com/chalk/ansi-regex | @couchbase-traces/app |
| ansi-styles | 3.2.1 | MIT | https://github.com/chalk/ansi-styles | @couchbase-traces/api |
| ansi-styles | 4.3.0 | MIT | https://github.com/chalk/ansi-styles | @couchbase-traces/api |
| ansi-styles | 5.2.0 | MIT | https://github.com/chalk/ansi-styles | @couchbase-traces/api |
| ansi-styles | 6.2.1 | MIT | https://github.com/chalk/ansi-styles | @couchbase-traces/api |
| ansi-styles | 6.2.3 | MIT | https://github.com/chalk/ansi-styles | @couchbase-traces/api |
| anymatch | 3.1.3 | ISC | https://github.com/micromatch/anymatch | @couchbase-traces/app |
| argparse | 1.0.10 | MIT | https://github.com/nodeca/argparse | @couchbase-traces/app |
| argparse | 2.0.1 | Python-2.0 | https://github.com/nodeca/argparse | @couchbase-traces/app |
| aria-hidden | 1.2.6 | MIT | https://github.com/theKashey/aria-hidden | @couchbase-traces/app |
| array-flatten | 1.1.1 | MIT | https://github.com/blakeembrey/array-flatten | @couchbase-traces/api |
| asynckit | 0.4.0 | MIT | https://github.com/alexindigo/asynckit | @couchbase-traces/api |
| atomic-sleep | 1.0.0 | MIT | https://github.com/davidmarkclements/atomic-sleep | @couchbase-traces/api |
| attr-accept | 2.2.5 | MIT | https://github.com/react-dropzone/attr-accept | @couchbase-traces/app |
| aws4 | 1.13.2 | MIT | https://github.com/mhart/aws4 | @couchbase-traces/api |
| axios | 1.18.1 | MIT | https://github.com/axios/axios | @couchbase-traces/api |
| bail | 2.0.2 | MIT | https://github.com/wooorm/bail | @couchbase-traces/app |
| balanced-match | 1.0.2 | MIT | https://github.com/juliangruber/balanced-match | @couchbase-traces/api |
| balanced-match | 2.0.0 | MIT | https://github.com/juliangruber/balanced-match | @couchbase-traces/api |
| balanced-match | 4.0.3 | MIT | https://github.com/juliangruber/balanced-match | @couchbase-traces/api |
| balanced-match | 4.0.4 | MIT | https://github.com/juliangruber/balanced-match | @couchbase-traces/api |
| base64-arraybuffer | 1.0.2 | MIT | https://github.com/niklasvh/base64-arraybuffer | @couchbase-traces/app |
| base64-js | 1.5.1 | MIT | https://github.com/beatgammit/base64-js | @couchbase-traces/api |
| baseline-browser-mapping | 2.10.0 | Apache-2.0 | https://github.com/web-platform-dx/baseline-browser-mapping | @couchbase-traces/app |
| baseline-browser-mapping | 2.10.8 | Apache-2.0 | https://github.com/web-platform-dx/baseline-browser-mapping | @couchbase-traces/app |
| baseline-browser-mapping | 2.8.30 | Apache-2.0 | https://github.com/web-platform-dx/baseline-browser-mapping | @couchbase-traces/app |
| big-integer | 1.6.52 | Unlicense | https://github.com/peterolson/BigInteger.js | @couchbase-traces/common-utils |
| bignumber.js | 9.1.1 | MIT | https://github.com/MikeMcl/bignumber.js | @couchbase-traces/api, @couchbase-traces/app |
| bignumber.js | 9.1.2 | MIT | https://github.com/MikeMcl/bignumber.js | @couchbase-traces/api, @couchbase-traces/app |
| binary-extensions | 2.2.0 | MIT | https://github.com/sindresorhus/binary-extensions | @couchbase-traces/app |
| body-parser | 1.20.6 | MIT | https://github.com/expressjs/body-parser | @couchbase-traces/api |
| brace-expansion | 1.1.17 | MIT | https://github.com/juliangruber/brace-expansion | @couchbase-traces/api |
| brace-expansion | 2.1.3 | MIT | https://github.com/juliangruber/brace-expansion | @couchbase-traces/api |
| brace-expansion | 2.1.4 | MIT | https://github.com/juliangruber/brace-expansion | @couchbase-traces/api |
| brace-expansion | 5.0.12 | MIT | https://github.com/juliangruber/brace-expansion | @couchbase-traces/api |
| brace-expansion | 5.0.8 | MIT | https://github.com/juliangruber/brace-expansion | @couchbase-traces/api |
| braces | 3.0.3 | MIT | https://github.com/micromatch/braces | @couchbase-traces/api, @couchbase-traces/app |
| bytes | 3.0.0 | MIT | https://github.com/visionmedia/bytes.js | @couchbase-traces/api |
| bytes | 3.1.2 | MIT | https://github.com/visionmedia/bytes.js | @couchbase-traces/api |
| call-bind-apply-helpers | 1.0.2 | MIT | https://github.com/ljharb/call-bind-apply-helpers | @couchbase-traces/api |
| call-bound | 1.0.4 | MIT | https://github.com/ljharb/call-bound | @couchbase-traces/api |
| caniuse-lite | 1.0.30001756 | CC-BY-4.0 | https://github.com/browserslist/caniuse-lite | @couchbase-traces/app |
| caniuse-lite | 1.0.30001775 | CC-BY-4.0 | https://github.com/browserslist/caniuse-lite | @couchbase-traces/app |
| ccount | 2.0.1 | MIT | https://github.com/wooorm/ccount | @couchbase-traces/app |
| chalk | 2.4.2 | MIT | https://github.com/chalk/chalk | @couchbase-traces/api, @couchbase-traces/app |
| chalk | 4.1.2 | MIT | https://github.com/chalk/chalk | @couchbase-traces/api, @couchbase-traces/app |
| chalk | 5.0.1 | MIT | https://github.com/chalk/chalk | @couchbase-traces/api, @couchbase-traces/app |
| chalk | 5.6.2 | MIT | https://github.com/chalk/chalk | @couchbase-traces/api, @couchbase-traces/app |
| character-entities | 2.0.2 | MIT | https://github.com/wooorm/character-entities | @couchbase-traces/app |
| character-entities-html4 | 2.1.0 | MIT | https://github.com/wooorm/character-entities-html4 | @couchbase-traces/app |
| character-entities-legacy | 3.0.0 | MIT | https://github.com/wooorm/character-entities-legacy | @couchbase-traces/app |
| character-reference-invalid | 2.0.1 | MIT | https://github.com/wooorm/character-reference-invalid | @couchbase-traces/app |
| chokidar | 3.5.3 | MIT | https://github.com/paulmillr/chokidar | @couchbase-traces/app |
| chokidar | 4.0.3 | MIT | https://github.com/paulmillr/chokidar | @couchbase-traces/app |
| chownr | 2.0.0 | ISC | https://github.com/isaacs/chownr | @couchbase-traces/api |
| chownr | 3.0.0 | BlueOak-1.0.0 | https://github.com/isaacs/chownr | @couchbase-traces/api |
| chrono-node | 2.9.0 | MIT | https://github.com/wanasit/chrono | @couchbase-traces/api, @couchbase-traces/app |
| cjs-module-lexer | 1.3.1 | MIT | https://github.com/nodejs/cjs-module-lexer | @couchbase-traces/api |
| cjs-module-lexer | 2.1.1 | MIT | https://github.com/nodejs/cjs-module-lexer | @couchbase-traces/api |
| cjs-module-lexer | 2.3.0 | MIT | https://github.com/nodejs/cjs-module-lexer | @couchbase-traces/api |
| class-variance-authority | 0.7.1 | Apache-2.0 | https://github.com/joe-bell/cva | @couchbase-traces/app |
| classcat | 5.0.5 | MIT | https://github.com/jorgebucaran/classcat | @couchbase-traces/app |
| classnames | 2.3.1 | MIT | https://github.com/JedWatson/classnames | @couchbase-traces/app |
| classnames | 2.3.2 | MIT | https://github.com/JedWatson/classnames | @couchbase-traces/app |
| client-only | 0.0.1 | MIT |  | @couchbase-traces/app |
| cliui | 6.0.0 | ISC | https://github.com/yargs/cliui | @couchbase-traces/api |
| cliui | 7.0.4 | ISC | https://github.com/yargs/cliui | @couchbase-traces/api |
| cliui | 8.0.1 | ISC | https://github.com/yargs/cliui | @couchbase-traces/api |
| clsx | 1.2.1 | MIT | https://github.com/lukeed/clsx | @couchbase-traces/app |
| clsx | 2.1.1 | MIT | https://github.com/lukeed/clsx | @couchbase-traces/app |
| cmake-js | 8.0.0 | MIT | https://github.com/cmake-js/cmake-js | @couchbase-traces/api |
| codemirror | 6.0.1 | MIT | https://github.com/codemirror/basic-setup | @couchbase-traces/app |
| color | 4.2.3 | MIT | https://github.com/Qix-/color | @couchbase-traces/app |
| color-convert | 1.9.3 | MIT | https://github.com/Qix-/color-convert | @couchbase-traces/api, @couchbase-traces/app |
| color-convert | 2.0.1 | MIT | https://github.com/Qix-/color-convert | @couchbase-traces/api, @couchbase-traces/app |
| color-name | 1.1.3 | MIT | https://github.com/dfcreative/color-name | @couchbase-traces/app |
| color-name | 1.1.4 | MIT | https://github.com/colorjs/color-name | @couchbase-traces/app |
| color-string | 1.9.1 | MIT | https://github.com/Qix-/color-string | @couchbase-traces/app |
| combined-stream | 1.0.8 | MIT | https://github.com/felixge/node-combined-stream | @couchbase-traces/api |
| comma-separated-tokens | 2.0.3 | MIT | https://github.com/wooorm/comma-separated-tokens | @couchbase-traces/app |
| commander | 11.1.0 | MIT | https://github.com/tj/commander.js | @couchbase-traces/app, @couchbase-traces/hdx-eval |
| commander | 12.1.0 | MIT | https://github.com/tj/commander.js | @couchbase-traces/app, @couchbase-traces/hdx-eval |
| commander | 14.0.3 | MIT | https://github.com/tj/commander.js | @couchbase-traces/app, @couchbase-traces/hdx-eval |
| commander | 2.20.3 | MIT | https://github.com/tj/commander.js | @couchbase-traces/app, @couchbase-traces/hdx-eval |
| commander | 4.1.1 | MIT | https://github.com/tj/commander.js | @couchbase-traces/app, @couchbase-traces/hdx-eval |
| commander | 6.2.0 | MIT | https://github.com/tj/commander.js | @couchbase-traces/app, @couchbase-traces/hdx-eval |
| commander | 8.3.0 | MIT | https://github.com/tj/commander.js | @couchbase-traces/app, @couchbase-traces/hdx-eval |
| commander | 9.5.0 | MIT | https://github.com/tj/commander.js | @couchbase-traces/app, @couchbase-traces/hdx-eval |
| compressible | 2.0.18 | MIT | https://github.com/jshttp/compressible | @couchbase-traces/api |
| compression | 1.8.1 | MIT | https://github.com/expressjs/compression | @couchbase-traces/api |
| compression | 1.8.2 | MIT | https://github.com/expressjs/compression | @couchbase-traces/api |
| concurrently | 9.1.2 | MIT | https://github.com/open-cli-tools/concurrently | @couchbase-traces/api |
| content-disposition | 0.5.2 | MIT | https://github.com/jshttp/content-disposition | @couchbase-traces/api |
| content-disposition | 0.5.4 | MIT | https://github.com/jshttp/content-disposition | @couchbase-traces/api |
| content-type | 1.0.5 | MIT | https://github.com/jshttp/content-type | @couchbase-traces/api |
| cookie | 0.7.2 | MIT | https://github.com/jshttp/cookie | @couchbase-traces/api |
| cookie-signature | 1.0.6 | MIT | https://github.com/visionmedia/node-cookie-signature | @couchbase-traces/api |
| cookie-signature | 1.0.7 | MIT | https://github.com/visionmedia/node-cookie-signature | @couchbase-traces/api |
| copy-to-clipboard | 3.3.3 | MIT | https://github.com/sudodoki/copy-to-clipboard | @couchbase-traces/app |
| cors | 2.8.5 | MIT | https://github.com/expressjs/cors | @couchbase-traces/api |
| couchbase | 4.7.2 | Apache-2.0 | https://github.com/couchbase/couchnode | @couchbase-traces/api, @couchbase-traces/common-utils, @couchbase-traces/ingest |
| crelt | 1.0.6 | MIT | https://github.com/marijnh/crelt | @couchbase-traces/app |
| cron | 4.3.3 | MIT | https://github.com/kelektiv/node-cron | @couchbase-traces/api |
| cross-spawn | 5.1.0 | MIT | https://github.com/IndigoUnited/node-cross-spawn | @couchbase-traces/api |
| cross-spawn | 7.0.6 | MIT | https://github.com/moxystudio/node-cross-spawn | @couchbase-traces/api |
| crypto-js | 4.2.0 | MIT | https://github.com/brix/crypto-js | @couchbase-traces/app |
| crypto-randomuuid | 1.0.0 | MIT |  | @couchbase-traces/app |
| csstype | 3.2.3 | MIT | https://github.com/frenic/csstype | @couchbase-traces/app |
| d3-array | 3.2.3 | ISC | https://github.com/d3/d3-array | @couchbase-traces/app |
| d3-color | 3.1.0 | ISC | https://github.com/d3/d3-color | @couchbase-traces/app |
| d3-dispatch | 3.0.1 | ISC | https://github.com/d3/d3-dispatch | @couchbase-traces/app |
| d3-drag | 3.0.0 | ISC | https://github.com/d3/d3-drag | @couchbase-traces/app |
| d3-ease | 3.0.1 | BSD-3-Clause | https://github.com/d3/d3-ease | @couchbase-traces/app |
| d3-format | 3.1.0 | ISC | https://github.com/d3/d3-format | @couchbase-traces/app |
| d3-interpolate | 3.0.1 | ISC | https://github.com/d3/d3-interpolate | @couchbase-traces/app |
| d3-path | 3.1.0 | ISC | https://github.com/d3/d3-path | @couchbase-traces/app |
| d3-scale | 4.0.2 | ISC | https://github.com/d3/d3-scale | @couchbase-traces/app |
| d3-selection | 3.0.0 | ISC | https://github.com/d3/d3-selection | @couchbase-traces/app |
| d3-shape | 3.2.0 | ISC | https://github.com/d3/d3-shape | @couchbase-traces/app |
| d3-time | 3.1.0 | ISC | https://github.com/d3/d3-time | @couchbase-traces/app |
| d3-time-format | 4.1.0 | ISC | https://github.com/d3/d3-time-format | @couchbase-traces/app |
| d3-timer | 3.0.1 | ISC | https://github.com/d3/d3-timer | @couchbase-traces/app |
| d3-transition | 3.0.1 | ISC | https://github.com/d3/d3-transition | @couchbase-traces/app |
| d3-zoom | 3.0.0 | ISC | https://github.com/d3/d3-zoom | @couchbase-traces/app |
| date-fns | 2.29.3 | MIT | https://github.com/date-fns/date-fns | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/common-utils |
| date-fns-tz | 2.0.0 | MIT | https://github.com/marnusw/date-fns-tz | @couchbase-traces/common-utils |
| dayjs | 1.11.19 | MIT | https://github.com/iamkun/dayjs | @couchbase-traces/app |
| debug | 2.6.9 | MIT | https://github.com/visionmedia/debug | @couchbase-traces/api, @couchbase-traces/app |
| debug | 3.2.7 | MIT | https://github.com/visionmedia/debug | @couchbase-traces/api, @couchbase-traces/app |
| debug | 4.4.0 | MIT | https://github.com/debug-js/debug | @couchbase-traces/api, @couchbase-traces/app |
| debug | 4.4.3 | MIT | https://github.com/debug-js/debug | @couchbase-traces/api, @couchbase-traces/app |
| decimal.js-light | 2.5.1 | MIT | https://github.com/MikeMcl/decimal.js-light | @couchbase-traces/app |
| decode-named-character-reference | 1.0.2 | MIT | https://github.com/wooorm/decode-named-character-reference | @couchbase-traces/app |
| deep-aplus | 1.0.4 | MIT | https://github.com/nknapp/deep-aplus | @couchbase-traces/api |
| deep-extend | 0.6.0 | MIT | https://github.com/unclechu/node-deep-extend | @couchbase-traces/api |
| delayed-stream | 1.0.0 | MIT | https://github.com/felixge/node-delayed-stream | @couchbase-traces/api |
| depd | 2.0.0 | MIT | https://github.com/dougwilson/nodejs-depd | @couchbase-traces/api |
| dequal | 2.0.3 | MIT | https://github.com/lukeed/dequal | @couchbase-traces/app |
| destroy | 1.2.0 | MIT | https://github.com/stream-utils/destroy | @couchbase-traces/api |
| detect-libc | 2.1.2 | Apache-2.0 | https://github.com/lovell/detect-libc | @couchbase-traces/api |
| detect-node-es | 1.1.0 | MIT | https://github.com/thekashey/detect-node | @couchbase-traces/app |
| devlop | 1.1.0 | MIT | https://github.com/wooorm/devlop | @couchbase-traces/app |
| discontinuous-range | 1.0.0 | MIT | https://github.com/dtudury/discontinuous-range | @couchbase-traces/app |
| dom-helpers | 5.2.1 | MIT | https://github.com/react-bootstrap/dom-helpers | @couchbase-traces/app |
| dunder-proto | 1.0.1 | MIT | https://github.com/es-shims/dunder-proto | @couchbase-traces/api |
| ee-first | 1.1.1 | MIT | https://github.com/jonathanong/ee-first | @couchbase-traces/api |
| emoji-regex | 10.6.0 | MIT | https://github.com/mathiasbynens/emoji-regex | @couchbase-traces/api |
| emoji-regex | 8.0.0 | MIT | https://github.com/mathiasbynens/emoji-regex | @couchbase-traces/api |
| emoji-regex | 9.2.2 | MIT | https://github.com/mathiasbynens/emoji-regex | @couchbase-traces/api |
| encodeurl | 2.0.0 | MIT | https://github.com/pillarjs/encodeurl | @couchbase-traces/api |
| es-define-property | 1.0.1 | MIT | https://github.com/ljharb/es-define-property | @couchbase-traces/api |
| es-errors | 1.3.0 | MIT | https://github.com/ljharb/es-errors | @couchbase-traces/api |
| es-module-lexer | 1.5.3 | MIT | https://github.com/guybedford/es-module-lexer | @couchbase-traces/api |
| es-module-lexer | 2.0.0 | MIT | https://github.com/guybedford/es-module-lexer | @couchbase-traces/api |
| es-module-lexer | 3.0.4 | MIT | https://github.com/guybedford/es-module-lexer | @couchbase-traces/api |
| es-object-atoms | 1.1.1 | MIT | https://github.com/ljharb/es-object-atoms | @couchbase-traces/api |
| es-set-tostringtag | 2.0.1 | MIT | https://github.com/es-shims/es-set-tostringtag | @couchbase-traces/api |
| es-set-tostringtag | 2.1.0 | MIT | https://github.com/es-shims/es-set-tostringtag | @couchbase-traces/api |
| es-toolkit | 1.45.1 | MIT | https://github.com/toss/es-toolkit | @couchbase-traces/app |
| es-toolkit | 1.49.0 | MIT | https://github.com/toss/es-toolkit | @couchbase-traces/app |
| escalade | 3.2.0 | MIT | https://github.com/lukeed/escalade | @couchbase-traces/api |
| escape-html | 1.0.3 | MIT | https://github.com/component/escape-html | @couchbase-traces/api |
| escape-string-regexp | 1.0.5 | MIT | https://github.com/sindresorhus/escape-string-regexp | @couchbase-traces/app |
| escape-string-regexp | 2.0.0 | MIT | https://github.com/sindresorhus/escape-string-regexp | @couchbase-traces/app |
| escape-string-regexp | 4.0.0 | MIT | https://github.com/sindresorhus/escape-string-regexp | @couchbase-traces/app |
| escape-string-regexp | 5.0.0 | MIT | https://github.com/sindresorhus/escape-string-regexp | @couchbase-traces/app |
| estree-util-is-identifier-name | 3.0.0 | MIT | https://github.com/syntax-tree/estree-util-is-identifier-name | @couchbase-traces/app |
| etag | 1.8.1 | MIT | https://github.com/jshttp/etag | @couchbase-traces/api |
| event-target-shim | 5.0.1 | MIT | https://github.com/mysticatea/event-target-shim | @couchbase-traces/app |
| eventemitter3 | 4.0.7 | MIT | https://github.com/primus/eventemitter3 | @couchbase-traces/api, @couchbase-traces/app |
| eventemitter3 | 5.0.4 | MIT | https://github.com/primus/eventemitter3 | @couchbase-traces/api, @couchbase-traces/app |
| eventsource | 3.0.7 | MIT | git://git@github.com/EventSource/eventsource | @couchbase-traces/api |
| eventsource-parser | 3.0.6 | MIT | https://github.com/rexxars/eventsource-parser | @couchbase-traces/api |
| eventsource-parser | 3.1.1 | MIT | https://github.com/rexxars/eventsource-parser | @couchbase-traces/api |
| express | 4.22.1 | MIT | https://github.com/expressjs/express | @couchbase-traces/api |
| express-rate-limit | 6.7.1 | MIT | https://github.com/express-rate-limit/express-rate-limit | @couchbase-traces/api |
| express-rate-limit | 8.3.2 | MIT | https://github.com/express-rate-limit/express-rate-limit | @couchbase-traces/api |
| express-session | 1.17.3 | MIT | https://github.com/expressjs/session | @couchbase-traces/api |
| extend | 3.0.2 | MIT | https://github.com/justmoon/node-extend | @couchbase-traces/api, @couchbase-traces/app |
| fast-deep-equal | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal | @couchbase-traces/api, @couchbase-traces/app |
| fast-uri | 3.1.9 | BSD-3-Clause | https://github.com/fastify/fast-uri | @couchbase-traces/api |
| fault | 1.0.4 | MIT | https://github.com/wooorm/fault | @couchbase-traces/app |
| file-selector | 2.1.2 | MIT | https://github.com/react-dropzone/file-selector | @couchbase-traces/app |
| fill-range | 7.1.1 | MIT | https://github.com/jonschlinkert/fill-range | @couchbase-traces/api |
| finalhandler | 1.3.2 | MIT | https://github.com/pillarjs/finalhandler | @couchbase-traces/api |
| flat | 5.0.2 | BSD-3-Clause | https://github.com/hughsk/flat | @couchbase-traces/app |
| follow-redirects | 1.16.0 | MIT | https://github.com/follow-redirects/follow-redirects | @couchbase-traces/api |
| form-data | 4.0.6 | MIT | https://github.com/form-data/form-data | @couchbase-traces/api |
| format | 0.2.2 | MIT | https://github.com/samsonjs/format | @couchbase-traces/app |
| forwarded | 0.2.0 | MIT | https://github.com/jshttp/forwarded | @couchbase-traces/api |
| forwarded-parse | 2.1.2 | MIT | https://github.com/lpinca/forwarded-parse | @couchbase-traces/api |
| fresh | 0.5.2 | MIT | https://github.com/jshttp/fresh | @couchbase-traces/api |
| fs-extra | 10.1.0 | MIT | https://github.com/jprichardson/node-fs-extra | @couchbase-traces/api |
| fs-extra | 11.4.1 | MIT | https://github.com/jprichardson/node-fs-extra | @couchbase-traces/api |
| fs-extra | 7.0.1 | MIT | https://github.com/jprichardson/node-fs-extra | @couchbase-traces/api |
| fs-extra | 8.1.0 | MIT | https://github.com/jprichardson/node-fs-extra | @couchbase-traces/api |
| fs-minipass | 2.1.0 | ISC | https://github.com/npm/fs-minipass | @couchbase-traces/api |
| fs-minipass | 3.0.3 | ISC | https://github.com/npm/fs-minipass | @couchbase-traces/api |
| function-bind | 1.1.1 | MIT | https://github.com/Raynos/function-bind | @couchbase-traces/api |
| function-bind | 1.1.2 | MIT | https://github.com/Raynos/function-bind | @couchbase-traces/api |
| fuse.js | 6.6.2 | Apache-2.0 | https://github.com/krisk/Fuse | @couchbase-traces/app |
| gaxios | 7.1.3 | Apache-2.0 | https://github.com/googleapis/google-cloud-node-core | @couchbase-traces/api |
| gcp-metadata | 8.1.4 | Apache-2.0 | https://github.com/googleapis/google-cloud-node | @couchbase-traces/api |
| get-caller-file | 2.0.5 | ISC | https://github.com/stefanpenner/get-caller-file | @couchbase-traces/api |
| get-intrinsic | 1.2.0 | MIT | https://github.com/ljharb/get-intrinsic | @couchbase-traces/api |
| get-intrinsic | 1.3.0 | MIT | https://github.com/ljharb/get-intrinsic | @couchbase-traces/api |
| get-intrinsic | 1.3.1 | MIT | https://github.com/ljharb/get-intrinsic | @couchbase-traces/api |
| get-nonce | 1.0.1 | MIT | https://github.com/theKashey/get-nonce | @couchbase-traces/app |
| get-proto | 1.0.1 | MIT | https://github.com/ljharb/get-proto | @couchbase-traces/api |
| glob | 10.5.0 | ISC | https://github.com/isaacs/node-glob | @couchbase-traces/api |
| glob | 14.0.2 | BlueOak-1.0.0 | https://github.com/isaacs/node-glob | @couchbase-traces/api |
| glob | 7.1.6 | ISC | https://github.com/isaacs/node-glob | @couchbase-traces/api |
| glob | 7.2.3 | ISC | https://github.com/isaacs/node-glob | @couchbase-traces/api |
| glob | 9.3.5 | ISC | https://github.com/isaacs/node-glob | @couchbase-traces/api |
| glob-parent | 5.1.2 | ISC | https://github.com/gulpjs/glob-parent | @couchbase-traces/app |
| glob-parent | 6.0.2 | ISC | https://github.com/gulpjs/glob-parent | @couchbase-traces/app |
| google-logging-utils | 1.1.3 | Apache-2.0 | https://github.com/googleapis/google-cloud-node-core | @couchbase-traces/api |
| gopd | 1.2.0 | MIT | https://github.com/ljharb/gopd | @couchbase-traces/api |
| graceful-fs | 4.2.10 | ISC | https://github.com/isaacs/node-graceful-fs | @couchbase-traces/api |
| graceful-fs | 4.2.11 | ISC | https://github.com/isaacs/node-graceful-fs | @couchbase-traces/api |
| handlebars | 4.7.10 | MIT | https://github.com/handlebars-lang/handlebars.js | @couchbase-traces/api, @couchbase-traces/common-utils |
| has-flag | 3.0.0 | MIT | https://github.com/sindresorhus/has-flag | @couchbase-traces/api |
| has-flag | 4.0.0 | MIT | https://github.com/sindresorhus/has-flag | @couchbase-traces/api |
| has-symbols | 1.0.3 | MIT | https://github.com/inspect-js/has-symbols | @couchbase-traces/api |
| has-symbols | 1.1.0 | MIT | https://github.com/inspect-js/has-symbols | @couchbase-traces/api |
| has-tostringtag | 1.0.2 | MIT | https://github.com/inspect-js/has-tostringtag | @couchbase-traces/api |
| hasown | 2.0.0 | MIT | https://github.com/inspect-js/hasOwn | @couchbase-traces/api |
| hasown | 2.0.2 | MIT | https://github.com/inspect-js/hasOwn | @couchbase-traces/api |
| hasown | 2.0.4 | MIT | https://github.com/inspect-js/hasOwn | @couchbase-traces/api |
| hast-util-parse-selector | 4.0.0 | MIT | https://github.com/syntax-tree/hast-util-parse-selector | @couchbase-traces/app |
| hast-util-to-jsx-runtime | 2.3.6 | MIT | https://github.com/syntax-tree/hast-util-to-jsx-runtime | @couchbase-traces/app |
| hast-util-whitespace | 3.0.0 | MIT | https://github.com/syntax-tree/hast-util-whitespace | @couchbase-traces/app |
| hastscript | 9.0.1 | MIT | https://github.com/syntax-tree/hastscript | @couchbase-traces/app |
| hdr-histogram-js | 3.0.1 | BSD-2-Clause | https://github.com/HdrHistogram/HdrHistogramJS | @couchbase-traces/api |
| highlight.js | 10.7.3 | BSD-3-Clause | https://github.com/highlightjs/highlight.js | @couchbase-traces/app |
| highlightjs-vue | 1.0.0 | CC0-1.0 | https://github.com/highlightjs/highlightjs-vue | @couchbase-traces/app |
| hono | 4.13.13 | MIT | https://github.com/honojs/hono | @couchbase-traces/api |
| html-url-attributes | 3.0.1 | MIT | https://github.com/rehypejs/rehype-minify.git#main | @couchbase-traces/app |
| http-errors | 2.0.1 | MIT | https://github.com/jshttp/http-errors | @couchbase-traces/api |
| http-graceful-shutdown | 3.1.13 | MIT | https://github.com/sebhildebrandt/http-graceful-shutdown | @couchbase-traces/api |
| http-proxy-middleware | 4.1.1 | MIT | https://github.com/chimurai/http-proxy-middleware | @couchbase-traces/api, @couchbase-traces/app |
| https-proxy-agent | 5.0.1 | MIT | https://github.com/TooTallNate/node-https-proxy-agent | @couchbase-traces/api |
| https-proxy-agent | 7.0.6 | MIT | https://github.com/TooTallNate/proxy-agents | @couchbase-traces/api |
| httpxy | 0.5.3 | MIT | https://github.com/unjs/httpxy | @couchbase-traces/api |
| iconv-lite | 0.4.24 | MIT | https://github.com/ashtuchkin/iconv-lite | @couchbase-traces/api |
| iconv-lite | 0.6.3 | MIT | https://github.com/ashtuchkin/iconv-lite | @couchbase-traces/api |
| iconv-lite | 0.7.2 | MIT | https://github.com/pillarjs/iconv-lite | @couchbase-traces/api |
| iconv-lite | 0.7.3 | MIT | https://github.com/pillarjs/iconv-lite | @couchbase-traces/api |
| immer | 11.1.9 | MIT | https://github.com/immerjs/immer | @couchbase-traces/app |
| immer | 9.0.21 | MIT | https://github.com/immerjs/immer | @couchbase-traces/app |
| immutable | 4.3.9 | MIT | https://github.com/immutable-js/immutable-js | @couchbase-traces/app |
| import-in-the-middle | 3.5.3 | Apache-2.0 | https://github.com/nodejs/import-in-the-middle | @couchbase-traces/api |
| inherits | 2.0.4 | ISC | https://github.com/isaacs/inherits | @couchbase-traces/api |
| ini | 1.3.8 | ISC | https://github.com/isaacs/ini | @couchbase-traces/api |
| inline-style-parser | 0.2.7 | MIT | https://github.com/remarkablemark/inline-style-parser | @couchbase-traces/app |
| internmap | 2.0.3 | ISC | https://github.com/mbostock/internmap | @couchbase-traces/app |
| ip-address | 10.1.0 | MIT | https://github.com/beaugunderson/ip-address | @couchbase-traces/api |
| ip-address | 10.7.4 | MIT | https://github.com/beaugunderson/ip-address | @couchbase-traces/api |
| ip-address | 9.0.5 | MIT | https://github.com/beaugunderson/ip-address | @couchbase-traces/api |
| ipaddr.js | 1.9.1 | MIT | https://github.com/whitequark/ipaddr.js | @couchbase-traces/api |
| is-alphabetical | 2.0.1 | MIT | https://github.com/wooorm/is-alphabetical | @couchbase-traces/app |
| is-alphanumerical | 2.0.1 | MIT | https://github.com/wooorm/is-alphanumerical | @couchbase-traces/app |
| is-arrayish | 0.2.1 | MIT | https://github.com/qix-/node-is-arrayish | @couchbase-traces/app |
| is-arrayish | 0.3.2 | MIT | https://github.com/qix-/node-is-arrayish | @couchbase-traces/app |
| is-binary-path | 2.1.0 | MIT | https://github.com/sindresorhus/is-binary-path | @couchbase-traces/app |
| is-decimal | 2.0.1 | MIT | https://github.com/wooorm/is-decimal | @couchbase-traces/app |
| is-extglob | 2.1.1 | MIT | https://github.com/jonschlinkert/is-extglob | @couchbase-traces/api |
| is-fullwidth-code-point | 3.0.0 | MIT | https://github.com/sindresorhus/is-fullwidth-code-point | @couchbase-traces/api |
| is-fullwidth-code-point | 4.0.0 | MIT | https://github.com/sindresorhus/is-fullwidth-code-point | @couchbase-traces/api |
| is-fullwidth-code-point | 5.1.0 | MIT | https://github.com/sindresorhus/is-fullwidth-code-point | @couchbase-traces/api |
| is-glob | 4.0.3 | MIT | https://github.com/micromatch/is-glob | @couchbase-traces/api, @couchbase-traces/app |
| is-hexadecimal | 2.0.1 | MIT | https://github.com/wooorm/is-hexadecimal | @couchbase-traces/app |
| is-number | 7.0.0 | MIT | https://github.com/jonschlinkert/is-number | @couchbase-traces/api |
| is-plain-obj | 1.1.0 | MIT | https://github.com/sindresorhus/is-plain-obj | @couchbase-traces/api, @couchbase-traces/app |
| is-plain-obj | 4.1.0 | MIT | https://github.com/sindresorhus/is-plain-obj | @couchbase-traces/api, @couchbase-traces/app |
| isexe | 2.0.0 | ISC | https://github.com/isaacs/isexe | @couchbase-traces/api |
| isexe | 3.1.1 | ISC | https://github.com/isaacs/isexe | @couchbase-traces/api |
| isexe | 4.0.0 | BlueOak-1.0.0 | https://github.com/isaacs/isexe | @couchbase-traces/api |
| jose | 6.2.2 | MIT | https://github.com/panva/jose | @couchbase-traces/api |
| jotai | 2.5.1 | MIT | https://github.com/pmndrs/jotai | @couchbase-traces/app |
| js-tokens | 4.0.0 | MIT | https://github.com/lydell/js-tokens | @couchbase-traces/app |
| json-bigint | 1.0.0 | MIT | https://github.com/sidorares/json-bigint | @couchbase-traces/api |
| json-schema | 0.4.0 | (AFL-2.1 OR BSD-3-Clause) | https://github.com/kriszyp/json-schema | @couchbase-traces/api |
| json-schema-traverse | 0.4.1 | MIT | https://github.com/epoberezkin/json-schema-traverse | @couchbase-traces/api |
| json-schema-traverse | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse | @couchbase-traces/api |
| json-schema-typed | 8.0.2 | BSD-2-Clause | https://github.com/RemyRylan/json-schema-typed | @couchbase-traces/api |
| jsonfile | 4.0.0 | MIT | https://github.com/jprichardson/node-jsonfile | @couchbase-traces/api |
| jsonfile | 6.1.0 | MIT | https://github.com/jprichardson/node-jsonfile | @couchbase-traces/api |
| klona | 2.0.6 | MIT | https://github.com/lukeed/klona | @couchbase-traces/app |
| ky | 0.30.0 | MIT | https://github.com/sindresorhus/ky | @couchbase-traces/app |
| ky-universal | 0.10.1 | MIT | https://github.com/sindresorhus/ky-universal | @couchbase-traces/app |
| lodash | 4.17.23 | MIT | https://github.com/lodash/lodash | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/common-utils |
| lodash | 4.18.1 | MIT | https://github.com/lodash/lodash | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/common-utils |
| lodash-es | 4.18.1 | MIT | https://github.com/lodash/lodash | @couchbase-traces/app |
| lodash.camelcase | 4.3.0 | MIT | https://github.com/lodash/lodash | @couchbase-traces/api |
| lodash.isequal | 4.5.0 | MIT | https://github.com/lodash/lodash | @couchbase-traces/app |
| lodash.isplainobject | 4.0.6 | MIT | https://github.com/lodash/lodash | @couchbase-traces/api |
| long | 5.2.3 | Apache-2.0 | https://github.com/dcodeIO/long.js | @couchbase-traces/api |
| long | 5.3.2 | Apache-2.0 | https://github.com/dcodeIO/long.js | @couchbase-traces/api |
| longest-streak | 3.1.0 | MIT | https://github.com/wooorm/longest-streak | @couchbase-traces/app |
| loose-envify | 1.4.0 | MIT | https://github.com/zertosh/loose-envify | @couchbase-traces/app |
| lowlight | 1.20.0 | MIT | https://github.com/wooorm/lowlight | @couchbase-traces/app |
| lru-cache | 10.2.2 | ISC | https://github.com/isaacs/node-lru-cache | @couchbase-traces/api |
| lru-cache | 10.4.3 | ISC | https://github.com/isaacs/node-lru-cache | @couchbase-traces/api |
| lru-cache | 11.2.7 | BlueOak-1.0.0 | https://github.com/isaacs/node-lru-cache | @couchbase-traces/api |
| lru-cache | 4.1.5 | ISC | https://github.com/isaacs/node-lru-cache | @couchbase-traces/api |
| lru-cache | 5.1.1 | ISC | https://github.com/isaacs/node-lru-cache | @couchbase-traces/api |
| lru-cache | 6.0.0 | ISC | https://github.com/isaacs/node-lru-cache | @couchbase-traces/api |
| luxon | 3.7.2 | MIT | https://github.com/moment/luxon | @couchbase-traces/api |
| markdown-table | 3.0.4 | MIT | https://github.com/wooorm/markdown-table | @couchbase-traces/app |
| math-intrinsics | 1.1.0 | MIT | https://github.com/es-shims/math-intrinsics | @couchbase-traces/api |
| mdast-util-find-and-replace | 3.0.2 | MIT | https://github.com/syntax-tree/mdast-util-find-and-replace | @couchbase-traces/app |
| mdast-util-from-markdown | 2.0.2 | MIT | https://github.com/syntax-tree/mdast-util-from-markdown | @couchbase-traces/app |
| mdast-util-gfm | 3.1.0 | MIT | https://github.com/syntax-tree/mdast-util-gfm | @couchbase-traces/app |
| mdast-util-gfm-autolink-literal | 2.0.1 | MIT | https://github.com/syntax-tree/mdast-util-gfm-autolink-literal | @couchbase-traces/app |
| mdast-util-gfm-footnote | 2.1.0 | MIT | https://github.com/syntax-tree/mdast-util-gfm-footnote | @couchbase-traces/app |
| mdast-util-gfm-strikethrough | 2.0.0 | MIT | https://github.com/syntax-tree/mdast-util-gfm-strikethrough | @couchbase-traces/app |
| mdast-util-gfm-table | 2.0.0 | MIT | https://github.com/syntax-tree/mdast-util-gfm-table | @couchbase-traces/app |
| mdast-util-gfm-task-list-item | 2.0.0 | MIT | https://github.com/syntax-tree/mdast-util-gfm-task-list-item | @couchbase-traces/app |
| mdast-util-mdx-expression | 2.0.1 | MIT | https://github.com/syntax-tree/mdast-util-mdx-expression | @couchbase-traces/app |
| mdast-util-mdx-jsx | 3.2.0 | MIT | https://github.com/syntax-tree/mdast-util-mdx-jsx | @couchbase-traces/app |
| mdast-util-mdxjs-esm | 2.0.1 | MIT | https://github.com/syntax-tree/mdast-util-mdxjs-esm | @couchbase-traces/app |
| mdast-util-phrasing | 4.1.0 | MIT | https://github.com/syntax-tree/mdast-util-phrasing | @couchbase-traces/app |
| mdast-util-to-hast | 13.2.1 | MIT | https://github.com/syntax-tree/mdast-util-to-hast | @couchbase-traces/app |
| mdast-util-to-markdown | 2.1.2 | MIT | https://github.com/syntax-tree/mdast-util-to-markdown | @couchbase-traces/app |
| mdast-util-to-string | 4.0.0 | MIT | https://github.com/syntax-tree/mdast-util-to-string | @couchbase-traces/app |
| media-typer | 0.3.0 | MIT | https://github.com/jshttp/media-typer | @couchbase-traces/api |
| memoize-one | 5.2.1 | MIT | https://github.com/alexreardon/memoize-one | @couchbase-traces/app |
| merge-descriptors | 1.0.3 | MIT | https://github.com/sindresorhus/merge-descriptors | @couchbase-traces/api |
| methods | 1.1.2 | MIT | https://github.com/jshttp/methods | @couchbase-traces/api |
| micromark | 4.0.2 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-core-commonmark | 2.0.3 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-extension-gfm | 3.0.0 | MIT | https://github.com/micromark/micromark-extension-gfm | @couchbase-traces/app |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT | https://github.com/micromark/micromark-extension-gfm-autolink-literal | @couchbase-traces/app |
| micromark-extension-gfm-footnote | 2.1.0 | MIT | https://github.com/micromark/micromark-extension-gfm-footnote | @couchbase-traces/app |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT | https://github.com/micromark/micromark-extension-gfm-strikethrough | @couchbase-traces/app |
| micromark-extension-gfm-table | 2.1.1 | MIT | https://github.com/micromark/micromark-extension-gfm-table | @couchbase-traces/app |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT | https://github.com/micromark/micromark-extension-gfm-tagfilter | @couchbase-traces/app |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT | https://github.com/micromark/micromark-extension-gfm-task-list-item | @couchbase-traces/app |
| micromark-factory-destination | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-factory-label | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-factory-space | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-factory-title | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-factory-whitespace | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-character | 2.1.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-chunked | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-classify-character | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-combine-extensions | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-decode-numeric-character-reference | 2.0.2 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-decode-string | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-encode | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-html-tag-name | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-normalize-identifier | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-resolve-all | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-sanitize-uri | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-subtokenize | 2.1.0 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-symbol | 2.0.1 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromark-util-types | 2.0.2 | MIT | https://github.com/micromark/micromark.git#main | @couchbase-traces/app |
| micromatch | 4.0.8 | MIT | https://github.com/micromatch/micromatch | @couchbase-traces/api |
| mime | 1.6.0 | MIT | https://github.com/broofa/node-mime | @couchbase-traces/api |
| mime | 2.6.0 | MIT | https://github.com/broofa/mime | @couchbase-traces/api |
| mime-db | 1.33.0 | MIT | https://github.com/jshttp/mime-db | @couchbase-traces/api |
| mime-db | 1.52.0 | MIT | https://github.com/jshttp/mime-db | @couchbase-traces/api |
| mime-types | 2.1.18 | MIT | https://github.com/jshttp/mime-types | @couchbase-traces/api |
| mime-types | 2.1.35 | MIT | https://github.com/jshttp/mime-types | @couchbase-traces/api |
| minimatch | 10.2.4 | BlueOak-1.0.0 | https://github.com/isaacs/minimatch | @couchbase-traces/api |
| minimatch | 10.2.5 | BlueOak-1.0.0 | https://github.com/isaacs/minimatch | @couchbase-traces/api |
| minimatch | 11.0.3 | BlueOak-1.0.0 | https://github.com/isaacs/minimatch | @couchbase-traces/api |
| minimatch | 3.1.2 | ISC | https://github.com/isaacs/minimatch | @couchbase-traces/api |
| minimatch | 3.1.5 | ISC | https://github.com/isaacs/minimatch | @couchbase-traces/api |
| minimatch | 8.0.4 | ISC | https://github.com/isaacs/minimatch | @couchbase-traces/api |
| minimatch | 9.0.4 | ISC | https://github.com/isaacs/minimatch | @couchbase-traces/api |
| minimatch | 9.0.9 | ISC | https://github.com/isaacs/minimatch | @couchbase-traces/api |
| minimist | 1.2.8 | MIT | https://github.com/minimistjs/minimist | @couchbase-traces/api |
| minipass | 3.3.6 | ISC | https://github.com/isaacs/minipass | @couchbase-traces/api |
| minipass | 4.2.8 | ISC | https://github.com/isaacs/minipass | @couchbase-traces/api |
| minipass | 5.0.0 | ISC | https://github.com/isaacs/minipass | @couchbase-traces/api |
| minipass | 7.1.2 | ISC | https://github.com/isaacs/minipass | @couchbase-traces/api |
| minipass | 7.1.3 | BlueOak-1.0.0 | https://github.com/isaacs/minipass | @couchbase-traces/api |
| minizlib | 2.1.2 | MIT | https://github.com/isaacs/minizlib | @couchbase-traces/api |
| minizlib | 3.1.0 | MIT | https://github.com/isaacs/minizlib | @couchbase-traces/api |
| mitt | 3.0.1 | MIT | https://github.com/developit/mitt | @couchbase-traces/app |
| mkdirp | 1.0.4 | MIT | https://github.com/isaacs/node-mkdirp | @couchbase-traces/api |
| module-details-from-path | 1.0.3 | MIT | https://github.com/watson/module-details-from-path | @couchbase-traces/api |
| module-details-from-path | 1.0.4 | MIT | https://github.com/watson/module-details-from-path | @couchbase-traces/api |
| moo | 0.5.2 | BSD-3-Clause | https://github.com/tjvr/moo | @couchbase-traces/app |
| ms | 2.0.0 | MIT | https://github.com/zeit/ms | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/hdx-eval |
| ms | 2.1.3 | MIT | https://github.com/vercel/ms | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/hdx-eval |
| nanoid | 3.3.17 | MIT | https://github.com/ai/nanoid | @couchbase-traces/app |
| nearley | 2.20.1 | MIT | https://github.com/hardmath123/nearley | @couchbase-traces/app |
| negotiator | 0.6.3 | MIT | https://github.com/jshttp/negotiator | @couchbase-traces/api |
| negotiator | 0.6.4 | MIT | https://github.com/jshttp/negotiator | @couchbase-traces/api |
| neo-async | 2.6.2 | MIT | https://github.com/suguru03/neo-async | @couchbase-traces/api |
| next | 16.4.3 | MIT | https://github.com/vercel/next.js | @couchbase-traces/app |
| next-runtime-env | 1.7.4 | MIT | https://github.com/expatfile/next-runtime-env | @couchbase-traces/app |
| next-seo | 4.29.0 | MIT | https://github.com/garmeeh/next-seo | @couchbase-traces/app |
| node-addon-api | 8.9.2 | MIT | https://github.com/nodejs/node-addon-api | @couchbase-traces/api |
| node-api-headers | 1.9.0 | MIT | https://github.com/nodejs/node-api-headers | @couchbase-traces/api |
| node-fetch | 2.7.0 | MIT | https://github.com/bitinn/node-fetch | @couchbase-traces/api, @couchbase-traces/app |
| node-fetch | 3.3.0 | MIT | https://github.com/node-fetch/node-fetch | @couchbase-traces/api, @couchbase-traces/app |
| node-fetch | 3.3.2 | MIT | https://github.com/node-fetch/node-fetch | @couchbase-traces/api, @couchbase-traces/app |
| node-sql-parser | 5.3.5 | Apache-2.0 | https://github.com/taozhi8833998/node-sql-parser | @couchbase-traces/common-utils |
| normalize-path | 3.0.0 | MIT | https://github.com/jonschlinkert/normalize-path | @couchbase-traces/app |
| numbro | 2.4.0 | MIT | https://github.com/BenjaminVanRyseghem/numbro | @couchbase-traces/app |
| numbro | 2.5.0 | MIT | https://github.com/BenjaminVanRyseghem/numbro | @couchbase-traces/app |
| nuqs | 1.17.0 | MIT | https://github.com/47ng/nuqs | @couchbase-traces/app |
| object-assign | 4.1.1 | MIT | https://github.com/sindresorhus/object-assign | @couchbase-traces/api, @couchbase-traces/app |
| object-hash | 3.0.0 | MIT | https://github.com/puleos/object-hash | @couchbase-traces/app, @couchbase-traces/common-utils |
| object-inspect | 1.13.4 | MIT | https://github.com/inspect-js/object-inspect | @couchbase-traces/api |
| on-exit-leak-free | 2.1.2 | MIT | https://github.com/mcollina/on-exit-or-gc | @couchbase-traces/api |
| on-finished | 2.4.1 | MIT | https://github.com/jshttp/on-finished | @couchbase-traces/api |
| on-headers | 1.1.0 | MIT | https://github.com/jshttp/on-headers | @couchbase-traces/api |
| pako | 1.0.11 | (MIT AND Zlib) | https://github.com/nodeca/pako | @couchbase-traces/api |
| papaparse | 5.5.3 | MIT | https://github.com/mholt/PapaParse | @couchbase-traces/app |
| parse-entities | 4.0.1 | MIT | https://github.com/wooorm/parse-entities | @couchbase-traces/app |
| parseurl | 1.3.3 | MIT | https://github.com/pillarjs/parseurl | @couchbase-traces/api |
| passport | 0.6.0 | MIT | https://github.com/jaredhanson/passport | @couchbase-traces/api |
| passport-local | 1.0.0 | MIT | https://github.com/jaredhanson/passport-local | @couchbase-traces/api |
| passport-strategy | 1.0.0 | MIT | https://github.com/jaredhanson/passport-strategy | @couchbase-traces/api |
| path-key | 3.1.1 | MIT | https://github.com/sindresorhus/path-key | @couchbase-traces/api |
| path-key | 4.0.0 | MIT | https://github.com/sindresorhus/path-key | @couchbase-traces/api |
| path-scurry | 1.11.1 | BlueOak-1.0.0 | https://github.com/isaacs/path-scurry | @couchbase-traces/api |
| path-scurry | 3.0.0 | BlueOak-1.0.0 | https://github.com/isaacs/path-scurry | @couchbase-traces/api |
| path-to-regexp | 0.1.12 | MIT | https://github.com/pillarjs/path-to-regexp | @couchbase-traces/api |
| path-to-regexp | 3.3.0 | MIT | https://github.com/pillarjs/path-to-regexp | @couchbase-traces/api |
| path-to-regexp | 6.2.2 | MIT | https://github.com/pillarjs/path-to-regexp | @couchbase-traces/api |
| pause | 0.0.1 | MIT* |  | @couchbase-traces/api |
| pg-int8 | 1.0.1 | ISC | https://github.com/charmander/pg-int8 | @couchbase-traces/api |
| pg-protocol | 1.6.0 | MIT | https://github.com/brianc/node-postgres | @couchbase-traces/api |
| pg-types | 2.2.0 | MIT | https://github.com/brianc/node-pg-types | @couchbase-traces/api |
| picocolors | 1.0.0 | ISC | https://github.com/alexeyraspopov/picocolors | @couchbase-traces/app |
| picocolors | 1.1.1 | ISC | https://github.com/alexeyraspopov/picocolors | @couchbase-traces/app |
| picomatch | 2.3.2 | MIT | https://github.com/micromatch/picomatch | @couchbase-traces/api, @couchbase-traces/app |
| picomatch | 4.0.3 | MIT | https://github.com/micromatch/picomatch | @couchbase-traces/api, @couchbase-traces/app |
| picomatch | 4.0.4 | MIT | https://github.com/micromatch/picomatch | @couchbase-traces/api, @couchbase-traces/app |
| pino | 10.0.0 | MIT | https://github.com/pinojs/pino | @couchbase-traces/api |
| pino-abstract-transport | 2.0.0 | MIT | https://github.com/pinojs/pino-abstract-transport | @couchbase-traces/api |
| pino-http | 11.0.0 | MIT | https://github.com/pinojs/pino-http | @couchbase-traces/api |
| pino-std-serializers | 7.0.0 | MIT | https://github.com/pinojs/pino-std-serializers | @couchbase-traces/api |
| pkce-challenge | 5.0.1 | MIT | https://github.com/crouchcd/pkce-challenge | @couchbase-traces/api |
| postcss | 8.4.38 | MIT | https://github.com/postcss/postcss | @couchbase-traces/app |
| postcss | 8.5.23 | MIT | https://github.com/postcss/postcss | @couchbase-traces/app |
| postcss | 8.5.6 | MIT | https://github.com/postcss/postcss | @couchbase-traces/app |
| postgres-array | 2.0.0 | MIT | https://github.com/bendrucker/postgres-array | @couchbase-traces/api |
| postgres-bytea | 1.0.0 | MIT | https://github.com/bendrucker/postgres-bytea | @couchbase-traces/api |
| postgres-date | 1.0.7 | MIT | https://github.com/bendrucker/postgres-date | @couchbase-traces/api |
| postgres-interval | 1.2.0 | MIT | https://github.com/bendrucker/postgres-interval | @couchbase-traces/api |
| prismjs | 1.30.0 | MIT | https://github.com/PrismJS/prism | @couchbase-traces/app |
| process-warning | 5.0.0 | MIT | https://github.com/fastify/process-warning | @couchbase-traces/api |
| promised-handlebars | 2.0.1 | MIT | https://github.com/nknapp/promised-handlebars | @couchbase-traces/api |
| prop-types | 15.8.1 | MIT | https://github.com/facebook/prop-types | @couchbase-traces/app |
| property-information | 7.1.0 | MIT | https://github.com/wooorm/property-information | @couchbase-traces/app |
| protobufjs | 7.6.2 | BSD-3-Clause | https://github.com/protobufjs/protobuf.js | @couchbase-traces/api |
| protobufjs | 7.6.5 | BSD-3-Clause | https://github.com/protobufjs/protobuf.js | @couchbase-traces/api |
| proxy-addr | 2.0.8 | MIT | https://github.com/jshttp/proxy-addr | @couchbase-traces/api |
| proxy-from-env | 2.1.0 | MIT | https://github.com/Rob--W/proxy-from-env | @couchbase-traces/api |
| qs | 6.14.2 | BSD-3-Clause | https://github.com/ljharb/qs | @couchbase-traces/api |
| qs | 6.15.1 | BSD-3-Clause | https://github.com/ljharb/qs | @couchbase-traces/api |
| qs | 6.15.3 | BSD-3-Clause | https://github.com/ljharb/qs | @couchbase-traces/api |
| quick-format-unescaped | 4.0.4 | MIT | https://github.com/davidmarkclements/quick-format | @couchbase-traces/api |
| railroad-diagrams | 1.0.0 | CC0-1.0 | https://github.com/tabatkins/railroad-diagrams | @couchbase-traces/app |
| randexp | 0.4.6 | MIT | https://github.com/fent/randexp.js | @couchbase-traces/app |
| random-bytes | 1.0.0 | MIT | https://github.com/crypto-utils/random-bytes | @couchbase-traces/api |
| range-parser | 1.2.0 | MIT | https://github.com/jshttp/range-parser | @couchbase-traces/api |
| range-parser | 1.2.1 | MIT | https://github.com/jshttp/range-parser | @couchbase-traces/api |
| raw-body | 2.5.3 | MIT | https://github.com/stream-utils/raw-body | @couchbase-traces/api |
| raw-body | 3.0.2 | MIT | https://github.com/stream-utils/raw-body | @couchbase-traces/api |
| rc | 1.2.8 | (BSD-2-Clause OR MIT OR Apache-2.0) | https://github.com/dominictarr/rc | @couchbase-traces/api |
| react | 19.2.1 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react | 19.2.3 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react | 19.2.4 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react-base16-styling | 0.10.0 | MIT | https://github.com/reduxjs/redux-devtools | @couchbase-traces/app |
| react-copy-to-clipboard | 5.1.0 | MIT | https://github.com/nkbt/react-copy-to-clipboard | @couchbase-traces/app |
| react-dom | 19.2.1 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react-dom | 19.2.3 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react-draggable | 4.4.5 | MIT | https://github.com/react-grid-layout/react-draggable | @couchbase-traces/app |
| react-dropzone | 15.0.0 | MIT | https://github.com/react-dropzone/react-dropzone | @couchbase-traces/app |
| react-error-boundary | 3.1.4 | MIT | https://github.com/bvaughn/react-error-boundary | @couchbase-traces/app |
| react-grid-layout | 1.3.4 | MIT | https://github.com/STRML/react-grid-layout | @couchbase-traces/app |
| react-hook-form | 7.43.8 | MIT | https://github.com/react-hook-form/react-hook-form | @couchbase-traces/app |
| react-hotkeys-hook | 4.3.7 | MIT | git+https://JohannesKlauss@github.com/JohannesKlauss/react-keymap-hook | @couchbase-traces/app |
| react-is | 16.13.1 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react-is | 17.0.2 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react-is | 18.3.1 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react-is | 19.2.6 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react-is | 19.2.7 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| react-json-tree | 0.20.0 | MIT | https://github.com/reduxjs/redux-devtools | @couchbase-traces/app |
| react-markdown | 10.1.0 | MIT | https://github.com/remarkjs/react-markdown | @couchbase-traces/app |
| react-number-format | 5.4.5 | MIT | https://github.com/s-yadav/react-number-format | @couchbase-traces/app |
| react-redux | 9.3.0 | MIT | https://github.com/reduxjs/react-redux | @couchbase-traces/app |
| react-remove-scroll | 2.7.2 | MIT | https://github.com/theKashey/react-remove-scroll | @couchbase-traces/app |
| react-remove-scroll-bar | 2.3.8 | MIT | https://github.com/theKashey/react-remove-scroll-bar | @couchbase-traces/app |
| react-resizable | 3.0.5 | MIT | https://github.com/react-grid-layout/react-resizable | @couchbase-traces/app |
| react-sortablejs | 6.1.4 | MIT | https://github.com/SortableJS/react-sortablejs | @couchbase-traces/app |
| react-style-singleton | 2.2.3 | MIT | https://github.com/theKashey/react-style-singleton | @couchbase-traces/app |
| react-syntax-highlighter | 16.1.1 | MIT | https://github.com/react-syntax-highlighter/react-syntax-highlighter | @couchbase-traces/app |
| react-transition-group | 4.4.5 | BSD-3-Clause | https://github.com/reactjs/react-transition-group | @couchbase-traces/app |
| react-virtualized-auto-sizer | 1.0.26 | MIT | https://github.com/bvaughn/react-virtualized-auto-sizer | @couchbase-traces/app |
| react-window | 1.8.11 | MIT | https://github.com/bvaughn/react-window | @couchbase-traces/app |
| readdirp | 3.6.0 | MIT | https://github.com/paulmillr/readdirp | @couchbase-traces/app |
| readdirp | 4.1.1 | MIT | https://github.com/paulmillr/readdirp | @couchbase-traces/app |
| real-require | 0.2.0 | MIT | https://github.com/pinojs/real-require | @couchbase-traces/api |
| recharts | 3.9.1 | MIT | https://github.com/recharts/recharts | @couchbase-traces/app |
| redux | 5.0.1 | MIT | https://github.com/reduxjs/redux | @couchbase-traces/app |
| redux-thunk | 3.1.0 | MIT | https://github.com/reduxjs/redux-thunk | @couchbase-traces/app |
| refractor | 5.0.0 | MIT | https://github.com/wooorm/refractor | @couchbase-traces/app |
| regenerator-runtime | 0.14.0 | MIT | https://github.com/facebook/regenerator.git#main | @couchbase-traces/app |
| remark-gfm | 4.0.1 | MIT | https://github.com/remarkjs/remark-gfm | @couchbase-traces/app |
| remark-parse | 11.0.0 | MIT | https://github.com/remarkjs/remark.git#main | @couchbase-traces/app |
| remark-rehype | 11.1.2 | MIT | https://github.com/remarkjs/remark-rehype | @couchbase-traces/app |
| remark-stringify | 11.0.0 | MIT | https://github.com/remarkjs/remark.git#main | @couchbase-traces/app |
| require-directory | 2.1.1 | MIT | https://github.com/troygoode/node-require-directory | @couchbase-traces/api |
| require-from-string | 2.0.2 | MIT | https://github.com/floatdrop/require-from-string | @couchbase-traces/api |
| require-in-the-middle | 8.0.1 | MIT | https://github.com/nodejs/require-in-the-middle | @couchbase-traces/api |
| reselect | 5.2.0 | MIT | https://github.com/reduxjs/reselect | @couchbase-traces/app |
| ret | 0.1.15 | MIT | https://github.com/fent/ret.js | @couchbase-traces/app |
| rimraf | 3.0.2 | ISC | https://github.com/isaacs/rimraf | @couchbase-traces/api |
| rimraf | 4.4.1 | ISC | https://github.com/isaacs/rimraf | @couchbase-traces/api |
| rimraf | 5.0.10 | ISC | https://github.com/isaacs/rimraf | @couchbase-traces/api |
| rrdom | 2.1.1 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| rrdom | 2.2.0 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| rrweb | 2.1.1 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| rrweb | 2.2.0 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| rrweb-snapshot | 2.1.1 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| rrweb-snapshot | 2.2.0 | MIT | https://github.com/rrweb-io/rrweb | @couchbase-traces/app |
| rxjs | 7.8.1 | Apache-2.0 | https://github.com/reactivex/rxjs | @couchbase-traces/api |
| rxjs | 7.8.2 | Apache-2.0 | https://github.com/reactivex/rxjs | @couchbase-traces/api |
| safe-buffer | 5.1.2 | MIT | https://github.com/feross/safe-buffer | @couchbase-traces/api |
| safe-buffer | 5.2.1 | MIT | https://github.com/feross/safe-buffer | @couchbase-traces/api |
| safe-stable-stringify | 1.1.1 | MIT | https://github.com/BridgeAR/safe-stable-stringify | @couchbase-traces/api |
| safe-stable-stringify | 2.4.2 | MIT | https://github.com/BridgeAR/safe-stable-stringify | @couchbase-traces/api |
| safer-buffer | 2.1.2 | MIT | https://github.com/ChALkeR/safer-buffer | @couchbase-traces/api |
| sass | 1.58.3 | MIT | https://github.com/sass/dart-sass | @couchbase-traces/app |
| scheduler | 0.27.0 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| semver | 5.7.1 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 6.3.1 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 7.0.0 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 7.5.2 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 7.5.4 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 7.6.2 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 7.7.3 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 7.7.4 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 7.8.4 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| semver | 7.8.5 | ISC | https://github.com/npm/node-semver | @couchbase-traces/api |
| send | 0.19.2 | MIT | https://github.com/pillarjs/send | @couchbase-traces/api |
| serialize-error | 8.1.0 | MIT | https://github.com/sindresorhus/serialize-error | @couchbase-traces/api |
| serve-static | 1.16.3 | MIT | https://github.com/expressjs/serve-static | @couchbase-traces/api |
| setprototypeof | 1.2.0 | ISC | https://github.com/wesleytodd/setprototypeof | @couchbase-traces/api |
| shebang-command | 1.2.0 | MIT | https://github.com/kevva/shebang-command | @couchbase-traces/api |
| shebang-command | 2.0.0 | MIT | https://github.com/kevva/shebang-command | @couchbase-traces/api |
| shebang-regex | 1.0.0 | MIT | https://github.com/sindresorhus/shebang-regex | @couchbase-traces/api |
| shebang-regex | 3.0.0 | MIT | https://github.com/sindresorhus/shebang-regex | @couchbase-traces/api |
| shell-quote | 1.11.0 | MIT | https://github.com/ljharb/shell-quote | @couchbase-traces/api |
| side-channel | 1.1.0 | MIT | https://github.com/ljharb/side-channel | @couchbase-traces/api |
| side-channel | 1.1.1 | MIT | https://github.com/ljharb/side-channel | @couchbase-traces/api |
| side-channel-list | 1.0.0 | MIT | https://github.com/ljharb/side-channel-list | @couchbase-traces/api |
| side-channel-list | 1.0.1 | MIT | https://github.com/ljharb/side-channel-list | @couchbase-traces/api |
| side-channel-map | 1.0.1 | MIT | https://github.com/ljharb/side-channel-map | @couchbase-traces/api |
| side-channel-weakmap | 1.0.2 | MIT | https://github.com/ljharb/side-channel-weakmap | @couchbase-traces/api |
| simple-swizzle | 0.2.2 | MIT | https://github.com/qix-/node-simple-swizzle | @couchbase-traces/app |
| slow-redact | 0.3.1 | MIT | https://github.com/pinojs/slow-redact | @couchbase-traces/api |
| sonic-boom | 4.2.0 | MIT | https://github.com/pinojs/sonic-boom | @couchbase-traces/api |
| sortablejs | 1.15.7 | MIT | https://github.com/SortableJS/Sortable | @couchbase-traces/app |
| source-map | 0.6.1 | BSD-3-Clause | https://github.com/mozilla/source-map | @couchbase-traces/api |
| source-map | 0.7.4 | BSD-3-Clause | https://github.com/mozilla/source-map | @couchbase-traces/api |
| source-map | 0.7.6 | BSD-3-Clause | https://github.com/mozilla/source-map | @couchbase-traces/api |
| source-map | 0.8.0-beta.0 | BSD-3-Clause | https://github.com/mozilla/source-map | @couchbase-traces/api |
| source-map-js | 1.2.2 | BSD-3-Clause | https://github.com/7rulnik/source-map-js | @couchbase-traces/app |
| space-separated-tokens | 2.0.2 | MIT | https://github.com/wooorm/space-separated-tokens | @couchbase-traces/app |
| split2 | 4.2.0 | ISC | https://github.com/mcollina/split2 | @couchbase-traces/api |
| sql-formatter | 15.7.2 | MIT | https://github.com/sql-formatter-org/sql-formatter | @couchbase-traces/app, @couchbase-traces/common-utils |
| sqlstring | 2.3.3 | MIT | https://github.com/mysqljs/sqlstring | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/common-utils |
| statuses | 2.0.1 | MIT | https://github.com/jshttp/statuses | @couchbase-traces/api |
| statuses | 2.0.2 | MIT | https://github.com/jshttp/statuses | @couchbase-traces/api |
| string-width | 4.2.3 | MIT | https://github.com/sindresorhus/string-width | @couchbase-traces/api |
| string-width | 5.1.2 | MIT | https://github.com/sindresorhus/string-width | @couchbase-traces/api |
| string-width | 7.2.0 | MIT | https://github.com/sindresorhus/string-width | @couchbase-traces/api |
| string-width | 8.2.0 | MIT | https://github.com/sindresorhus/string-width | @couchbase-traces/api |
| stringify-entities | 4.0.3 | MIT | https://github.com/wooorm/stringify-entities | @couchbase-traces/app |
| strip-ansi | 6.0.1 | MIT | https://github.com/chalk/strip-ansi | @couchbase-traces/api, @couchbase-traces/app |
| strip-ansi | 7.1.0 | MIT | https://github.com/chalk/strip-ansi | @couchbase-traces/api, @couchbase-traces/app |
| strip-ansi | 7.2.0 | MIT | https://github.com/chalk/strip-ansi | @couchbase-traces/api, @couchbase-traces/app |
| strip-json-comments | 2.0.1 | MIT | https://github.com/sindresorhus/strip-json-comments | @couchbase-traces/api |
| strip-json-comments | 3.1.1 | MIT | https://github.com/sindresorhus/strip-json-comments | @couchbase-traces/api |
| strip-json-comments | 5.0.3 | MIT | https://github.com/sindresorhus/strip-json-comments | @couchbase-traces/api |
| style-mod | 4.1.2 | MIT | https://github.com/marijnh/style-mod | @couchbase-traces/app |
| style-to-js | 1.1.21 | MIT | https://github.com/remarkablemark/style-to-js | @couchbase-traces/app |
| style-to-object | 1.0.14 | MIT | https://github.com/remarkablemark/style-to-object | @couchbase-traces/app |
| styled-jsx | 5.1.6 | MIT | https://github.com/vercel/styled-jsx | @couchbase-traces/app |
| styled-jsx | 5.1.7 | MIT | https://github.com/vercel/styled-jsx | @couchbase-traces/app |
| supports-color | 5.5.0 | MIT | https://github.com/chalk/supports-color | @couchbase-traces/api |
| supports-color | 7.2.0 | MIT | https://github.com/chalk/supports-color | @couchbase-traces/api |
| supports-color | 8.1.1 | MIT | https://github.com/chalk/supports-color | @couchbase-traces/api |
| systeminformation | 5.33.19 | MIT | https://github.com/sebhildebrandt/systeminformation | @couchbase-traces/api |
| tabbable | 6.2.0 | MIT | https://github.com/focus-trap/tabbable | @couchbase-traces/app |
| tar | 6.2.1 | ISC | https://github.com/isaacs/node-tar | @couchbase-traces/api |
| tar | 7.5.22 | BlueOak-1.0.0 | https://github.com/isaacs/node-tar | @couchbase-traces/api |
| thread-stream | 3.1.0 | MIT | https://github.com/mcollina/thread-stream | @couchbase-traces/api |
| timestamp-nano | 1.0.1 | MIT | https://github.com/kawanet/timestamp-nano | @couchbase-traces/app |
| tiny-invariant | 1.2.0 | MIT | https://github.com/alexreardon/tiny-invariant | @couchbase-traces/app |
| tiny-invariant | 1.3.3 | MIT | https://github.com/alexreardon/tiny-invariant | @couchbase-traces/app |
| to-regex-range | 5.0.1 | MIT | https://github.com/micromatch/to-regex-range | @couchbase-traces/api |
| toggle-selection | 1.0.6 | MIT | https://github.com/sudodoki/toggle-selection | @couchbase-traces/app |
| toidentifier | 1.0.1 | MIT | https://github.com/component/toidentifier | @couchbase-traces/api |
| tr46 | 0.0.3 | MIT | https://github.com/Sebmaster/tr46.js | @couchbase-traces/app |
| tr46 | 1.0.1 | MIT | https://github.com/Sebmaster/tr46.js | @couchbase-traces/app |
| tr46 | 5.1.1 | MIT | https://github.com/jsdom/tr46 | @couchbase-traces/app |
| tree-kill | 1.2.2 | MIT | https://github.com/pkrumins/node-tree-kill | @couchbase-traces/api |
| trim-lines | 3.0.1 | MIT | https://github.com/wooorm/trim-lines | @couchbase-traces/app |
| trough | 2.1.0 | MIT | https://github.com/wooorm/trough | @couchbase-traces/app |
| tslib | 1.14.1 | 0BSD | https://github.com/Microsoft/tslib | @couchbase-traces/api, @couchbase-traces/app |
| tslib | 2.5.0 | 0BSD | https://github.com/Microsoft/tslib | @couchbase-traces/api, @couchbase-traces/app |
| tslib | 2.7.0 | 0BSD | https://github.com/Microsoft/tslib | @couchbase-traces/api, @couchbase-traces/app |
| tslib | 2.8.1 | 0BSD | https://github.com/Microsoft/tslib | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 0.13.1 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 0.20.2 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 0.21.3 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 0.6.0 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 0.8.1 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 2.19.0 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 4.18.3 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 4.41.0 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-fest | 5.5.0 | (MIT OR CC0-1.0) | https://github.com/sindresorhus/type-fest | @couchbase-traces/api, @couchbase-traces/app |
| type-is | 1.6.18 | MIT | https://github.com/jshttp/type-is | @couchbase-traces/api |
| uid-safe | 2.1.5 | MIT | https://github.com/crypto-utils/uid-safe | @couchbase-traces/api |
| undici | 7.30.1 | MIT | https://github.com/nodejs/undici | @couchbase-traces/api |
| undici-types | 5.26.5 | MIT | https://github.com/nodejs/undici | @couchbase-traces/api |
| undici-types | 6.21.0 | MIT | https://github.com/nodejs/undici | @couchbase-traces/api |
| undici-types | 7.16.0 | MIT | https://github.com/nodejs/undici | @couchbase-traces/api |
| unified | 11.0.5 | MIT | https://github.com/unifiedjs/unified | @couchbase-traces/app |
| unist-util-is | 6.0.0 | MIT | https://github.com/syntax-tree/unist-util-is | @couchbase-traces/app |
| unist-util-position | 5.0.0 | MIT | https://github.com/syntax-tree/unist-util-position | @couchbase-traces/app |
| unist-util-stringify-position | 4.0.0 | MIT | https://github.com/syntax-tree/unist-util-stringify-position | @couchbase-traces/app |
| unist-util-visit | 5.0.0 | MIT | https://github.com/syntax-tree/unist-util-visit | @couchbase-traces/app |
| unist-util-visit-parents | 6.0.1 | MIT | https://github.com/syntax-tree/unist-util-visit-parents | @couchbase-traces/app |
| universalify | 0.1.2 | MIT | https://github.com/RyanZim/universalify | @couchbase-traces/api |
| universalify | 2.0.0 | MIT | https://github.com/RyanZim/universalify | @couchbase-traces/api |
| unpipe | 1.0.0 | MIT | https://github.com/stream-utils/unpipe | @couchbase-traces/api |
| uplot | 1.6.32 | MIT | https://github.com/leeoniya/uPlot | @couchbase-traces/app |
| uplot-react | 1.2.2 | MIT | https://github.com/skalinichev/uplot-wrappers | @couchbase-traces/app |
| url-join | 4.0.1 | MIT | https://github.com/jfromaniello/url-join | @couchbase-traces/api |
| use-callback-ref | 1.3.3 | MIT | https://github.com/theKashey/use-callback-ref | @couchbase-traces/app |
| use-sidecar | 1.1.3 | MIT | https://github.com/theKashey/use-sidecar | @couchbase-traces/app |
| use-sync-external-store | 1.6.0 | MIT | https://github.com/facebook/react | @couchbase-traces/app |
| utils-merge | 1.0.1 | MIT | https://github.com/jaredhanson/utils-merge | @couchbase-traces/api |
| uuid | 8.3.2 | MIT | https://github.com/uuidjs/uuid | @couchbase-traces/api |
| vary | 1.1.2 | MIT | https://github.com/jshttp/vary | @couchbase-traces/api |
| vfile | 6.0.3 | MIT | https://github.com/vfile/vfile | @couchbase-traces/app |
| vfile-message | 4.0.3 | MIT | https://github.com/vfile/vfile-message | @couchbase-traces/app |
| victory-vendor | 37.3.6 | MIT AND ISC | https://github.com/FormidableLabs/victory | @couchbase-traces/app |
| w3c-keyname | 2.2.8 | MIT | https://github.com/marijnh/w3c-keyname | @couchbase-traces/app |
| web-vitals | 6.2.3 | Apache-2.0 | https://github.com/GoogleChrome/web-vitals | @couchbase-traces/app |
| webidl-conversions | 3.0.1 | BSD-2-Clause | https://github.com/jsdom/webidl-conversions | @couchbase-traces/app |
| webidl-conversions | 4.0.2 | BSD-2-Clause | https://github.com/jsdom/webidl-conversions | @couchbase-traces/app |
| webidl-conversions | 7.0.0 | BSD-2-Clause | https://github.com/jsdom/webidl-conversions | @couchbase-traces/app |
| whatwg-url | 14.2.0 | MIT | https://github.com/jsdom/whatwg-url | @couchbase-traces/app |
| whatwg-url | 5.0.0 | MIT | https://github.com/jsdom/whatwg-url | @couchbase-traces/app |
| whatwg-url | 7.1.0 | MIT | https://github.com/jsdom/whatwg-url | @couchbase-traces/app |
| which | 1.3.1 | ISC | https://github.com/isaacs/node-which | @couchbase-traces/api |
| which | 2.0.2 | ISC | https://github.com/isaacs/node-which | @couchbase-traces/api |
| which | 3.0.1 | ISC | https://github.com/npm/node-which | @couchbase-traces/api |
| which | 4.0.0 | ISC | https://github.com/npm/node-which | @couchbase-traces/api |
| which | 6.0.1 | ISC | https://github.com/npm/node-which | @couchbase-traces/api |
| wordwrap | 1.0.0 | MIT | https://github.com/substack/node-wordwrap | @couchbase-traces/api |
| wrap-ansi | 6.2.0 | MIT | https://github.com/chalk/wrap-ansi | @couchbase-traces/api |
| wrap-ansi | 7.0.0 | MIT | https://github.com/chalk/wrap-ansi | @couchbase-traces/api |
| wrap-ansi | 8.1.0 | MIT | https://github.com/chalk/wrap-ansi | @couchbase-traces/api |
| wrap-ansi | 9.0.2 | MIT | https://github.com/chalk/wrap-ansi | @couchbase-traces/api |
| xtend | 4.0.2 | MIT | https://github.com/Raynos/xtend | @couchbase-traces/api |
| y18n | 4.0.3 | ISC | https://github.com/yargs/y18n | @couchbase-traces/api |
| y18n | 5.0.8 | ISC | https://github.com/yargs/y18n | @couchbase-traces/api |
| yallist | 2.1.2 | ISC | https://github.com/isaacs/yallist | @couchbase-traces/api |
| yallist | 3.1.1 | ISC | https://github.com/isaacs/yallist | @couchbase-traces/api |
| yallist | 4.0.0 | ISC | https://github.com/isaacs/yallist | @couchbase-traces/api |
| yallist | 5.0.0 | BlueOak-1.0.0 | https://github.com/isaacs/yallist | @couchbase-traces/api |
| yaml | 2.0.0-1 | ISC | https://github.com/eemeli/yaml | @couchbase-traces/api |
| yaml | 2.8.1 | ISC | https://github.com/eemeli/yaml | @couchbase-traces/api |
| yaml | 2.9.0 | ISC | https://github.com/eemeli/yaml | @couchbase-traces/api |
| yaml | 2.9.1 | ISC | https://github.com/eemeli/yaml | @couchbase-traces/api |
| yargs | 15.4.1 | MIT | https://github.com/yargs/yargs | @couchbase-traces/api |
| yargs | 17.7.2 | MIT | https://github.com/yargs/yargs | @couchbase-traces/api |
| yargs-parser | 18.1.3 | ISC | https://github.com/yargs/yargs-parser | @couchbase-traces/api |
| yargs-parser | 21.1.1 | ISC | https://github.com/yargs/yargs-parser | @couchbase-traces/api |
| zod | 3.25.76 | MIT | https://github.com/colinhacks/zod | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/common-utils, @couchbase-traces/hdx-eval |
| zod | 4.1.13 | MIT | https://github.com/colinhacks/zod | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/common-utils, @couchbase-traces/hdx-eval |
| zod | 4.3.6 | MIT | https://github.com/colinhacks/zod | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/common-utils, @couchbase-traces/hdx-eval |
| zod | 4.4.3 | MIT | https://github.com/colinhacks/zod | @couchbase-traces/api, @couchbase-traces/app, @couchbase-traces/common-utils, @couchbase-traces/hdx-eval |
| zod-express-middleware | 1.4.0 | MIT | https://github.com/Aquila169/zod-express-middleware | @couchbase-traces/api |
| zod-to-json-schema | 3.25.2 | ISC | https://github.com/StefanTerdell/zod-to-json-schema | @couchbase-traces/api |
| zustand | 4.5.7 | MIT | https://github.com/pmndrs/zustand | @couchbase-traces/app |
| zwitch | 2.0.4 | MIT | https://github.com/wooorm/zwitch | @couchbase-traces/app |

### npm by license

#### (AFL-2.1 OR BSD-3-Clause)

| Package | Version | Repository |
| --- | --- | --- |
| json-schema | 0.4.0 | https://github.com/kriszyp/json-schema |

#### (BSD-2-Clause OR MIT OR Apache-2.0)

| Package | Version | Repository |
| --- | --- | --- |
| rc | 1.2.8 | https://github.com/dominictarr/rc |

#### (MIT AND Zlib)

| Package | Version | Repository |
| --- | --- | --- |
| pako | 1.0.11 | https://github.com/nodeca/pako |

#### (MIT OR CC0-1.0)

| Package | Version | Repository |
| --- | --- | --- |
| type-fest | 0.13.1 | https://github.com/sindresorhus/type-fest |
| type-fest | 0.20.2 | https://github.com/sindresorhus/type-fest |
| type-fest | 0.21.3 | https://github.com/sindresorhus/type-fest |
| type-fest | 0.6.0 | https://github.com/sindresorhus/type-fest |
| type-fest | 0.8.1 | https://github.com/sindresorhus/type-fest |
| type-fest | 2.19.0 | https://github.com/sindresorhus/type-fest |
| type-fest | 4.18.3 | https://github.com/sindresorhus/type-fest |
| type-fest | 4.41.0 | https://github.com/sindresorhus/type-fest |
| type-fest | 5.5.0 | https://github.com/sindresorhus/type-fest |

#### 0BSD

| Package | Version | Repository |
| --- | --- | --- |
| tslib | 1.14.1 | https://github.com/Microsoft/tslib |
| tslib | 2.5.0 | https://github.com/Microsoft/tslib |
| tslib | 2.7.0 | https://github.com/Microsoft/tslib |
| tslib | 2.8.1 | https://github.com/Microsoft/tslib |

#### Apache-2.0

| Package | Version | Repository |
| --- | --- | --- |
| @ai-sdk/anthropic | 4.0.65 | https://github.com/vercel/ai |
| @ai-sdk/gateway | 4.0.94 | https://github.com/vercel/ai |
| @ai-sdk/openai | 4.0.78 | https://github.com/vercel/ai |
| @ai-sdk/otel | 1.0.116 | https://github.com/vercel/ai |
| @ai-sdk/provider | 4.0.18 | https://github.com/vercel/ai |
| @ai-sdk/provider-utils | 5.0.49 | https://github.com/vercel/ai |
| @assemblyscript/loader | 0.19.23 | https://github.com/AssemblyScript/assemblyscript |
| @clickhouse/click-ui | 0.12.0 | https://github.com/ClickHouse/click-ui |
| @clickhouse/clickstack-browser | 1.2.1 | https://github.com/ClickHouse/clickstack-browser |
| @clickhouse/clickstack-node | 1.0.2 | https://github.com/ClickHouse/clickstack-node |
| @grpc/grpc-js | 1.14.7 | https://github.com/grpc/grpc-node.git#master |
| @grpc/proto-loader | 0.8.1 | https://github.com/grpc/grpc-node |
| @opentelemetry/api | 1.9.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/api | 1.9.1 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/api-logs | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/auto-instrumentations-node | 0.81.2 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/browser-instrumentation | 0.9.0 | https://github.com/open-telemetry/opentelemetry-browser |
| @opentelemetry/browser-sdk | 0.6.0 | https://github.com/open-telemetry/opentelemetry-browser |
| @opentelemetry/configuration | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/context-async-hooks | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/core | 1.30.1 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/core | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-logs-otlp-grpc | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-logs-otlp-http | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-logs-otlp-proto | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-metrics-otlp-grpc | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-metrics-otlp-http | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-metrics-otlp-proto | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-prometheus | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-trace-otlp-grpc | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-trace-otlp-http | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-trace-otlp-proto | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/exporter-zipkin | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/instrumentation | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/instrumentation-amqplib | 0.70.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-aws-lambda | 0.75.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-aws-sdk | 0.78.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-bunyan | 0.68.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-cassandra-driver | 0.68.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-connect | 0.66.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-console | 0.5.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-cucumber | 0.39.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-dataloader | 0.40.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-dns | 0.66.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-express | 0.71.1 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-fs | 0.42.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-generic-pool | 0.66.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-graphql | 0.71.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-grpc | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/instrumentation-hapi | 0.69.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-host-metrics | 0.6.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-http | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/instrumentation-ioredis | 0.71.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-kafkajs | 0.32.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-knex | 0.67.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-koa | 0.71.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-long-task | 0.67.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-lru-memoizer | 0.67.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-memcached | 0.66.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-mongodb | 0.76.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-mongoose | 0.69.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-mysql | 0.69.1 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-mysql2 | 0.69.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-nestjs-core | 0.70.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-net | 0.67.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-openai | 0.21.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-oracledb | 0.48.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-pg | 0.76.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-pino | 0.69.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-redis | 0.71.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-restify | 0.68.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-router | 0.67.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-runtime-node | 0.36.1 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-socket.io | 0.70.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-tedious | 0.42.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-undici | 0.33.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/instrumentation-winston | 0.68.1 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/otlp-exporter-base | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/otlp-grpc-exporter-base | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/otlp-transformer | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/propagator-aws-xray | 2.2.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/propagator-b3 | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/propagator-jaeger | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/redis-common | 0.38.3 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/resource-detector-alibaba-cloud | 0.38.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/resource-detector-aws | 2.23.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/resource-detector-azure | 0.31.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/resource-detector-container | 0.8.14 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/resource-detector-gcp | 0.58.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @opentelemetry/resources | 1.30.1 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/resources | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-logs | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-metrics | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-node | 0.223.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-trace | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-trace-base | 1.30.1 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-trace-base | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sdk-trace-node | 2.12.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/semantic-conventions | 1.28.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/semantic-conventions | 1.44.0 | https://github.com/open-telemetry/opentelemetry-js |
| @opentelemetry/sql-common | 0.42.0 | https://github.com/open-telemetry/opentelemetry-js-contrib |
| @swc/helpers | 0.5.23 | https://github.com/swc-project/swc |
| @vercel/oidc | 3.2.0 | https://github.com/vercel/vercel |
| @workflow/serde | 4.1.0 | https://github.com/vercel/workflow |
| ai | 7.0.116 | https://github.com/vercel/ai |
| baseline-browser-mapping | 2.10.0 | https://github.com/web-platform-dx/baseline-browser-mapping |
| baseline-browser-mapping | 2.10.8 | https://github.com/web-platform-dx/baseline-browser-mapping |
| baseline-browser-mapping | 2.8.30 | https://github.com/web-platform-dx/baseline-browser-mapping |
| class-variance-authority | 0.7.1 | https://github.com/joe-bell/cva |
| couchbase | 4.7.2 | https://github.com/couchbase/couchnode |
| detect-libc | 2.1.2 | https://github.com/lovell/detect-libc |
| fuse.js | 6.6.2 | https://github.com/krisk/Fuse |
| gaxios | 7.1.3 | https://github.com/googleapis/google-cloud-node-core |
| gcp-metadata | 8.1.4 | https://github.com/googleapis/google-cloud-node |
| google-logging-utils | 1.1.3 | https://github.com/googleapis/google-cloud-node-core |
| import-in-the-middle | 3.5.3 | https://github.com/nodejs/import-in-the-middle |
| long | 5.2.3 | https://github.com/dcodeIO/long.js |
| long | 5.3.2 | https://github.com/dcodeIO/long.js |
| node-sql-parser | 5.3.5 | https://github.com/taozhi8833998/node-sql-parser |
| rxjs | 7.8.1 | https://github.com/reactivex/rxjs |
| rxjs | 7.8.2 | https://github.com/reactivex/rxjs |
| web-vitals | 6.2.3 | https://github.com/GoogleChrome/web-vitals |

#### BlueOak-1.0.0

| Package | Version | Repository |
| --- | --- | --- |
| chownr | 3.0.0 | https://github.com/isaacs/chownr |
| glob | 14.0.2 | https://github.com/isaacs/node-glob |
| isexe | 4.0.0 | https://github.com/isaacs/isexe |
| lru-cache | 11.2.7 | https://github.com/isaacs/node-lru-cache |
| minimatch | 10.2.4 | https://github.com/isaacs/minimatch |
| minimatch | 10.2.5 | https://github.com/isaacs/minimatch |
| minimatch | 11.0.3 | https://github.com/isaacs/minimatch |
| minipass | 7.1.3 | https://github.com/isaacs/minipass |
| path-scurry | 1.11.1 | https://github.com/isaacs/path-scurry |
| path-scurry | 3.0.0 | https://github.com/isaacs/path-scurry |
| tar | 7.5.22 | https://github.com/isaacs/node-tar |
| yallist | 5.0.0 | https://github.com/isaacs/yallist |

#### BSD-2-Clause

| Package | Version | Repository |
| --- | --- | --- |
| hdr-histogram-js | 3.0.1 | https://github.com/HdrHistogram/HdrHistogramJS |
| json-schema-typed | 8.0.2 | https://github.com/RemyRylan/json-schema-typed |
| webidl-conversions | 3.0.1 | https://github.com/jsdom/webidl-conversions |
| webidl-conversions | 4.0.2 | https://github.com/jsdom/webidl-conversions |
| webidl-conversions | 7.0.0 | https://github.com/jsdom/webidl-conversions |

#### BSD-3-Clause

| Package | Version | Repository |
| --- | --- | --- |
| @protobufjs/aspromise | 1.1.2 | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/base64 | 1.1.2 | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/codegen | 2.0.5 | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/eventemitter | 1.1.1 | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/fetch | 1.1.1 | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/float | 1.0.2 | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/path | 1.1.2 | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/pool | 1.1.0 | https://github.com/dcodeIO/protobuf.js |
| @protobufjs/utf8 | 1.1.1 | https://github.com/dcodeIO/protobuf.js |
| d3-ease | 3.0.1 | https://github.com/d3/d3-ease |
| fast-uri | 3.1.9 | https://github.com/fastify/fast-uri |
| flat | 5.0.2 | https://github.com/hughsk/flat |
| highlight.js | 10.7.3 | https://github.com/highlightjs/highlight.js |
| moo | 0.5.2 | https://github.com/tjvr/moo |
| protobufjs | 7.6.2 | https://github.com/protobufjs/protobuf.js |
| protobufjs | 7.6.5 | https://github.com/protobufjs/protobuf.js |
| qs | 6.14.2 | https://github.com/ljharb/qs |
| qs | 6.15.1 | https://github.com/ljharb/qs |
| qs | 6.15.3 | https://github.com/ljharb/qs |
| react-transition-group | 4.4.5 | https://github.com/reactjs/react-transition-group |
| source-map | 0.6.1 | https://github.com/mozilla/source-map |
| source-map | 0.7.4 | https://github.com/mozilla/source-map |
| source-map | 0.7.6 | https://github.com/mozilla/source-map |
| source-map | 0.8.0-beta.0 | https://github.com/mozilla/source-map |
| source-map-js | 1.2.2 | https://github.com/7rulnik/source-map-js |

#### CC-BY-4.0

| Package | Version | Repository |
| --- | --- | --- |
| caniuse-lite | 1.0.30001756 | https://github.com/browserslist/caniuse-lite |
| caniuse-lite | 1.0.30001775 | https://github.com/browserslist/caniuse-lite |

#### CC0-1.0

| Package | Version | Repository |
| --- | --- | --- |
| highlightjs-vue | 1.0.0 | https://github.com/highlightjs/highlightjs-vue |
| railroad-diagrams | 1.0.0 | https://github.com/tabatkins/railroad-diagrams |

#### ISC

| Package | Version | Repository |
| --- | --- | --- |
| @ungap/structured-clone | 1.3.0 | https://github.com/ungap/structured-clone |
| anymatch | 3.1.3 | https://github.com/micromatch/anymatch |
| chownr | 2.0.0 | https://github.com/isaacs/chownr |
| cliui | 6.0.0 | https://github.com/yargs/cliui |
| cliui | 7.0.4 | https://github.com/yargs/cliui |
| cliui | 8.0.1 | https://github.com/yargs/cliui |
| d3-array | 3.2.3 | https://github.com/d3/d3-array |
| d3-color | 3.1.0 | https://github.com/d3/d3-color |
| d3-dispatch | 3.0.1 | https://github.com/d3/d3-dispatch |
| d3-drag | 3.0.0 | https://github.com/d3/d3-drag |
| d3-format | 3.1.0 | https://github.com/d3/d3-format |
| d3-interpolate | 3.0.1 | https://github.com/d3/d3-interpolate |
| d3-path | 3.1.0 | https://github.com/d3/d3-path |
| d3-scale | 4.0.2 | https://github.com/d3/d3-scale |
| d3-selection | 3.0.0 | https://github.com/d3/d3-selection |
| d3-shape | 3.2.0 | https://github.com/d3/d3-shape |
| d3-time | 3.1.0 | https://github.com/d3/d3-time |
| d3-time-format | 4.1.0 | https://github.com/d3/d3-time-format |
| d3-timer | 3.0.1 | https://github.com/d3/d3-timer |
| d3-transition | 3.0.1 | https://github.com/d3/d3-transition |
| d3-zoom | 3.0.0 | https://github.com/d3/d3-zoom |
| fs-minipass | 2.1.0 | https://github.com/npm/fs-minipass |
| fs-minipass | 3.0.3 | https://github.com/npm/fs-minipass |
| get-caller-file | 2.0.5 | https://github.com/stefanpenner/get-caller-file |
| glob | 10.5.0 | https://github.com/isaacs/node-glob |
| glob | 7.1.6 | https://github.com/isaacs/node-glob |
| glob | 7.2.3 | https://github.com/isaacs/node-glob |
| glob | 9.3.5 | https://github.com/isaacs/node-glob |
| glob-parent | 5.1.2 | https://github.com/gulpjs/glob-parent |
| glob-parent | 6.0.2 | https://github.com/gulpjs/glob-parent |
| graceful-fs | 4.2.10 | https://github.com/isaacs/node-graceful-fs |
| graceful-fs | 4.2.11 | https://github.com/isaacs/node-graceful-fs |
| inherits | 2.0.4 | https://github.com/isaacs/inherits |
| ini | 1.3.8 | https://github.com/isaacs/ini |
| internmap | 2.0.3 | https://github.com/mbostock/internmap |
| isexe | 2.0.0 | https://github.com/isaacs/isexe |
| isexe | 3.1.1 | https://github.com/isaacs/isexe |
| lru-cache | 10.2.2 | https://github.com/isaacs/node-lru-cache |
| lru-cache | 10.4.3 | https://github.com/isaacs/node-lru-cache |
| lru-cache | 4.1.5 | https://github.com/isaacs/node-lru-cache |
| lru-cache | 5.1.1 | https://github.com/isaacs/node-lru-cache |
| lru-cache | 6.0.0 | https://github.com/isaacs/node-lru-cache |
| minimatch | 3.1.2 | https://github.com/isaacs/minimatch |
| minimatch | 3.1.5 | https://github.com/isaacs/minimatch |
| minimatch | 8.0.4 | https://github.com/isaacs/minimatch |
| minimatch | 9.0.4 | https://github.com/isaacs/minimatch |
| minimatch | 9.0.9 | https://github.com/isaacs/minimatch |
| minipass | 3.3.6 | https://github.com/isaacs/minipass |
| minipass | 4.2.8 | https://github.com/isaacs/minipass |
| minipass | 5.0.0 | https://github.com/isaacs/minipass |
| minipass | 7.1.2 | https://github.com/isaacs/minipass |
| pg-int8 | 1.0.1 | https://github.com/charmander/pg-int8 |
| picocolors | 1.0.0 | https://github.com/alexeyraspopov/picocolors |
| picocolors | 1.1.1 | https://github.com/alexeyraspopov/picocolors |
| rimraf | 3.0.2 | https://github.com/isaacs/rimraf |
| rimraf | 4.4.1 | https://github.com/isaacs/rimraf |
| rimraf | 5.0.10 | https://github.com/isaacs/rimraf |
| semver | 5.7.1 | https://github.com/npm/node-semver |
| semver | 6.3.1 | https://github.com/npm/node-semver |
| semver | 7.0.0 | https://github.com/npm/node-semver |
| semver | 7.5.2 | https://github.com/npm/node-semver |
| semver | 7.5.4 | https://github.com/npm/node-semver |
| semver | 7.6.2 | https://github.com/npm/node-semver |
| semver | 7.7.3 | https://github.com/npm/node-semver |
| semver | 7.7.4 | https://github.com/npm/node-semver |
| semver | 7.8.4 | https://github.com/npm/node-semver |
| semver | 7.8.5 | https://github.com/npm/node-semver |
| setprototypeof | 1.2.0 | https://github.com/wesleytodd/setprototypeof |
| split2 | 4.2.0 | https://github.com/mcollina/split2 |
| tar | 6.2.1 | https://github.com/isaacs/node-tar |
| which | 1.3.1 | https://github.com/isaacs/node-which |
| which | 2.0.2 | https://github.com/isaacs/node-which |
| which | 3.0.1 | https://github.com/npm/node-which |
| which | 4.0.0 | https://github.com/npm/node-which |
| which | 6.0.1 | https://github.com/npm/node-which |
| y18n | 4.0.3 | https://github.com/yargs/y18n |
| y18n | 5.0.8 | https://github.com/yargs/y18n |
| yallist | 2.1.2 | https://github.com/isaacs/yallist |
| yallist | 3.1.1 | https://github.com/isaacs/yallist |
| yallist | 4.0.0 | https://github.com/isaacs/yallist |
| yaml | 2.0.0-1 | https://github.com/eemeli/yaml |
| yaml | 2.8.1 | https://github.com/eemeli/yaml |
| yaml | 2.9.0 | https://github.com/eemeli/yaml |
| yaml | 2.9.1 | https://github.com/eemeli/yaml |
| yargs-parser | 18.1.3 | https://github.com/yargs/yargs-parser |
| yargs-parser | 21.1.1 | https://github.com/yargs/yargs-parser |
| zod-to-json-schema | 3.25.2 | https://github.com/StefanTerdell/zod-to-json-schema |

#### MIT

| Package | Version | Repository |
| --- | --- | --- |
| @babel/runtime | 7.22.15 | https://github.com/babel/babel |
| @babel/runtime | 7.24.0 | https://github.com/babel/babel |
| @babel/runtime | 7.24.6 | https://github.com/babel/babel |
| @babel/runtime | 7.29.7 | https://github.com/babel/babel |
| @braintree/sanitize-url | 7.1.2 | https://github.com/braintree/sanitize-url |
| @codemirror/autocomplete | 6.13.0 | https://github.com/codemirror/autocomplete |
| @codemirror/commands | 6.3.3 | https://github.com/codemirror/commands |
| @codemirror/lang-json | 6.0.1 | https://github.com/codemirror/lang-json |
| @codemirror/lang-sql | 6.7.0 | https://github.com/codemirror/lang-sql |
| @codemirror/language | 6.10.1 | https://github.com/codemirror/language |
| @codemirror/lint | 6.5.0 | https://github.com/codemirror/lint |
| @codemirror/search | 6.5.6 | https://github.com/codemirror/search |
| @codemirror/state | 6.4.1 | https://github.com/codemirror/state |
| @codemirror/theme-one-dark | 6.1.2 | https://github.com/codemirror/theme-one-dark |
| @codemirror/view | 6.25.1 | https://github.com/codemirror/view |
| @dagrejs/dagre | 1.1.5 | https://github.com/dagrejs/dagre |
| @dagrejs/graphlib | 2.2.4 | https://github.com/dagrejs/graphlib |
| @dnd-kit/accessibility | 3.1.1 | https://github.com/clauderic/dnd-kit |
| @dnd-kit/core | 6.3.1 | https://github.com/clauderic/dnd-kit |
| @dnd-kit/sortable | 10.0.0 | https://github.com/clauderic/dnd-kit |
| @dnd-kit/utilities | 3.2.2 | https://github.com/clauderic/dnd-kit |
| @esm2cjs/p-queue | 7.3.0 | https://github.com/esm2cjs/p-queue |
| @esm2cjs/p-timeout | 5.1.0 | https://github.com/esm2cjs/p-timeout |
| @floating-ui/core | 1.7.5 | https://github.com/floating-ui/floating-ui |
| @floating-ui/core | 1.8.0 | https://github.com/floating-ui/floating-ui |
| @floating-ui/dom | 1.7.6 | https://github.com/floating-ui/floating-ui |
| @floating-ui/dom | 1.8.0 | https://github.com/floating-ui/floating-ui |
| @floating-ui/react | 0.27.19 | https://github.com/floating-ui/floating-ui |
| @floating-ui/react-dom | 2.1.8 | https://github.com/floating-ui/floating-ui |
| @floating-ui/react-dom | 2.1.9 | https://github.com/floating-ui/floating-ui |
| @floating-ui/utils | 0.2.11 | https://github.com/floating-ui/floating-ui |
| @floating-ui/utils | 0.2.12 | https://github.com/floating-ui/floating-ui |
| @hono/node-server | 1.19.17 | https://github.com/honojs/node-server |
| @hookform/resolvers | 3.9.0 | https://github.com/react-hook-form/resolvers |
| @hyperdx/lucene | 3.1.1 | https://github.com/bripkens/lucene |
| @js-sdsl/ordered-map | 4.4.2 | https://github.com/js-sdsl/js-sdsl |
| @lezer/common | 1.5.3 | git+https://code.haverbeke.berlin/lezer/common |
| @lezer/highlight | 1.2.5 | git+https://code.haverbeke.berlin/lezer/highlight |
| @lezer/json | 1.0.2 | https://github.com/lezer-parser/json |
| @lezer/lr | 1.4.11 | git+https://code.haverbeke.berlin/lezer/lr |
| @mantine/core | 9.0.0 | https://github.com/mantinedev/mantine |
| @mantine/dates | 9.0.0 | https://github.com/mantinedev/mantine |
| @mantine/dropzone | 9.0.0 | https://github.com/mantinedev/mantine |
| @mantine/form | 9.0.0 | https://github.com/mantinedev/mantine |
| @mantine/hooks | 9.0.0 | https://github.com/mantinedev/mantine |
| @mantine/notifications | 9.0.0 | https://github.com/mantinedev/mantine |
| @mantine/spotlight | 9.0.0 | https://github.com/mantinedev/mantine |
| @mantine/store | 9.0.0 | https://github.com/mantinedev/mantine |
| @modelcontextprotocol/sdk | 1.29.0 | https://github.com/modelcontextprotocol/typescript-sdk |
| @next/env | 16.4.3 | https://github.com/vercel/next.js |
| @radix-ui/primitive | 1.1.7 | https://github.com/radix-ui/primitives |
| @radix-ui/react-accordion | 1.2.20 | https://github.com/radix-ui/primitives |
| @radix-ui/react-arrow | 1.1.15 | https://github.com/radix-ui/primitives |
| @radix-ui/react-avatar | 1.2.6 | https://github.com/radix-ui/primitives |
| @radix-ui/react-checkbox | 1.3.11 | https://github.com/radix-ui/primitives |
| @radix-ui/react-collapsible | 1.1.20 | https://github.com/radix-ui/primitives |
| @radix-ui/react-collection | 1.1.15 | https://github.com/radix-ui/primitives |
| @radix-ui/react-compose-refs | 1.1.5 | https://github.com/radix-ui/primitives |
| @radix-ui/react-context | 1.2.2 | https://github.com/radix-ui/primitives |
| @radix-ui/react-context-menu | 2.3.7 | https://github.com/radix-ui/primitives |
| @radix-ui/react-dialog | 1.1.23 | https://github.com/radix-ui/primitives |
| @radix-ui/react-direction | 1.1.4 | https://github.com/radix-ui/primitives |
| @radix-ui/react-dismissable-layer | 1.1.19 | https://github.com/radix-ui/primitives |
| @radix-ui/react-dropdown-menu | 2.1.24 | https://github.com/radix-ui/primitives |
| @radix-ui/react-focus-guards | 1.1.6 | https://github.com/radix-ui/primitives |
| @radix-ui/react-focus-scope | 1.1.16 | https://github.com/radix-ui/primitives |
| @radix-ui/react-hover-card | 1.1.23 | https://github.com/radix-ui/primitives |
| @radix-ui/react-id | 1.1.4 | https://github.com/radix-ui/primitives |
| @radix-ui/react-menu | 2.1.24 | https://github.com/radix-ui/primitives |
| @radix-ui/react-popover | 1.1.23 | https://github.com/radix-ui/primitives |
| @radix-ui/react-popper | 1.3.7 | https://github.com/radix-ui/primitives |
| @radix-ui/react-portal | 1.1.17 | https://github.com/radix-ui/primitives |
| @radix-ui/react-presence | 1.1.10 | https://github.com/radix-ui/primitives |
| @radix-ui/react-primitive | 2.1.10 | https://github.com/radix-ui/primitives |
| @radix-ui/react-radio-group | 1.4.7 | https://github.com/radix-ui/primitives |
| @radix-ui/react-roving-focus | 1.1.19 | https://github.com/radix-ui/primitives |
| @radix-ui/react-separator | 1.1.15 | https://github.com/radix-ui/primitives |
| @radix-ui/react-slot | 1.3.3 | https://github.com/radix-ui/primitives |
| @radix-ui/react-switch | 1.3.7 | https://github.com/radix-ui/primitives |
| @radix-ui/react-tabs | 1.1.21 | https://github.com/radix-ui/primitives |
| @radix-ui/react-toast | 1.2.23 | https://github.com/radix-ui/primitives |
| @radix-ui/react-tooltip | 1.2.16 | https://github.com/radix-ui/primitives |
| @radix-ui/react-use-callback-ref | 1.1.4 | https://github.com/radix-ui/primitives |
| @radix-ui/react-use-controllable-state | 1.2.6 | https://github.com/radix-ui/primitives |
| @radix-ui/react-use-effect-event | 0.0.5 | https://github.com/radix-ui/primitives |
| @radix-ui/react-use-is-hydrated | 0.1.3 | https://github.com/radix-ui/primitives |
| @radix-ui/react-use-layout-effect | 1.1.4 | https://github.com/radix-ui/primitives |
| @radix-ui/react-use-rect | 1.1.4 | https://github.com/radix-ui/primitives |
| @radix-ui/react-use-size | 1.1.4 | https://github.com/radix-ui/primitives |
| @radix-ui/react-visually-hidden | 1.2.11 | https://github.com/radix-ui/primitives |
| @radix-ui/rect | 1.1.3 | https://github.com/radix-ui/primitives |
| @reduxjs/toolkit | 2.12.0 | https://github.com/reduxjs/redux-toolkit |
| @rrweb/record | 2.2.0 | https://github.com/rrweb-io/rrweb |
| @rrweb/replay | 2.1.1 | https://github.com/rrweb-io/rrweb |
| @rrweb/types | 2.1.1 | https://github.com/rrweb-io/rrweb |
| @rrweb/types | 2.2.0 | https://github.com/rrweb-io/rrweb |
| @rrweb/utils | 2.1.1 | https://github.com/rrweb-io/rrweb |
| @rrweb/utils | 2.2.0 | https://github.com/rrweb-io/rrweb |
| @slack/types | 2.20.0 | https://github.com/slackapi/node-slack-sdk |
| @slack/webhook | 7.0.7 | https://github.com/slackapi/node-slack-sdk |
| @standard-schema/spec | 1.1.0 | https://github.com/standard-schema/standard-schema |
| @standard-schema/utils | 0.3.0 | https://github.com/standard-schema/standard-schema |
| @tabler/icons | 3.40.0 | https://github.com/tabler/tabler-icons |
| @tabler/icons-react | 3.40.0 | https://github.com/tabler/tabler-icons |
| @tanstack/query-core | 5.90.20 | https://github.com/TanStack/query |
| @tanstack/query-devtools | 5.93.0 | https://github.com/TanStack/query |
| @tanstack/react-query | 5.90.21 | https://github.com/TanStack/query |
| @tanstack/react-query-devtools | 5.91.3 | https://github.com/TanStack/query |
| @tanstack/react-table | 8.7.9 | https://github.com/tanstack/table |
| @tanstack/react-virtual | 3.0.1 | https://github.com/tanstack/virtual |
| @tanstack/table-core | 8.7.9 | https://github.com/tanstack/table |
| @tanstack/virtual-core | 3.0.0 | https://github.com/tanstack/virtual |
| @types/aws-lambda | 8.10.164 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/connect | 3.4.38 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/css-font-loading-module | 0.0.7 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-array | 3.0.4 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-color | 3.1.0 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-drag | 3.0.7 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-ease | 3.0.0 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-interpolate | 3.0.1 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-interpolate | 3.0.4 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-path | 3.0.0 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-scale | 4.0.3 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-selection | 3.0.11 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-shape | 3.1.1 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-time | 3.0.0 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-timer | 3.0.0 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-transition | 3.0.9 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-zoom | 3.0.8 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/debug | 4.1.7 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/estree | 0.0.39 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/estree | 1.0.8 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/estree-jsx | 1.0.0 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/hast | 3.0.4 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/lodash | 4.14.191 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/lodash | 4.14.198 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/lodash | 4.17.21 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/luxon | 3.7.1 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/mdast | 4.0.4 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/memcached | 2.2.7 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/ms | 0.7.31 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | 12.20.55 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | 18.16.0 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | 20.13.0 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | 22.15.18 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | 25.2.3 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/pegjs | 0.10.6 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/pg | 8.15.6 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/pg | 8.6.6 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/pg-pool | 2.0.7 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/prismjs | 1.26.6 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/unist | 2.0.6 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/unist | 3.0.2 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/use-sync-external-store | 0.0.6 | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @uiw/codemirror-extensions-basic-setup | 4.23.3 | https://github.com/uiwjs/react-codemirror |
| @uiw/react-codemirror | 4.23.3 | https://github.com/uiwjs/react-codemirror |
| @xstate/fsm | 1.6.5 | https://github.com/statelyai/xstate |
| @xyflow/react | 12.9.0 | https://github.com/xyflow/xyflow |
| @xyflow/system | 0.0.71 | https://github.com/xyflow/xyflow |
| abort-controller | 3.0.0 | https://github.com/mysticatea/abort-controller |
| accepts | 1.3.8 | https://github.com/jshttp/accepts |
| agent-base | 6.0.2 | https://github.com/TooTallNate/node-agent-base |
| agent-base | 7.1.4 | https://github.com/TooTallNate/proxy-agents |
| ajv | 6.12.6 | https://github.com/ajv-validator/ajv |
| ajv | 8.18.0 | https://github.com/ajv-validator/ajv |
| ajv | 8.20.0 | https://github.com/ajv-validator/ajv |
| ajv-formats | 2.1.1 | https://github.com/ajv-validator/ajv-formats |
| ajv-formats | 3.0.1 | https://github.com/ajv-validator/ajv-formats |
| ansi-regex | 5.0.1 | https://github.com/chalk/ansi-regex |
| ansi-regex | 6.0.1 | https://github.com/chalk/ansi-regex |
| ansi-regex | 6.2.2 | https://github.com/chalk/ansi-regex |
| ansi-styles | 3.2.1 | https://github.com/chalk/ansi-styles |
| ansi-styles | 4.3.0 | https://github.com/chalk/ansi-styles |
| ansi-styles | 5.2.0 | https://github.com/chalk/ansi-styles |
| ansi-styles | 6.2.1 | https://github.com/chalk/ansi-styles |
| ansi-styles | 6.2.3 | https://github.com/chalk/ansi-styles |
| argparse | 1.0.10 | https://github.com/nodeca/argparse |
| aria-hidden | 1.2.6 | https://github.com/theKashey/aria-hidden |
| array-flatten | 1.1.1 | https://github.com/blakeembrey/array-flatten |
| asynckit | 0.4.0 | https://github.com/alexindigo/asynckit |
| atomic-sleep | 1.0.0 | https://github.com/davidmarkclements/atomic-sleep |
| attr-accept | 2.2.5 | https://github.com/react-dropzone/attr-accept |
| aws4 | 1.13.2 | https://github.com/mhart/aws4 |
| axios | 1.18.1 | https://github.com/axios/axios |
| bail | 2.0.2 | https://github.com/wooorm/bail |
| balanced-match | 1.0.2 | https://github.com/juliangruber/balanced-match |
| balanced-match | 2.0.0 | https://github.com/juliangruber/balanced-match |
| balanced-match | 4.0.3 | https://github.com/juliangruber/balanced-match |
| balanced-match | 4.0.4 | https://github.com/juliangruber/balanced-match |
| base64-arraybuffer | 1.0.2 | https://github.com/niklasvh/base64-arraybuffer |
| base64-js | 1.5.1 | https://github.com/beatgammit/base64-js |
| bignumber.js | 9.1.1 | https://github.com/MikeMcl/bignumber.js |
| bignumber.js | 9.1.2 | https://github.com/MikeMcl/bignumber.js |
| binary-extensions | 2.2.0 | https://github.com/sindresorhus/binary-extensions |
| body-parser | 1.20.6 | https://github.com/expressjs/body-parser |
| brace-expansion | 1.1.17 | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 2.1.3 | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 2.1.4 | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 5.0.12 | https://github.com/juliangruber/brace-expansion |
| brace-expansion | 5.0.8 | https://github.com/juliangruber/brace-expansion |
| braces | 3.0.3 | https://github.com/micromatch/braces |
| bytes | 3.0.0 | https://github.com/visionmedia/bytes.js |
| bytes | 3.1.2 | https://github.com/visionmedia/bytes.js |
| call-bind-apply-helpers | 1.0.2 | https://github.com/ljharb/call-bind-apply-helpers |
| call-bound | 1.0.4 | https://github.com/ljharb/call-bound |
| ccount | 2.0.1 | https://github.com/wooorm/ccount |
| chalk | 2.4.2 | https://github.com/chalk/chalk |
| chalk | 4.1.2 | https://github.com/chalk/chalk |
| chalk | 5.0.1 | https://github.com/chalk/chalk |
| chalk | 5.6.2 | https://github.com/chalk/chalk |
| character-entities | 2.0.2 | https://github.com/wooorm/character-entities |
| character-entities-html4 | 2.1.0 | https://github.com/wooorm/character-entities-html4 |
| character-entities-legacy | 3.0.0 | https://github.com/wooorm/character-entities-legacy |
| character-reference-invalid | 2.0.1 | https://github.com/wooorm/character-reference-invalid |
| chokidar | 3.5.3 | https://github.com/paulmillr/chokidar |
| chokidar | 4.0.3 | https://github.com/paulmillr/chokidar |
| chrono-node | 2.9.0 | https://github.com/wanasit/chrono |
| cjs-module-lexer | 1.3.1 | https://github.com/nodejs/cjs-module-lexer |
| cjs-module-lexer | 2.1.1 | https://github.com/nodejs/cjs-module-lexer |
| cjs-module-lexer | 2.3.0 | https://github.com/nodejs/cjs-module-lexer |
| classcat | 5.0.5 | https://github.com/jorgebucaran/classcat |
| classnames | 2.3.1 | https://github.com/JedWatson/classnames |
| classnames | 2.3.2 | https://github.com/JedWatson/classnames |
| client-only | 0.0.1 |  |
| clsx | 1.2.1 | https://github.com/lukeed/clsx |
| clsx | 2.1.1 | https://github.com/lukeed/clsx |
| cmake-js | 8.0.0 | https://github.com/cmake-js/cmake-js |
| codemirror | 6.0.1 | https://github.com/codemirror/basic-setup |
| color | 4.2.3 | https://github.com/Qix-/color |
| color-convert | 1.9.3 | https://github.com/Qix-/color-convert |
| color-convert | 2.0.1 | https://github.com/Qix-/color-convert |
| color-name | 1.1.3 | https://github.com/dfcreative/color-name |
| color-name | 1.1.4 | https://github.com/colorjs/color-name |
| color-string | 1.9.1 | https://github.com/Qix-/color-string |
| combined-stream | 1.0.8 | https://github.com/felixge/node-combined-stream |
| comma-separated-tokens | 2.0.3 | https://github.com/wooorm/comma-separated-tokens |
| commander | 11.1.0 | https://github.com/tj/commander.js |
| commander | 12.1.0 | https://github.com/tj/commander.js |
| commander | 14.0.3 | https://github.com/tj/commander.js |
| commander | 2.20.3 | https://github.com/tj/commander.js |
| commander | 4.1.1 | https://github.com/tj/commander.js |
| commander | 6.2.0 | https://github.com/tj/commander.js |
| commander | 8.3.0 | https://github.com/tj/commander.js |
| commander | 9.5.0 | https://github.com/tj/commander.js |
| compressible | 2.0.18 | https://github.com/jshttp/compressible |
| compression | 1.8.1 | https://github.com/expressjs/compression |
| compression | 1.8.2 | https://github.com/expressjs/compression |
| concurrently | 9.1.2 | https://github.com/open-cli-tools/concurrently |
| content-disposition | 0.5.2 | https://github.com/jshttp/content-disposition |
| content-disposition | 0.5.4 | https://github.com/jshttp/content-disposition |
| content-type | 1.0.5 | https://github.com/jshttp/content-type |
| cookie | 0.7.2 | https://github.com/jshttp/cookie |
| cookie-signature | 1.0.6 | https://github.com/visionmedia/node-cookie-signature |
| cookie-signature | 1.0.7 | https://github.com/visionmedia/node-cookie-signature |
| copy-to-clipboard | 3.3.3 | https://github.com/sudodoki/copy-to-clipboard |
| cors | 2.8.5 | https://github.com/expressjs/cors |
| crelt | 1.0.6 | https://github.com/marijnh/crelt |
| cron | 4.3.3 | https://github.com/kelektiv/node-cron |
| cross-spawn | 5.1.0 | https://github.com/IndigoUnited/node-cross-spawn |
| cross-spawn | 7.0.6 | https://github.com/moxystudio/node-cross-spawn |
| crypto-js | 4.2.0 | https://github.com/brix/crypto-js |
| crypto-randomuuid | 1.0.0 |  |
| csstype | 3.2.3 | https://github.com/frenic/csstype |
| date-fns | 2.29.3 | https://github.com/date-fns/date-fns |
| date-fns-tz | 2.0.0 | https://github.com/marnusw/date-fns-tz |
| dayjs | 1.11.19 | https://github.com/iamkun/dayjs |
| debug | 2.6.9 | https://github.com/visionmedia/debug |
| debug | 3.2.7 | https://github.com/visionmedia/debug |
| debug | 4.4.0 | https://github.com/debug-js/debug |
| debug | 4.4.3 | https://github.com/debug-js/debug |
| decimal.js-light | 2.5.1 | https://github.com/MikeMcl/decimal.js-light |
| decode-named-character-reference | 1.0.2 | https://github.com/wooorm/decode-named-character-reference |
| deep-aplus | 1.0.4 | https://github.com/nknapp/deep-aplus |
| deep-extend | 0.6.0 | https://github.com/unclechu/node-deep-extend |
| delayed-stream | 1.0.0 | https://github.com/felixge/node-delayed-stream |
| depd | 2.0.0 | https://github.com/dougwilson/nodejs-depd |
| dequal | 2.0.3 | https://github.com/lukeed/dequal |
| destroy | 1.2.0 | https://github.com/stream-utils/destroy |
| detect-node-es | 1.1.0 | https://github.com/thekashey/detect-node |
| devlop | 1.1.0 | https://github.com/wooorm/devlop |
| discontinuous-range | 1.0.0 | https://github.com/dtudury/discontinuous-range |
| dom-helpers | 5.2.1 | https://github.com/react-bootstrap/dom-helpers |
| dunder-proto | 1.0.1 | https://github.com/es-shims/dunder-proto |
| ee-first | 1.1.1 | https://github.com/jonathanong/ee-first |
| emoji-regex | 10.6.0 | https://github.com/mathiasbynens/emoji-regex |
| emoji-regex | 8.0.0 | https://github.com/mathiasbynens/emoji-regex |
| emoji-regex | 9.2.2 | https://github.com/mathiasbynens/emoji-regex |
| encodeurl | 2.0.0 | https://github.com/pillarjs/encodeurl |
| es-define-property | 1.0.1 | https://github.com/ljharb/es-define-property |
| es-errors | 1.3.0 | https://github.com/ljharb/es-errors |
| es-module-lexer | 1.5.3 | https://github.com/guybedford/es-module-lexer |
| es-module-lexer | 2.0.0 | https://github.com/guybedford/es-module-lexer |
| es-module-lexer | 3.0.4 | https://github.com/guybedford/es-module-lexer |
| es-object-atoms | 1.1.1 | https://github.com/ljharb/es-object-atoms |
| es-set-tostringtag | 2.0.1 | https://github.com/es-shims/es-set-tostringtag |
| es-set-tostringtag | 2.1.0 | https://github.com/es-shims/es-set-tostringtag |
| es-toolkit | 1.45.1 | https://github.com/toss/es-toolkit |
| es-toolkit | 1.49.0 | https://github.com/toss/es-toolkit |
| escalade | 3.2.0 | https://github.com/lukeed/escalade |
| escape-html | 1.0.3 | https://github.com/component/escape-html |
| escape-string-regexp | 1.0.5 | https://github.com/sindresorhus/escape-string-regexp |
| escape-string-regexp | 2.0.0 | https://github.com/sindresorhus/escape-string-regexp |
| escape-string-regexp | 4.0.0 | https://github.com/sindresorhus/escape-string-regexp |
| escape-string-regexp | 5.0.0 | https://github.com/sindresorhus/escape-string-regexp |
| estree-util-is-identifier-name | 3.0.0 | https://github.com/syntax-tree/estree-util-is-identifier-name |
| etag | 1.8.1 | https://github.com/jshttp/etag |
| event-target-shim | 5.0.1 | https://github.com/mysticatea/event-target-shim |
| eventemitter3 | 4.0.7 | https://github.com/primus/eventemitter3 |
| eventemitter3 | 5.0.4 | https://github.com/primus/eventemitter3 |
| eventsource | 3.0.7 | git://git@github.com/EventSource/eventsource |
| eventsource-parser | 3.0.6 | https://github.com/rexxars/eventsource-parser |
| eventsource-parser | 3.1.1 | https://github.com/rexxars/eventsource-parser |
| express | 4.22.1 | https://github.com/expressjs/express |
| express-rate-limit | 6.7.1 | https://github.com/express-rate-limit/express-rate-limit |
| express-rate-limit | 8.3.2 | https://github.com/express-rate-limit/express-rate-limit |
| express-session | 1.17.3 | https://github.com/expressjs/session |
| extend | 3.0.2 | https://github.com/justmoon/node-extend |
| fast-deep-equal | 3.1.3 | https://github.com/epoberezkin/fast-deep-equal |
| fault | 1.0.4 | https://github.com/wooorm/fault |
| file-selector | 2.1.2 | https://github.com/react-dropzone/file-selector |
| fill-range | 7.1.1 | https://github.com/jonschlinkert/fill-range |
| finalhandler | 1.3.2 | https://github.com/pillarjs/finalhandler |
| follow-redirects | 1.16.0 | https://github.com/follow-redirects/follow-redirects |
| form-data | 4.0.6 | https://github.com/form-data/form-data |
| format | 0.2.2 | https://github.com/samsonjs/format |
| forwarded | 0.2.0 | https://github.com/jshttp/forwarded |
| forwarded-parse | 2.1.2 | https://github.com/lpinca/forwarded-parse |
| fresh | 0.5.2 | https://github.com/jshttp/fresh |
| fs-extra | 10.1.0 | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 11.4.1 | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 7.0.1 | https://github.com/jprichardson/node-fs-extra |
| fs-extra | 8.1.0 | https://github.com/jprichardson/node-fs-extra |
| function-bind | 1.1.1 | https://github.com/Raynos/function-bind |
| function-bind | 1.1.2 | https://github.com/Raynos/function-bind |
| get-intrinsic | 1.2.0 | https://github.com/ljharb/get-intrinsic |
| get-intrinsic | 1.3.0 | https://github.com/ljharb/get-intrinsic |
| get-intrinsic | 1.3.1 | https://github.com/ljharb/get-intrinsic |
| get-nonce | 1.0.1 | https://github.com/theKashey/get-nonce |
| get-proto | 1.0.1 | https://github.com/ljharb/get-proto |
| gopd | 1.2.0 | https://github.com/ljharb/gopd |
| handlebars | 4.7.10 | https://github.com/handlebars-lang/handlebars.js |
| has-flag | 3.0.0 | https://github.com/sindresorhus/has-flag |
| has-flag | 4.0.0 | https://github.com/sindresorhus/has-flag |
| has-symbols | 1.0.3 | https://github.com/inspect-js/has-symbols |
| has-symbols | 1.1.0 | https://github.com/inspect-js/has-symbols |
| has-tostringtag | 1.0.2 | https://github.com/inspect-js/has-tostringtag |
| hasown | 2.0.0 | https://github.com/inspect-js/hasOwn |
| hasown | 2.0.2 | https://github.com/inspect-js/hasOwn |
| hasown | 2.0.4 | https://github.com/inspect-js/hasOwn |
| hast-util-parse-selector | 4.0.0 | https://github.com/syntax-tree/hast-util-parse-selector |
| hast-util-to-jsx-runtime | 2.3.6 | https://github.com/syntax-tree/hast-util-to-jsx-runtime |
| hast-util-whitespace | 3.0.0 | https://github.com/syntax-tree/hast-util-whitespace |
| hastscript | 9.0.1 | https://github.com/syntax-tree/hastscript |
| hono | 4.13.13 | https://github.com/honojs/hono |
| html-url-attributes | 3.0.1 | https://github.com/rehypejs/rehype-minify.git#main |
| http-errors | 2.0.1 | https://github.com/jshttp/http-errors |
| http-graceful-shutdown | 3.1.13 | https://github.com/sebhildebrandt/http-graceful-shutdown |
| http-proxy-middleware | 4.1.1 | https://github.com/chimurai/http-proxy-middleware |
| https-proxy-agent | 5.0.1 | https://github.com/TooTallNate/node-https-proxy-agent |
| https-proxy-agent | 7.0.6 | https://github.com/TooTallNate/proxy-agents |
| httpxy | 0.5.3 | https://github.com/unjs/httpxy |
| iconv-lite | 0.4.24 | https://github.com/ashtuchkin/iconv-lite |
| iconv-lite | 0.6.3 | https://github.com/ashtuchkin/iconv-lite |
| iconv-lite | 0.7.2 | https://github.com/pillarjs/iconv-lite |
| iconv-lite | 0.7.3 | https://github.com/pillarjs/iconv-lite |
| immer | 11.1.9 | https://github.com/immerjs/immer |
| immer | 9.0.21 | https://github.com/immerjs/immer |
| immutable | 4.3.9 | https://github.com/immutable-js/immutable-js |
| inline-style-parser | 0.2.7 | https://github.com/remarkablemark/inline-style-parser |
| ip-address | 10.1.0 | https://github.com/beaugunderson/ip-address |
| ip-address | 10.7.4 | https://github.com/beaugunderson/ip-address |
| ip-address | 9.0.5 | https://github.com/beaugunderson/ip-address |
| ipaddr.js | 1.9.1 | https://github.com/whitequark/ipaddr.js |
| is-alphabetical | 2.0.1 | https://github.com/wooorm/is-alphabetical |
| is-alphanumerical | 2.0.1 | https://github.com/wooorm/is-alphanumerical |
| is-arrayish | 0.2.1 | https://github.com/qix-/node-is-arrayish |
| is-arrayish | 0.3.2 | https://github.com/qix-/node-is-arrayish |
| is-binary-path | 2.1.0 | https://github.com/sindresorhus/is-binary-path |
| is-decimal | 2.0.1 | https://github.com/wooorm/is-decimal |
| is-extglob | 2.1.1 | https://github.com/jonschlinkert/is-extglob |
| is-fullwidth-code-point | 3.0.0 | https://github.com/sindresorhus/is-fullwidth-code-point |
| is-fullwidth-code-point | 4.0.0 | https://github.com/sindresorhus/is-fullwidth-code-point |
| is-fullwidth-code-point | 5.1.0 | https://github.com/sindresorhus/is-fullwidth-code-point |
| is-glob | 4.0.3 | https://github.com/micromatch/is-glob |
| is-hexadecimal | 2.0.1 | https://github.com/wooorm/is-hexadecimal |
| is-number | 7.0.0 | https://github.com/jonschlinkert/is-number |
| is-plain-obj | 1.1.0 | https://github.com/sindresorhus/is-plain-obj |
| is-plain-obj | 4.1.0 | https://github.com/sindresorhus/is-plain-obj |
| jose | 6.2.2 | https://github.com/panva/jose |
| jotai | 2.5.1 | https://github.com/pmndrs/jotai |
| js-tokens | 4.0.0 | https://github.com/lydell/js-tokens |
| json-bigint | 1.0.0 | https://github.com/sidorares/json-bigint |
| json-schema-traverse | 0.4.1 | https://github.com/epoberezkin/json-schema-traverse |
| json-schema-traverse | 1.0.0 | https://github.com/epoberezkin/json-schema-traverse |
| jsonfile | 4.0.0 | https://github.com/jprichardson/node-jsonfile |
| jsonfile | 6.1.0 | https://github.com/jprichardson/node-jsonfile |
| klona | 2.0.6 | https://github.com/lukeed/klona |
| ky | 0.30.0 | https://github.com/sindresorhus/ky |
| ky-universal | 0.10.1 | https://github.com/sindresorhus/ky-universal |
| lodash | 4.17.23 | https://github.com/lodash/lodash |
| lodash | 4.18.1 | https://github.com/lodash/lodash |
| lodash-es | 4.18.1 | https://github.com/lodash/lodash |
| lodash.camelcase | 4.3.0 | https://github.com/lodash/lodash |
| lodash.isequal | 4.5.0 | https://github.com/lodash/lodash |
| lodash.isplainobject | 4.0.6 | https://github.com/lodash/lodash |
| longest-streak | 3.1.0 | https://github.com/wooorm/longest-streak |
| loose-envify | 1.4.0 | https://github.com/zertosh/loose-envify |
| lowlight | 1.20.0 | https://github.com/wooorm/lowlight |
| luxon | 3.7.2 | https://github.com/moment/luxon |
| markdown-table | 3.0.4 | https://github.com/wooorm/markdown-table |
| math-intrinsics | 1.1.0 | https://github.com/es-shims/math-intrinsics |
| mdast-util-find-and-replace | 3.0.2 | https://github.com/syntax-tree/mdast-util-find-and-replace |
| mdast-util-from-markdown | 2.0.2 | https://github.com/syntax-tree/mdast-util-from-markdown |
| mdast-util-gfm | 3.1.0 | https://github.com/syntax-tree/mdast-util-gfm |
| mdast-util-gfm-autolink-literal | 2.0.1 | https://github.com/syntax-tree/mdast-util-gfm-autolink-literal |
| mdast-util-gfm-footnote | 2.1.0 | https://github.com/syntax-tree/mdast-util-gfm-footnote |
| mdast-util-gfm-strikethrough | 2.0.0 | https://github.com/syntax-tree/mdast-util-gfm-strikethrough |
| mdast-util-gfm-table | 2.0.0 | https://github.com/syntax-tree/mdast-util-gfm-table |
| mdast-util-gfm-task-list-item | 2.0.0 | https://github.com/syntax-tree/mdast-util-gfm-task-list-item |
| mdast-util-mdx-expression | 2.0.1 | https://github.com/syntax-tree/mdast-util-mdx-expression |
| mdast-util-mdx-jsx | 3.2.0 | https://github.com/syntax-tree/mdast-util-mdx-jsx |
| mdast-util-mdxjs-esm | 2.0.1 | https://github.com/syntax-tree/mdast-util-mdxjs-esm |
| mdast-util-phrasing | 4.1.0 | https://github.com/syntax-tree/mdast-util-phrasing |
| mdast-util-to-hast | 13.2.1 | https://github.com/syntax-tree/mdast-util-to-hast |
| mdast-util-to-markdown | 2.1.2 | https://github.com/syntax-tree/mdast-util-to-markdown |
| mdast-util-to-string | 4.0.0 | https://github.com/syntax-tree/mdast-util-to-string |
| media-typer | 0.3.0 | https://github.com/jshttp/media-typer |
| memoize-one | 5.2.1 | https://github.com/alexreardon/memoize-one |
| merge-descriptors | 1.0.3 | https://github.com/sindresorhus/merge-descriptors |
| methods | 1.1.2 | https://github.com/jshttp/methods |
| micromark | 4.0.2 | https://github.com/micromark/micromark.git#main |
| micromark-core-commonmark | 2.0.3 | https://github.com/micromark/micromark.git#main |
| micromark-extension-gfm | 3.0.0 | https://github.com/micromark/micromark-extension-gfm |
| micromark-extension-gfm-autolink-literal | 2.1.0 | https://github.com/micromark/micromark-extension-gfm-autolink-literal |
| micromark-extension-gfm-footnote | 2.1.0 | https://github.com/micromark/micromark-extension-gfm-footnote |
| micromark-extension-gfm-strikethrough | 2.1.0 | https://github.com/micromark/micromark-extension-gfm-strikethrough |
| micromark-extension-gfm-table | 2.1.1 | https://github.com/micromark/micromark-extension-gfm-table |
| micromark-extension-gfm-tagfilter | 2.0.0 | https://github.com/micromark/micromark-extension-gfm-tagfilter |
| micromark-extension-gfm-task-list-item | 2.1.0 | https://github.com/micromark/micromark-extension-gfm-task-list-item |
| micromark-factory-destination | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-factory-label | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-factory-space | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-factory-title | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-factory-whitespace | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-character | 2.1.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-chunked | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-classify-character | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-combine-extensions | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-decode-numeric-character-reference | 2.0.2 | https://github.com/micromark/micromark.git#main |
| micromark-util-decode-string | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-encode | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-html-tag-name | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-normalize-identifier | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-resolve-all | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-sanitize-uri | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-subtokenize | 2.1.0 | https://github.com/micromark/micromark.git#main |
| micromark-util-symbol | 2.0.1 | https://github.com/micromark/micromark.git#main |
| micromark-util-types | 2.0.2 | https://github.com/micromark/micromark.git#main |
| micromatch | 4.0.8 | https://github.com/micromatch/micromatch |
| mime | 1.6.0 | https://github.com/broofa/node-mime |
| mime | 2.6.0 | https://github.com/broofa/mime |
| mime-db | 1.33.0 | https://github.com/jshttp/mime-db |
| mime-db | 1.52.0 | https://github.com/jshttp/mime-db |
| mime-types | 2.1.18 | https://github.com/jshttp/mime-types |
| mime-types | 2.1.35 | https://github.com/jshttp/mime-types |
| minimist | 1.2.8 | https://github.com/minimistjs/minimist |
| minizlib | 2.1.2 | https://github.com/isaacs/minizlib |
| minizlib | 3.1.0 | https://github.com/isaacs/minizlib |
| mitt | 3.0.1 | https://github.com/developit/mitt |
| mkdirp | 1.0.4 | https://github.com/isaacs/node-mkdirp |
| module-details-from-path | 1.0.3 | https://github.com/watson/module-details-from-path |
| module-details-from-path | 1.0.4 | https://github.com/watson/module-details-from-path |
| ms | 2.0.0 | https://github.com/zeit/ms |
| ms | 2.1.3 | https://github.com/vercel/ms |
| nanoid | 3.3.17 | https://github.com/ai/nanoid |
| nearley | 2.20.1 | https://github.com/hardmath123/nearley |
| negotiator | 0.6.3 | https://github.com/jshttp/negotiator |
| negotiator | 0.6.4 | https://github.com/jshttp/negotiator |
| neo-async | 2.6.2 | https://github.com/suguru03/neo-async |
| next | 16.4.3 | https://github.com/vercel/next.js |
| next-runtime-env | 1.7.4 | https://github.com/expatfile/next-runtime-env |
| next-seo | 4.29.0 | https://github.com/garmeeh/next-seo |
| node-addon-api | 8.9.2 | https://github.com/nodejs/node-addon-api |
| node-api-headers | 1.9.0 | https://github.com/nodejs/node-api-headers |
| node-fetch | 2.7.0 | https://github.com/bitinn/node-fetch |
| node-fetch | 3.3.0 | https://github.com/node-fetch/node-fetch |
| node-fetch | 3.3.2 | https://github.com/node-fetch/node-fetch |
| normalize-path | 3.0.0 | https://github.com/jonschlinkert/normalize-path |
| numbro | 2.4.0 | https://github.com/BenjaminVanRyseghem/numbro |
| numbro | 2.5.0 | https://github.com/BenjaminVanRyseghem/numbro |
| nuqs | 1.17.0 | https://github.com/47ng/nuqs |
| object-assign | 4.1.1 | https://github.com/sindresorhus/object-assign |
| object-hash | 3.0.0 | https://github.com/puleos/object-hash |
| object-inspect | 1.13.4 | https://github.com/inspect-js/object-inspect |
| on-exit-leak-free | 2.1.2 | https://github.com/mcollina/on-exit-or-gc |
| on-finished | 2.4.1 | https://github.com/jshttp/on-finished |
| on-headers | 1.1.0 | https://github.com/jshttp/on-headers |
| papaparse | 5.5.3 | https://github.com/mholt/PapaParse |
| parse-entities | 4.0.1 | https://github.com/wooorm/parse-entities |
| parseurl | 1.3.3 | https://github.com/pillarjs/parseurl |
| passport | 0.6.0 | https://github.com/jaredhanson/passport |
| passport-local | 1.0.0 | https://github.com/jaredhanson/passport-local |
| passport-strategy | 1.0.0 | https://github.com/jaredhanson/passport-strategy |
| path-key | 3.1.1 | https://github.com/sindresorhus/path-key |
| path-key | 4.0.0 | https://github.com/sindresorhus/path-key |
| path-to-regexp | 0.1.12 | https://github.com/pillarjs/path-to-regexp |
| path-to-regexp | 3.3.0 | https://github.com/pillarjs/path-to-regexp |
| path-to-regexp | 6.2.2 | https://github.com/pillarjs/path-to-regexp |
| pg-protocol | 1.6.0 | https://github.com/brianc/node-postgres |
| pg-types | 2.2.0 | https://github.com/brianc/node-pg-types |
| picomatch | 2.3.2 | https://github.com/micromatch/picomatch |
| picomatch | 4.0.3 | https://github.com/micromatch/picomatch |
| picomatch | 4.0.4 | https://github.com/micromatch/picomatch |
| pino | 10.0.0 | https://github.com/pinojs/pino |
| pino-abstract-transport | 2.0.0 | https://github.com/pinojs/pino-abstract-transport |
| pino-http | 11.0.0 | https://github.com/pinojs/pino-http |
| pino-std-serializers | 7.0.0 | https://github.com/pinojs/pino-std-serializers |
| pkce-challenge | 5.0.1 | https://github.com/crouchcd/pkce-challenge |
| postcss | 8.4.38 | https://github.com/postcss/postcss |
| postcss | 8.5.23 | https://github.com/postcss/postcss |
| postcss | 8.5.6 | https://github.com/postcss/postcss |
| postgres-array | 2.0.0 | https://github.com/bendrucker/postgres-array |
| postgres-bytea | 1.0.0 | https://github.com/bendrucker/postgres-bytea |
| postgres-date | 1.0.7 | https://github.com/bendrucker/postgres-date |
| postgres-interval | 1.2.0 | https://github.com/bendrucker/postgres-interval |
| prismjs | 1.30.0 | https://github.com/PrismJS/prism |
| process-warning | 5.0.0 | https://github.com/fastify/process-warning |
| promised-handlebars | 2.0.1 | https://github.com/nknapp/promised-handlebars |
| prop-types | 15.8.1 | https://github.com/facebook/prop-types |
| property-information | 7.1.0 | https://github.com/wooorm/property-information |
| proxy-addr | 2.0.8 | https://github.com/jshttp/proxy-addr |
| proxy-from-env | 2.1.0 | https://github.com/Rob--W/proxy-from-env |
| quick-format-unescaped | 4.0.4 | https://github.com/davidmarkclements/quick-format |
| randexp | 0.4.6 | https://github.com/fent/randexp.js |
| random-bytes | 1.0.0 | https://github.com/crypto-utils/random-bytes |
| range-parser | 1.2.0 | https://github.com/jshttp/range-parser |
| range-parser | 1.2.1 | https://github.com/jshttp/range-parser |
| raw-body | 2.5.3 | https://github.com/stream-utils/raw-body |
| raw-body | 3.0.2 | https://github.com/stream-utils/raw-body |
| react | 19.2.1 | https://github.com/facebook/react |
| react | 19.2.3 | https://github.com/facebook/react |
| react | 19.2.4 | https://github.com/facebook/react |
| react-base16-styling | 0.10.0 | https://github.com/reduxjs/redux-devtools |
| react-copy-to-clipboard | 5.1.0 | https://github.com/nkbt/react-copy-to-clipboard |
| react-dom | 19.2.1 | https://github.com/facebook/react |
| react-dom | 19.2.3 | https://github.com/facebook/react |
| react-draggable | 4.4.5 | https://github.com/react-grid-layout/react-draggable |
| react-dropzone | 15.0.0 | https://github.com/react-dropzone/react-dropzone |
| react-error-boundary | 3.1.4 | https://github.com/bvaughn/react-error-boundary |
| react-grid-layout | 1.3.4 | https://github.com/STRML/react-grid-layout |
| react-hook-form | 7.43.8 | https://github.com/react-hook-form/react-hook-form |
| react-hotkeys-hook | 4.3.7 | git+https://JohannesKlauss@github.com/JohannesKlauss/react-keymap-hook |
| react-is | 16.13.1 | https://github.com/facebook/react |
| react-is | 17.0.2 | https://github.com/facebook/react |
| react-is | 18.3.1 | https://github.com/facebook/react |
| react-is | 19.2.6 | https://github.com/facebook/react |
| react-is | 19.2.7 | https://github.com/facebook/react |
| react-json-tree | 0.20.0 | https://github.com/reduxjs/redux-devtools |
| react-markdown | 10.1.0 | https://github.com/remarkjs/react-markdown |
| react-number-format | 5.4.5 | https://github.com/s-yadav/react-number-format |
| react-redux | 9.3.0 | https://github.com/reduxjs/react-redux |
| react-remove-scroll | 2.7.2 | https://github.com/theKashey/react-remove-scroll |
| react-remove-scroll-bar | 2.3.8 | https://github.com/theKashey/react-remove-scroll-bar |
| react-resizable | 3.0.5 | https://github.com/react-grid-layout/react-resizable |
| react-sortablejs | 6.1.4 | https://github.com/SortableJS/react-sortablejs |
| react-style-singleton | 2.2.3 | https://github.com/theKashey/react-style-singleton |
| react-syntax-highlighter | 16.1.1 | https://github.com/react-syntax-highlighter/react-syntax-highlighter |
| react-virtualized-auto-sizer | 1.0.26 | https://github.com/bvaughn/react-virtualized-auto-sizer |
| react-window | 1.8.11 | https://github.com/bvaughn/react-window |
| readdirp | 3.6.0 | https://github.com/paulmillr/readdirp |
| readdirp | 4.1.1 | https://github.com/paulmillr/readdirp |
| real-require | 0.2.0 | https://github.com/pinojs/real-require |
| recharts | 3.9.1 | https://github.com/recharts/recharts |
| redux | 5.0.1 | https://github.com/reduxjs/redux |
| redux-thunk | 3.1.0 | https://github.com/reduxjs/redux-thunk |
| refractor | 5.0.0 | https://github.com/wooorm/refractor |
| regenerator-runtime | 0.14.0 | https://github.com/facebook/regenerator.git#main |
| remark-gfm | 4.0.1 | https://github.com/remarkjs/remark-gfm |
| remark-parse | 11.0.0 | https://github.com/remarkjs/remark.git#main |
| remark-rehype | 11.1.2 | https://github.com/remarkjs/remark-rehype |
| remark-stringify | 11.0.0 | https://github.com/remarkjs/remark.git#main |
| require-directory | 2.1.1 | https://github.com/troygoode/node-require-directory |
| require-from-string | 2.0.2 | https://github.com/floatdrop/require-from-string |
| require-in-the-middle | 8.0.1 | https://github.com/nodejs/require-in-the-middle |
| reselect | 5.2.0 | https://github.com/reduxjs/reselect |
| ret | 0.1.15 | https://github.com/fent/ret.js |
| rrdom | 2.1.1 | https://github.com/rrweb-io/rrweb |
| rrdom | 2.2.0 | https://github.com/rrweb-io/rrweb |
| rrweb | 2.1.1 | https://github.com/rrweb-io/rrweb |
| rrweb | 2.2.0 | https://github.com/rrweb-io/rrweb |
| rrweb-snapshot | 2.1.1 | https://github.com/rrweb-io/rrweb |
| rrweb-snapshot | 2.2.0 | https://github.com/rrweb-io/rrweb |
| safe-buffer | 5.1.2 | https://github.com/feross/safe-buffer |
| safe-buffer | 5.2.1 | https://github.com/feross/safe-buffer |
| safe-stable-stringify | 1.1.1 | https://github.com/BridgeAR/safe-stable-stringify |
| safe-stable-stringify | 2.4.2 | https://github.com/BridgeAR/safe-stable-stringify |
| safer-buffer | 2.1.2 | https://github.com/ChALkeR/safer-buffer |
| sass | 1.58.3 | https://github.com/sass/dart-sass |
| scheduler | 0.27.0 | https://github.com/facebook/react |
| send | 0.19.2 | https://github.com/pillarjs/send |
| serialize-error | 8.1.0 | https://github.com/sindresorhus/serialize-error |
| serve-static | 1.16.3 | https://github.com/expressjs/serve-static |
| shebang-command | 1.2.0 | https://github.com/kevva/shebang-command |
| shebang-command | 2.0.0 | https://github.com/kevva/shebang-command |
| shebang-regex | 1.0.0 | https://github.com/sindresorhus/shebang-regex |
| shebang-regex | 3.0.0 | https://github.com/sindresorhus/shebang-regex |
| shell-quote | 1.11.0 | https://github.com/ljharb/shell-quote |
| side-channel | 1.1.0 | https://github.com/ljharb/side-channel |
| side-channel | 1.1.1 | https://github.com/ljharb/side-channel |
| side-channel-list | 1.0.0 | https://github.com/ljharb/side-channel-list |
| side-channel-list | 1.0.1 | https://github.com/ljharb/side-channel-list |
| side-channel-map | 1.0.1 | https://github.com/ljharb/side-channel-map |
| side-channel-weakmap | 1.0.2 | https://github.com/ljharb/side-channel-weakmap |
| simple-swizzle | 0.2.2 | https://github.com/qix-/node-simple-swizzle |
| slow-redact | 0.3.1 | https://github.com/pinojs/slow-redact |
| sonic-boom | 4.2.0 | https://github.com/pinojs/sonic-boom |
| sortablejs | 1.15.7 | https://github.com/SortableJS/Sortable |
| space-separated-tokens | 2.0.2 | https://github.com/wooorm/space-separated-tokens |
| sql-formatter | 15.7.2 | https://github.com/sql-formatter-org/sql-formatter |
| sqlstring | 2.3.3 | https://github.com/mysqljs/sqlstring |
| statuses | 2.0.1 | https://github.com/jshttp/statuses |
| statuses | 2.0.2 | https://github.com/jshttp/statuses |
| string-width | 4.2.3 | https://github.com/sindresorhus/string-width |
| string-width | 5.1.2 | https://github.com/sindresorhus/string-width |
| string-width | 7.2.0 | https://github.com/sindresorhus/string-width |
| string-width | 8.2.0 | https://github.com/sindresorhus/string-width |
| stringify-entities | 4.0.3 | https://github.com/wooorm/stringify-entities |
| strip-ansi | 6.0.1 | https://github.com/chalk/strip-ansi |
| strip-ansi | 7.1.0 | https://github.com/chalk/strip-ansi |
| strip-ansi | 7.2.0 | https://github.com/chalk/strip-ansi |
| strip-json-comments | 2.0.1 | https://github.com/sindresorhus/strip-json-comments |
| strip-json-comments | 3.1.1 | https://github.com/sindresorhus/strip-json-comments |
| strip-json-comments | 5.0.3 | https://github.com/sindresorhus/strip-json-comments |
| style-mod | 4.1.2 | https://github.com/marijnh/style-mod |
| style-to-js | 1.1.21 | https://github.com/remarkablemark/style-to-js |
| style-to-object | 1.0.14 | https://github.com/remarkablemark/style-to-object |
| styled-jsx | 5.1.6 | https://github.com/vercel/styled-jsx |
| styled-jsx | 5.1.7 | https://github.com/vercel/styled-jsx |
| supports-color | 5.5.0 | https://github.com/chalk/supports-color |
| supports-color | 7.2.0 | https://github.com/chalk/supports-color |
| supports-color | 8.1.1 | https://github.com/chalk/supports-color |
| systeminformation | 5.33.19 | https://github.com/sebhildebrandt/systeminformation |
| tabbable | 6.2.0 | https://github.com/focus-trap/tabbable |
| thread-stream | 3.1.0 | https://github.com/mcollina/thread-stream |
| timestamp-nano | 1.0.1 | https://github.com/kawanet/timestamp-nano |
| tiny-invariant | 1.2.0 | https://github.com/alexreardon/tiny-invariant |
| tiny-invariant | 1.3.3 | https://github.com/alexreardon/tiny-invariant |
| to-regex-range | 5.0.1 | https://github.com/micromatch/to-regex-range |
| toggle-selection | 1.0.6 | https://github.com/sudodoki/toggle-selection |
| toidentifier | 1.0.1 | https://github.com/component/toidentifier |
| tr46 | 0.0.3 | https://github.com/Sebmaster/tr46.js |
| tr46 | 1.0.1 | https://github.com/Sebmaster/tr46.js |
| tr46 | 5.1.1 | https://github.com/jsdom/tr46 |
| tree-kill | 1.2.2 | https://github.com/pkrumins/node-tree-kill |
| trim-lines | 3.0.1 | https://github.com/wooorm/trim-lines |
| trough | 2.1.0 | https://github.com/wooorm/trough |
| type-is | 1.6.18 | https://github.com/jshttp/type-is |
| uid-safe | 2.1.5 | https://github.com/crypto-utils/uid-safe |
| undici | 7.30.1 | https://github.com/nodejs/undici |
| undici-types | 5.26.5 | https://github.com/nodejs/undici |
| undici-types | 6.21.0 | https://github.com/nodejs/undici |
| undici-types | 7.16.0 | https://github.com/nodejs/undici |
| unified | 11.0.5 | https://github.com/unifiedjs/unified |
| unist-util-is | 6.0.0 | https://github.com/syntax-tree/unist-util-is |
| unist-util-position | 5.0.0 | https://github.com/syntax-tree/unist-util-position |
| unist-util-stringify-position | 4.0.0 | https://github.com/syntax-tree/unist-util-stringify-position |
| unist-util-visit | 5.0.0 | https://github.com/syntax-tree/unist-util-visit |
| unist-util-visit-parents | 6.0.1 | https://github.com/syntax-tree/unist-util-visit-parents |
| universalify | 0.1.2 | https://github.com/RyanZim/universalify |
| universalify | 2.0.0 | https://github.com/RyanZim/universalify |
| unpipe | 1.0.0 | https://github.com/stream-utils/unpipe |
| uplot | 1.6.32 | https://github.com/leeoniya/uPlot |
| uplot-react | 1.2.2 | https://github.com/skalinichev/uplot-wrappers |
| url-join | 4.0.1 | https://github.com/jfromaniello/url-join |
| use-callback-ref | 1.3.3 | https://github.com/theKashey/use-callback-ref |
| use-sidecar | 1.1.3 | https://github.com/theKashey/use-sidecar |
| use-sync-external-store | 1.6.0 | https://github.com/facebook/react |
| utils-merge | 1.0.1 | https://github.com/jaredhanson/utils-merge |
| uuid | 8.3.2 | https://github.com/uuidjs/uuid |
| vary | 1.1.2 | https://github.com/jshttp/vary |
| vfile | 6.0.3 | https://github.com/vfile/vfile |
| vfile-message | 4.0.3 | https://github.com/vfile/vfile-message |
| w3c-keyname | 2.2.8 | https://github.com/marijnh/w3c-keyname |
| whatwg-url | 14.2.0 | https://github.com/jsdom/whatwg-url |
| whatwg-url | 5.0.0 | https://github.com/jsdom/whatwg-url |
| whatwg-url | 7.1.0 | https://github.com/jsdom/whatwg-url |
| wordwrap | 1.0.0 | https://github.com/substack/node-wordwrap |
| wrap-ansi | 6.2.0 | https://github.com/chalk/wrap-ansi |
| wrap-ansi | 7.0.0 | https://github.com/chalk/wrap-ansi |
| wrap-ansi | 8.1.0 | https://github.com/chalk/wrap-ansi |
| wrap-ansi | 9.0.2 | https://github.com/chalk/wrap-ansi |
| xtend | 4.0.2 | https://github.com/Raynos/xtend |
| yargs | 15.4.1 | https://github.com/yargs/yargs |
| yargs | 17.7.2 | https://github.com/yargs/yargs |
| zod | 3.25.76 | https://github.com/colinhacks/zod |
| zod | 4.1.13 | https://github.com/colinhacks/zod |
| zod | 4.3.6 | https://github.com/colinhacks/zod |
| zod | 4.4.3 | https://github.com/colinhacks/zod |
| zod-express-middleware | 1.4.0 | https://github.com/Aquila169/zod-express-middleware |
| zustand | 4.5.7 | https://github.com/pmndrs/zustand |
| zwitch | 2.0.4 | https://github.com/wooorm/zwitch |

#### MIT AND ISC

| Package | Version | Repository |
| --- | --- | --- |
| victory-vendor | 37.3.6 | https://github.com/FormidableLabs/victory |

#### MIT*

| Package | Version | Repository |
| --- | --- | --- |
| pause | 0.0.1 |  |

#### Python-2.0

| Package | Version | Repository |
| --- | --- | --- |
| argparse | 2.0.1 | https://github.com/nodeca/argparse |

#### UNKNOWN

| Package | Version | Repository |
| --- | --- | --- |
| @h6s/calendar | 2.2.0 | https://github.com/toss/h6s |

#### Unlicense

| Package | Version | Repository |
| --- | --- | --- |
| big-integer | 1.6.52 | https://github.com/peterolson/BigInteger.js |

## Go

| Module | Version | License | License URL | Source |
| --- | --- | --- | --- | --- |
| cloud.google.com/go/auth | v0.20.0 | Apache-2.0 | https://github.com/googleapis/google-cloud-go/blob/auth/v0.20.0/auth/LICENSE | collector builder manifest (OTel 0.155.0) |
| cloud.google.com/go/auth/oauth2adapt | v0.2.8 | Apache-2.0 | https://github.com/googleapis/google-cloud-go/blob/auth/oauth2adapt/v0.2.8/auth/oauth2adapt/LICENSE | collector builder manifest (OTel 0.155.0) |
| cloud.google.com/go/compute/apiv1 |  | Apache-2.0 | https://github.com/googleapis/google-cloud-go/blob/compute/v1.60.0/compute/apiv1/license_codes_client.go | collector builder manifest (OTel 0.155.0) |
| cloud.google.com/go/compute/internal |  | Apache-2.0 | https://github.com/googleapis/google-cloud-go/blob/compute/v1.60.0/compute/LICENSE | collector builder manifest (OTel 0.155.0) |
| cloud.google.com/go/compute/metadata | v0.9.0 | Apache-2.0 | https://github.com/googleapis/google-cloud-go/blob/compute/metadata/v0.9.0/compute/metadata/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/alecthomas/participle/v2 | v2.1.4 | MIT | https://github.com/alecthomas/participle/blob/v2.1.4/COPYING | collector builder manifest (OTel 0.155.0) |
| github.com/alecthomas/units | v0.0.0-20240927000941-0f3dac36c52b | MIT | https://github.com/alecthomas/units/blob/0f3dac36c52b/COPYING | collector builder manifest (OTel 0.155.0) |
| github.com/antchfx/xmlquery | v1.5.1 | MIT | https://github.com/antchfx/xmlquery/blob/v1.5.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/antchfx/xpath | v1.3.6 | MIT | https://github.com/antchfx/xpath/blob/v1.3.6/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/armon/go-metrics | v0.4.1 | MIT | https://github.com/armon/go-metrics/blob/v0.4.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go | v1.55.8 | Apache-2.0 | https://github.com/aws/aws-sdk-go/blob/v1.55.8/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2 | v1.42.0 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/v1.42.0/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/config | v1.32.25 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/config/v1.32.25/config/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/credentials | v1.19.24 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/credentials/v1.19.24/credentials/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/feature/ec2/imds | v1.18.29 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/feature/ec2/imds/v1.18.29/feature/ec2/imds/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/internal/configsources | v1.4.29 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/internal/configsources/v1.4.29/internal/configsources/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 | v2.7.29 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/internal/endpoints/v2.7.29/internal/endpoints/v2/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/internal/sync/singleflight |  | BSD-3-Clause | https://github.com/aws/aws-sdk-go-v2/blob/v1.42.0/internal/sync/singleflight/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/internal/v4a | v1.4.30 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/internal/v4a/v1.4.30/internal/v4a/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/ec2 | v1.308.0 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/ec2/v1.308.0/service/ec2/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/ecs | v1.81.0 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/ecs/v1.81.0/service/ecs/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/elasticache | v1.52.2 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/elasticache/v1.52.2/service/elasticache/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding | v1.13.12 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/internal/accept-encoding/v1.13.12/service/internal/accept-encoding/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/internal/presigned-url | v1.13.29 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/internal/presigned-url/v1.13.29/service/internal/presigned-url/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/kafka | v1.52.0 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/kafka/v1.52.0/service/kafka/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/lightsail | v1.54.0 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/lightsail/v1.54.0/service/lightsail/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/rds | v1.118.2 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/rds/v1.118.2/service/rds/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/signin | v1.2.0 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/signin/v1.2.0/service/signin/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/sso | v1.31.3 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/sso/v1.31.3/service/sso/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/ssooidc | v1.36.6 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/ssooidc/v1.36.6/service/ssooidc/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go-v2/service/sts | v1.43.3 | Apache-2.0 | https://github.com/aws/aws-sdk-go-v2/blob/service/sts/v1.43.3/service/sts/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/aws/aws-sdk-go/internal/sync/singleflight |  | BSD-3-Clause | https://github.com/aws/aws-sdk-go/blob/v1.55.8/internal/sync/singleflight/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/aws/smithy-go | v1.27.1 | Apache-2.0 | https://github.com/aws/smithy-go/blob/v1.27.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/aws/smithy-go/internal/sync/singleflight |  | BSD-3-Clause | https://github.com/aws/smithy-go/blob/v1.27.1/internal/sync/singleflight/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/Azure/azure-sdk-for-go/sdk/azcore | v1.21.1 | MIT | https://github.com/Azure/azure-sdk-for-go/blob/sdk/azcore/v1.21.1/sdk/azcore/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/Azure/azure-sdk-for-go/sdk/azidentity | v1.13.1 | MIT | https://github.com/Azure/azure-sdk-for-go/blob/sdk/azidentity/v1.13.1/sdk/azidentity/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/Azure/azure-sdk-for-go/sdk/internal | v1.12.0 | MIT | https://github.com/Azure/azure-sdk-for-go/blob/sdk/internal/v1.12.0/sdk/internal/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/compute/armcompute/v5 | v5.7.0 | MIT | https://github.com/Azure/azure-sdk-for-go/blob/sdk/resourcemanager/compute/armcompute/v5.7.0/sdk/resourcemanager/compute/armcompute/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/network/armnetwork/v4 | v4.3.0 | MIT | https://github.com/Azure/azure-sdk-for-go/blob/sdk/resourcemanager/network/armnetwork/v4.3.0/sdk/resourcemanager/network/armnetwork/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/AzureAD/microsoft-authentication-library-for-go/apps |  | MIT | https://github.com/AzureAD/microsoft-authentication-library-for-go/blob/v1.6.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/bahlo/generic-list-go | v0.2.0 | BSD-3-Clause | https://github.com/bahlo/generic-list-go/blob/v0.2.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/bboreham/go-loser | v0.0.0-20230920113527-fcc2c21820a3 | Apache-2.0 | https://github.com/bboreham/go-loser/blob/fcc2c21820a3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/beorn7/perks/quantile |  | MIT | https://github.com/beorn7/perks/blob/v1.0.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/bmatcuk/doublestar/v4 | v4.10.0 | MIT | https://github.com/bmatcuk/doublestar/blob/v4.10.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/buger/jsonparser | v1.1.2 | MIT | https://github.com/buger/jsonparser/blob/v1.1.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/cenkalti/backoff/v4 | v4.3.0 | MIT | https://github.com/cenkalti/backoff/blob/v4.3.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/cenkalti/backoff/v5 | v5.0.3 | MIT | https://github.com/cenkalti/backoff/blob/v5.0.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/cenkalti/backoff/v6 | v6.0.0 | MIT | https://github.com/cenkalti/backoff/blob/v6.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/cespare/xxhash/v2 | v2.3.0 | MIT | https://github.com/cespare/xxhash/blob/v2.3.0/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/cncf/xds/go | v0.0.0-20260202195803-dba9d589def2 | Apache-2.0 | https://github.com/cncf/xds/blob/dba9d589def2/go/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/Code-Hex/go-generics-cache | v1.5.1 | MIT | https://github.com/Code-Hex/go-generics-cache/blob/v1.5.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/containerd/errdefs | v1.0.0 | Apache-2.0 | https://github.com/containerd/errdefs/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/containerd/errdefs/pkg | v0.3.0 | Apache-2.0 | https://github.com/containerd/errdefs/blob/pkg/v0.3.0/pkg/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/coreos/go-oidc/v3/oidc |  | Apache-2.0 | https://github.com/coreos/go-oidc/blob/v3.19.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/coreos/go-systemd/v22/activation |  | Apache-2.0 | https://github.com/coreos/go-systemd/blob/v22.7.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/agent-payload/v5/gogen |  | BSD-3-Clause | https://github.com/DataDog/agent-payload/blob/v5.0.202/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/comp/core/tagger/origindetection | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/comp/core/tagger/origindetection/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/obfuscate | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/obfuscate/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/opentelemetry-mapping-go/otlp/attributes | v0.81.0-devel.0.20260515214905-7c02565fb890 | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/7c02565fb890/pkg/opentelemetry-mapping-go/otlp/attributes/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/opentelemetry-mapping-go/otlp/metrics | v0.81.0-devel.0.20260515214905-7c02565fb890 | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/7c02565fb890/pkg/opentelemetry-mapping-go/otlp/metrics/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/proto/pbgo/trace |  | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/proto/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/remoteconfig/state | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/remoteconfig/state/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/trace | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/trace/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/trace/log | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/trace/log/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/trace/otel/traceutil |  | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/trace/otel/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/trace/stats | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/trace/stats/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/trace/traceutil | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/trace/traceutil/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/util/hostname/validate | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/util/hostname/validate/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/util/log | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/util/log/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/util/quantile | v0.79.0-devel.0.20260402163801-bfa4eff6c991 | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/bfa4eff6c991/pkg/util/quantile/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/util/scrubber | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/util/scrubber/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-agent/pkg/version | v0.77.0-devel.0.20260213154712-e02b9359151a | Apache-2.0 | https://github.com/DataDog/datadog-agent/blob/e02b9359151a/pkg/version/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-api-client-go/v2 | v2.61.0 | Apache-2.0 | https://github.com/DataDog/datadog-api-client-go/blob/v2.61.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/datadog-go/v5/statsd |  | MIT | https://github.com/DataDog/datadog-go/blob/v5.8.3/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/go-sqllexer | v0.1.12 | MIT | https://github.com/DataDog/go-sqllexer/blob/v0.1.12/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/go-tuf | v1.1.1-0.5.2 | BSD-3-Clause | https://github.com/DataDog/go-tuf/blob/v1.1.1-0.5.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/sketches-go/ddsketch |  | Apache-2.0 | https://github.com/DataDog/sketches-go/blob/v1.4.8/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/DataDog/zstd | v1.5.7 | BSD-3-Clause | https://github.com/DataDog/zstd/blob/v1.5.7/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/davecgh/go-spew/spew |  | ISC | https://github.com/davecgh/go-spew/blob/d8f796af33cc/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/dennwc/varint | v1.0.0 | MIT | https://github.com/dennwc/varint/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/digitalocean/go-metadata | v0.0.0-20250129100319-e3650a3df44b | MIT | https://github.com/digitalocean/go-metadata/blob/e3650a3df44b/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/digitalocean/godo | v1.193.0 | MIT | https://github.com/digitalocean/godo/blob/v1.193.0/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/distribution/reference | v0.6.0 | Apache-2.0 | https://github.com/distribution/reference/blob/v0.6.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/docker/go-connections | v0.7.0 | Apache-2.0 | https://github.com/docker/go-connections/blob/v0.7.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/docker/go-units | v0.5.0 | Apache-2.0 | https://github.com/docker/go-units/blob/v0.5.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/dustin/go-humanize | v1.0.1 | MIT | https://github.com/dustin/go-humanize/blob/v1.0.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/ebitengine/purego | v0.10.0 | Apache-2.0 | https://github.com/ebitengine/purego/blob/v0.10.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/edsrzf/mmap-go | v1.2.1-0.20241212181136-fad1cd13edbd | BSD-3-Clause | https://github.com/edsrzf/mmap-go/blob/fad1cd13edbd/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/elastic/go-grok | v0.3.1 | Apache-2.0 | https://github.com/elastic/go-grok/blob/v0.3.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/elastic/lunes | v0.2.2 | Apache-2.0 | https://github.com/elastic/lunes/blob/v0.2.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/emicklei/go-restful/v3 | v3.13.0 | MIT | https://github.com/emicklei/go-restful/blob/v3.13.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/envoyproxy/go-control-plane/envoy | v1.37.0 | Apache-2.0 | https://github.com/envoyproxy/go-control-plane/blob/envoy/v1.37.0/envoy/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/envoyproxy/protoc-gen-validate/validate |  | Apache-2.0 | https://github.com/envoyproxy/protoc-gen-validate/blob/v1.3.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/expr-lang/expr | v1.17.8 | MIT | https://github.com/expr-lang/expr/blob/v1.17.8/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/facette/natsort | v0.0.0-20181210072756-2cd4dd1e2dcb | BSD-3-Clause | https://github.com/facette/natsort/blob/2cd4dd1e2dcb/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/fatih/color | v1.18.0 | MIT | https://github.com/fatih/color/blob/v1.18.0/LICENSE.md | collector builder manifest (OTel 0.155.0) |
| github.com/felixge/fgprof | v0.9.5 | MIT | https://github.com/felixge/fgprof/blob/v0.9.5/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/felixge/httpsnoop | v1.0.4 | MIT | https://github.com/felixge/httpsnoop/blob/v1.0.4/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/foxboron/go-tpm-keyfiles | v0.0.0-20251226215517-609e4778396f | MIT | https://github.com/foxboron/go-tpm-keyfiles/blob/609e4778396f/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/fsnotify/fsnotify | v1.10.1 | BSD-3-Clause | https://github.com/fsnotify/fsnotify/blob/v1.10.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/fxamacker/cbor/v2 | v2.9.1 | MIT | https://github.com/fxamacker/cbor/blob/v2.9.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-jose/go-jose/v4 | v4.1.4 | Apache-2.0 | https://github.com/go-jose/go-jose/blob/v4.1.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-jose/go-jose/v4/json |  | BSD-3-Clause | https://github.com/go-jose/go-jose/blob/v4.1.4/json/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-kit/log | v0.2.1 | MIT | https://github.com/go-kit/log/blob/v0.2.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-logfmt/logfmt | v0.6.0 | MIT | https://github.com/go-logfmt/logfmt/blob/v0.6.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-logr/logr | v1.4.3 | Apache-2.0 | https://github.com/go-logr/logr/blob/v1.4.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-logr/stdr | v1.2.2 | Apache-2.0 | https://github.com/go-logr/stdr/blob/v1.2.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/analysis | v0.25.0 | Apache-2.0 | https://github.com/go-openapi/analysis/blob/v0.25.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/errors | v0.22.7 | Apache-2.0 | https://github.com/go-openapi/errors/blob/v0.22.7/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/jsonpointer | v0.23.1 | Apache-2.0 | https://github.com/go-openapi/jsonpointer/blob/v0.23.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/jsonreference | v0.21.5 | Apache-2.0 | https://github.com/go-openapi/jsonreference/blob/v0.21.5/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/loads | v0.23.3 | Apache-2.0 | https://github.com/go-openapi/loads/blob/v0.23.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/spec | v0.22.4 | Apache-2.0 | https://github.com/go-openapi/spec/blob/v0.22.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/strfmt | v0.26.2 | Apache-2.0 | https://github.com/go-openapi/strfmt/blob/v0.26.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/v0.25.5/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/cmdutils | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/cmdutils/v0.25.5/cmdutils/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/conv | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/conv/v0.25.5/conv/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/fileutils | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/fileutils/v0.25.5/fileutils/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/jsonname | v0.26.0 | Apache-2.0 | https://github.com/go-openapi/swag/blob/jsonname/v0.26.0/jsonname/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/jsonutils | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/jsonutils/v0.25.5/jsonutils/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/loading | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/loading/v0.25.5/loading/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/mangling | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/mangling/v0.25.5/mangling/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/netutils | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/netutils/v0.25.5/netutils/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/stringutils | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/stringutils/v0.25.5/stringutils/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/typeutils | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/typeutils/v0.25.5/typeutils/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/swag/yamlutils | v0.25.5 | Apache-2.0 | https://github.com/go-openapi/swag/blob/yamlutils/v0.25.5/yamlutils/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-openapi/validate | v0.25.2 | Apache-2.0 | https://github.com/go-openapi/validate/blob/v0.25.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-resty/resty/v2 | v2.17.2 | MIT | https://github.com/go-resty/resty/blob/v2.17.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-viper/mapstructure/v2 | v2.5.0 | MIT | https://github.com/go-viper/mapstructure/blob/v2.5.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/go-zookeeper/zk | v1.0.4 | BSD-3-Clause | https://github.com/go-zookeeper/zk/blob/v1.0.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/gobwas/glob | v0.2.3 | MIT | https://github.com/gobwas/glob/blob/v0.2.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/goccy/go-json | v0.10.6 | MIT | https://github.com/goccy/go-json/blob/v0.10.6/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/goccy/go-yaml | v1.19.2 | MIT | https://github.com/goccy/go-yaml/blob/v1.19.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/gogo/protobuf | v1.3.2 | BSD-3-Clause | https://github.com/gogo/protobuf/blob/v1.3.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/golang-jwt/jwt/v5 | v5.3.1 | MIT | https://github.com/golang-jwt/jwt/blob/v5.3.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/golang/groupcache/lru |  | Apache-2.0 | https://github.com/golang/groupcache/blob/2c02b8208cf8/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/golang/snappy | v1.0.0 | BSD-3-Clause | https://github.com/golang/snappy/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/google/gnostic-models | v0.7.1 | Apache-2.0 | https://github.com/google/gnostic-models/blob/v0.7.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/google/go-cmp/cmp |  | BSD-3-Clause | https://github.com/google/go-cmp/blob/v0.7.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/google/go-querystring/query |  | BSD-3-Clause | https://github.com/google/go-querystring/blob/v1.2.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/google/go-tpm | v0.9.8 | Apache-2.0 | https://github.com/google/go-tpm/blob/v0.9.8/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/google/pprof/profile |  | Apache-2.0 | https://github.com/google/pprof/blob/92041b743c96/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/google/s2a-go | v0.1.9 | Apache-2.0 | https://github.com/google/s2a-go/blob/v0.1.9/LICENSE.md | collector builder manifest (OTel 0.155.0) |
| github.com/google/uuid | v1.6.0 | BSD-3-Clause | https://github.com/google/uuid/blob/v1.6.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/googleapis/enterprise-certificate-proxy/client |  | Apache-2.0 | https://github.com/googleapis/enterprise-certificate-proxy/blob/v0.3.15/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/googleapis/gax-go/v2 | v2.22.0 | BSD-3-Clause | https://github.com/googleapis/gax-go/blob/v2.22.0/v2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/GoogleCloudPlatform/opentelemetry-operations-go/detectors/gcp | v1.33.0 | Apache-2.0 | https://github.com/GoogleCloudPlatform/opentelemetry-operations-go/blob/detectors/gcp/v1.33.0/detectors/gcp/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/gophercloud/gophercloud/v2 | v2.12.0 | Apache-2.0 | https://github.com/gophercloud/gophercloud/blob/v2.12.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/gorilla/websocket | v1.5.4-0.20250319132907-e064f32e3674 | BSD-2-Clause | https://github.com/gorilla/websocket/blob/e064f32e3674/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/grafana/clusterurl/pkg |  | Apache-2.0 | https://github.com/grafana/clusterurl/blob/v0.2.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/grafana/regexp | v0.0.0-20250905093917-f7b3be9d1853 | BSD-3-Clause | https://github.com/grafana/regexp/blob/f7b3be9d1853/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/grpc-ecosystem/grpc-gateway/v2 | v2.29.0 | BSD-3-Clause | https://github.com/grpc-ecosystem/grpc-gateway/blob/v2.29.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/consul/api | v1.32.1 | MPL-2.0 | https://github.com/hashicorp/consul/blob/api/v1.32.1/api/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/cronexpr | v1.1.3 | Apache-2.0 | https://github.com/hashicorp/cronexpr/blob/v1.1.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/errwrap | v1.1.0 | MPL-2.0 | https://github.com/hashicorp/errwrap/blob/v1.1.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/go-cleanhttp | v0.5.2 | MPL-2.0 | https://github.com/hashicorp/go-cleanhttp/blob/v0.5.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/go-hclog | v1.6.3 | MIT | https://github.com/hashicorp/go-hclog/blob/v1.6.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/go-immutable-radix | v1.3.1 | MPL-2.0 | https://github.com/hashicorp/go-immutable-radix/blob/v1.3.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/go-multierror | v1.1.1 | MPL-2.0 | https://github.com/hashicorp/go-multierror/blob/v1.1.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/go-retryablehttp | v0.7.8 | MPL-2.0 | https://github.com/hashicorp/go-retryablehttp/blob/v0.7.8/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/go-rootcerts | v1.0.2 | MPL-2.0 | https://github.com/hashicorp/go-rootcerts/blob/v1.0.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/go-version | v1.9.0 | MPL-2.0 | https://github.com/hashicorp/go-version/blob/v1.9.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/golang-lru | v1.0.2 | MPL-2.0 | https://github.com/hashicorp/golang-lru/blob/v1.0.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/golang-lru/simplelru |  | MPL-2.0 | https://github.com/hashicorp/golang-lru/blob/v1.0.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/golang-lru/v2 | v2.0.7 | MPL-2.0 | https://github.com/hashicorp/golang-lru/blob/v2.0.7/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/golang-lru/v2/internal |  | MPL-2.0 | https://github.com/hashicorp/golang-lru/blob/v2.0.7/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/golang-lru/v2/simplelru |  | BSD-3-Clause | https://github.com/hashicorp/golang-lru/blob/v2.0.7/simplelru/LICENSE_list | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/nomad/api | v0.0.0-20260528135333-5b027732945f | MPL-2.0 | https://github.com/hashicorp/nomad/blob/5b027732945f/api/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hashicorp/serf/coordinate |  | MPL-2.0 | https://github.com/hashicorp/serf/blob/v0.10.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/hetznercloud/hcloud-go/v2/hcloud |  | MIT | https://github.com/hetznercloud/hcloud-go/blob/v2.44.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/iancoleman/strcase | v0.3.0 | MIT | https://github.com/iancoleman/strcase/blob/v0.3.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/ionos-cloud/sdk-go/v6 | v6.3.7 | Apache-2.0 | https://github.com/ionos-cloud/sdk-go/blob/v6.3.7/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/jmespath/go-jmespath | v0.4.0 | Apache-2.0 | https://github.com/jmespath/go-jmespath/blob/v0.4.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/jonboulle/clockwork | v0.5.0 | Apache-2.0 | https://github.com/jonboulle/clockwork/blob/v0.5.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/jpillora/backoff | v1.0.0 | MIT | https://github.com/jpillora/backoff/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/json-iterator/go | v1.1.12 | MIT | https://github.com/json-iterator/go/blob/v1.1.12/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/julienschmidt/httprouter | v1.3.0 | BSD-3-Clause | https://github.com/julienschmidt/httprouter/blob/v1.3.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/klauspost/compress | v1.18.6 | Apache-2.0 | https://github.com/klauspost/compress/blob/v1.18.6/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/klauspost/compress/internal/snapref |  | BSD-3-Clause | https://github.com/klauspost/compress/blob/v1.18.6/internal/snapref/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/klauspost/compress/s2 |  | BSD-3-Clause | https://github.com/klauspost/compress/blob/v1.18.6/s2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/klauspost/compress/snappy |  | BSD-3-Clause | https://github.com/klauspost/compress/blob/v1.18.6/snappy/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/klauspost/compress/zstd/internal/xxhash |  | MIT | https://github.com/klauspost/compress/blob/v1.18.6/zstd/internal/xxhash/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/knadh/koanf/maps | v0.1.2 | MIT | https://github.com/knadh/koanf/blob/maps/v0.1.2/maps/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/knadh/koanf/providers/confmap | v1.0.0 | MIT | https://github.com/knadh/koanf/blob/providers/confmap/v1.0.0/providers/confmap/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/knadh/koanf/v2 | v2.3.5 | MIT | https://github.com/knadh/koanf/blob/v2.3.5/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/kolo/xmlrpc | v0.0.0-20220921171641-a4b6fa1dd06b | MIT | https://github.com/kolo/xmlrpc/blob/a4b6fa1dd06b/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/kylelemons/godebug | v1.1.0 | Apache-2.0 | https://github.com/kylelemons/godebug/blob/v1.1.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/leodido/go-syslog/v4 | v4.5.0 | MIT | https://github.com/leodido/go-syslog/blob/v4.5.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/leodido/ragel-machinery | v0.0.0-20190525184631-5f46317e436b | MIT | https://github.com/leodido/ragel-machinery/blob/5f46317e436b/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/lightstep/go-expohisto | v1.0.0 | Apache-2.0 | https://github.com/lightstep/go-expohisto/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/linode/go-metadata | v0.2.4 | Apache-2.0 | https://github.com/linode/go-metadata/blob/v0.2.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/linode/linodego | v1.69.1 | MIT | https://github.com/linode/linodego/blob/v1.69.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/Masterminds/semver/v3 | v3.5.0 | MIT | https://github.com/Masterminds/semver/blob/v3.5.0/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/mattn/go-colorable | v0.1.14 | MIT | https://github.com/mattn/go-colorable/blob/v0.1.14/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/mattn/go-isatty | v0.0.20 | MIT | https://github.com/mattn/go-isatty/blob/v0.0.20/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/mdlayher/vsock | v1.2.1 | MIT | https://github.com/mdlayher/vsock/blob/v1.2.1/LICENSE.md | collector builder manifest (OTel 0.155.0) |
| github.com/michel-laterman/proxy-connect-dialer-go | v0.1.0 | Apache-2.0 | https://github.com/michel-laterman/proxy-connect-dialer-go/blob/v0.1.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/miekg/dns | v1.1.72 | BSD-3-Clause | https://github.com/miekg/dns/blob/v1.1.72/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/mitchellh/copystructure | v1.2.0 | MIT | https://github.com/mitchellh/copystructure/blob/v1.2.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/mitchellh/go-homedir | v1.1.0 | MIT | https://github.com/mitchellh/go-homedir/blob/v1.1.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/mitchellh/mapstructure | v1.5.1-0.20231216201459-8508981c8b6c | MIT | https://github.com/mitchellh/mapstructure/blob/8508981c8b6c/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/mitchellh/reflectwalk | v1.0.2 | MIT | https://github.com/mitchellh/reflectwalk/blob/v1.0.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/moby/docker-image-spec/specs-go/v1 |  | Apache-2.0 | https://github.com/moby/docker-image-spec/blob/v1.3.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/moby/moby/api/types |  | Apache-2.0 | https://github.com/moby/moby/blob/api/v1.55.0/api/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/moby/moby/client | v0.5.0 | Apache-2.0 | https://github.com/moby/moby/blob/client/v0.5.0/client/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/modern-go/concurrent | v0.0.0-20180306012644-bacd9c7ef1dd | Apache-2.0 | https://github.com/modern-go/concurrent/blob/bacd9c7ef1dd/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/modern-go/reflect2 | v1.0.3-0.20250322232337-35a7c28c31ee | Apache-2.0 | https://github.com/modern-go/reflect2/blob/35a7c28c31ee/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/munnerz/goautoneg | v0.0.0-20191010083416-a7dc8b61c822 | BSD-3-Clause | https://github.com/munnerz/goautoneg/blob/a7dc8b61c822/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/mwitkow/go-conntrack | v0.0.0-20190716064945-2f068394615f | Apache-2.0 | https://github.com/mwitkow/go-conntrack/blob/2f068394615f/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/oklog/ulid/v2 | v2.1.1 | Apache-2.0 | https://github.com/oklog/ulid/blob/v2.1.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opamp-go | v0.23.0 | Apache-2.0 | https://github.com/open-telemetry/opamp-go/blob/v0.23.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/connector/routingconnector | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/connector/routingconnector/v0.155.0/connector/routingconnector/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/connector/spanmetricsconnector | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/connector/spanmetricsconnector/v0.155.0/connector/spanmetricsconnector/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/bearertokenauthextension | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/bearertokenauthextension/v0.155.0/extension/bearertokenauthextension/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/healthcheckextension | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/healthcheckextension/v0.155.0/extension/healthcheckextension/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/internal/credentialsfile | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/internal/credentialsfile/v0.155.0/extension/internal/credentialsfile/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/k8sleaderelector | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/k8sleaderelector/v0.155.0/extension/k8sleaderelector/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/oidcauthextension | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/oidcauthextension/v0.155.0/extension/oidcauthextension/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/opampcustommessages | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/opampcustommessages/v0.155.0/extension/opampcustommessages/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/opampextension | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/opampextension/v0.155.0/extension/opampextension/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/pprofextension | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/pprofextension/v0.155.0/extension/pprofextension/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/extension/storage/filestorage | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/extension/storage/filestorage/v0.155.0/extension/storage/filestorage/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/aws/ecsutil | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/aws/ecsutil/v0.155.0/internal/aws/ecsutil/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/common | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/common/v0.155.0/internal/common/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/common/docker |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/common/v0.155.0/internal/common/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/common/sanitize |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/common/v0.155.0/internal/common/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/common/testutil |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/common/v0.155.0/internal/common/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/coreinternal | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/coreinternal/v0.155.0/internal/coreinternal/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/coreinternal/aggregateutil |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/coreinternal/v0.155.0/internal/coreinternal/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/coreinternal/clientutil |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/coreinternal/v0.155.0/internal/coreinternal/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/coreinternal/errorutil |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/coreinternal/v0.155.0/internal/coreinternal/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/coreinternal/timeutils/internal/ctimefmt |  | MIT | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/coreinternal/v0.155.0/internal/coreinternal/timeutils/internal/ctimefmt/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/coreinternal/traceutil |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/coreinternal/v0.155.0/internal/coreinternal/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/datadog | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/datadog/v0.155.0/internal/datadog/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/docker | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/docker/v0.155.0/internal/docker/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/exp/metrics/identity |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/exp/metrics/v0.155.0/internal/exp/metrics/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/filter | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/filter/v0.155.0/internal/filter/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/filter/filterset |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/filter/v0.155.0/internal/filter/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/gopsutilenv | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/gopsutilenv/v0.155.0/internal/gopsutilenv/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/healthcheck | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/healthcheck/v0.155.0/internal/healthcheck/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/k8sconfig | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/k8sconfig/v0.155.0/internal/k8sconfig/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/kubelet | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/kubelet/v0.155.0/internal/kubelet/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/metadataproviders | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/metadataproviders/v0.155.0/internal/metadataproviders/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/pdatautil | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/pdatautil/v0.155.0/internal/pdatautil/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/internal/sharedcomponent | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/internal/sharedcomponent/v0.155.0/internal/sharedcomponent/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/pkg/datadog/config |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/pkg/datadog/v0.155.0/pkg/datadog/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/pkg/experimentalmetricmetadata | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/pkg/experimentalmetricmetadata/v0.155.0/pkg/experimentalmetricmetadata/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/pkg/ottl | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/pkg/ottl/v0.155.0/pkg/ottl/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/pkg/pdatautil | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/pkg/pdatautil/v0.155.0/pkg/pdatautil/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/pkg/sampling | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/pkg/sampling/v0.155.0/pkg/sampling/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/pkg/stanza/v0.155.0/pkg/stanza/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/pkg/status | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/pkg/status/v0.155.0/pkg/status/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/pkg/translator/prometheus | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/pkg/translator/prometheus/v0.155.0/pkg/translator/prometheus/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/attributesprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/attributesprocessor/v0.155.0/processor/attributesprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/cumulativetodeltaprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/cumulativetodeltaprocessor/v0.155.0/processor/cumulativetodeltaprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/deltatocumulativeprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/deltatocumulativeprocessor/v0.155.0/processor/deltatocumulativeprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/filterprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/filterprocessor/v0.155.0/processor/filterprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/groupbyattrsprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/groupbyattrsprocessor/v0.155.0/processor/groupbyattrsprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/k8sattributesprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/k8sattributesprocessor/v0.155.0/processor/k8sattributesprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/logdedupprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/logdedupprocessor/v0.155.0/processor/logdedupprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/metricstransformprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/metricstransformprocessor/v0.155.0/processor/metricstransformprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/probabilisticsamplerprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/probabilisticsamplerprocessor/v0.155.0/processor/probabilisticsamplerprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/redactionprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/redactionprocessor/v0.155.0/processor/redactionprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/resourcedetectionprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/resourcedetectionprocessor/v0.155.0/processor/resourcedetectionprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/resourceprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/resourceprocessor/v0.155.0/processor/resourceprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/spanprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/spanprocessor/v0.155.0/processor/spanprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/tailsamplingprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/tailsamplingprocessor/v0.155.0/processor/tailsamplingprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/processor/transformprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/processor/transformprocessor/v0.155.0/processor/transformprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/datadogreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/datadogreceiver/v0.155.0/receiver/datadogreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/dockerstatsreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/dockerstatsreceiver/v0.155.0/receiver/dockerstatsreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/filelogreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/filelogreceiver/v0.155.0/receiver/filelogreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/fluentforwardreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/fluentforwardreceiver/v0.155.0/receiver/fluentforwardreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/hostmetricsreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/hostmetricsreceiver/v0.155.0/receiver/hostmetricsreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/k8sclusterreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/k8sclusterreceiver/v0.155.0/receiver/k8sclusterreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/kubeletstatsreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/kubeletstatsreceiver/v0.155.0/receiver/kubeletstatsreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/prometheusreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/prometheusreceiver/v0.155.0/receiver/prometheusreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/open-telemetry/opentelemetry-collector-contrib/receiver/statsdreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/receiver/statsdreceiver/v0.155.0/receiver/statsdreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/opencontainers/go-digest | v1.0.0 | Apache-2.0 | https://github.com/opencontainers/go-digest/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/opencontainers/image-spec/specs-go |  | Apache-2.0 | https://github.com/opencontainers/image-spec/blob/v1.1.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/openshift/api/quota/v1 |  | Apache-2.0 | https://github.com/openshift/api/blob/264e80a2b6e7/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/openshift/client-go/quota |  | Apache-2.0 | https://github.com/openshift/client-go/blob/db0dee36e235/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/outcaste-io/ristretto | v0.2.3 | Apache-2.0 | https://github.com/outcaste-io/ristretto/blob/v0.2.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/outcaste-io/ristretto/z |  | MIT | https://github.com/outcaste-io/ristretto/blob/v0.2.3/z/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/outscale/osc-sdk-go/v2 | v2.34.0 | BSD-3-Clause | https://github.com/outscale/osc-sdk-go/blob/v2.34.0/v2/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| github.com/ovh/go-ovh/ovh |  | BSD-3-Clause | https://github.com/ovh/go-ovh/blob/v1.9.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/patrickmn/go-cache | v2.1.0+incompatible | MIT | https://github.com/patrickmn/go-cache/blob/v2.1.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/pb33f/jsonpath/pkg/jsonpath |  | Apache-2.0 | https://github.com/pb33f/jsonpath/blob/v0.8.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/pb33f/libopenapi | v0.37.2 | MIT | https://github.com/pb33f/libopenapi/blob/v0.37.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/pb33f/ordered-map/v2 | v2.3.1 | Apache-2.0 | https://github.com/pb33f/ordered-map/blob/v2.3.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/philhofer/fwd | v1.2.0 | MIT | https://github.com/philhofer/fwd/blob/v1.2.0/LICENSE.md | collector builder manifest (OTel 0.155.0) |
| github.com/pierrec/lz4/v4 | v4.1.27 | BSD-3-Clause | https://github.com/pierrec/lz4/blob/v4.1.27/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/pkg/browser | v0.0.0-20240102092130-5ac0b6a4141c | BSD-2-Clause | https://github.com/pkg/browser/blob/5ac0b6a4141c/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/pkg/errors | v0.9.1 | BSD-2-Clause | https://github.com/pkg/errors/blob/v0.9.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/planetscale/vtprotobuf/protohelpers |  | BSD-3-Clause | https://github.com/planetscale/vtprotobuf/blob/0393e58bdf10/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/pmezard/go-difflib/difflib |  | BSD-3-Clause | https://github.com/pmezard/go-difflib/blob/5d4384ee4fb2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/alertmanager/api/v2/models |  | Apache-2.0 | https://github.com/prometheus/alertmanager/blob/v0.32.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/client_golang/exp | v0.0.0-20260518105423-c9d5bc4c50a9 | Apache-2.0 | https://github.com/prometheus/client_golang/blob/c9d5bc4c50a9/exp/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/client_golang/internal/github.com/golang/gddo/httputil |  | BSD-3-Clause | https://github.com/prometheus/client_golang/blob/v1.23.2/internal/github.com/golang/gddo/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/client_golang/prometheus |  | Apache-2.0 | https://github.com/prometheus/client_golang/blob/v1.23.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/client_model/go |  | Apache-2.0 | https://github.com/prometheus/client_model/blob/v0.6.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/common | v0.69.0 | Apache-2.0 | https://github.com/prometheus/common/blob/v0.69.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/exporter-toolkit/web |  | Apache-2.0 | https://github.com/prometheus/exporter-toolkit/blob/v0.16.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/otlptranslator | v1.0.0 | Apache-2.0 | https://github.com/prometheus/otlptranslator/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/prometheus | v0.312.0 | Apache-2.0 | https://github.com/prometheus/prometheus/blob/v0.312.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/prometheus/sigv4 | v0.4.1 | Apache-2.0 | https://github.com/prometheus/sigv4/blob/v0.4.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/puzpuzpuz/xsync/v4 | v4.5.0 | Apache-2.0 | https://github.com/puzpuzpuz/xsync/blob/v4.5.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/rs/cors | v1.11.1 | MIT | https://github.com/rs/cors/blob/v1.11.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/scaleway/scaleway-sdk-go | v1.0.0-beta.36 | Apache-2.0 | https://github.com/scaleway/scaleway-sdk-go/blob/v1.0.0-beta.36/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/secure-systems-lab/go-securesystemslib/cjson |  | MIT | https://github.com/secure-systems-lab/go-securesystemslib/blob/v0.9.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/shirou/gopsutil/v4 | v4.26.5 | BSD-3-Clause | https://github.com/shirou/gopsutil/blob/v4.26.5/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/Showmax/go-fqdn | v1.0.0 | Apache-2.0 | https://github.com/Showmax/go-fqdn/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/shurcooL/httpfs | v0.0.0-20230704072500-f1e31cf0ba5c | MIT | https://github.com/shurcooL/httpfs/blob/f1e31cf0ba5c/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/spf13/pflag | v1.0.10 | BSD-3-Clause | https://github.com/spf13/pflag/blob/v1.0.10/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/stackitcloud/stackit-sdk-go/core | v0.26.0 | Apache-2.0 | https://github.com/stackitcloud/stackit-sdk-go/blob/core/v0.26.0/core/LICENSE.md | collector builder manifest (OTel 0.155.0) |
| github.com/stretchr/objx | v0.5.3 | MIT | https://github.com/stretchr/objx/blob/v0.5.3/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/stretchr/testify | v1.11.1 | MIT | https://github.com/stretchr/testify/blob/v1.11.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/tilinna/clock | v1.1.0 | MIT | https://github.com/tilinna/clock/blob/v1.1.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/tinylib/msgp/msgp |  | MIT | https://github.com/tinylib/msgp/blob/v1.6.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/tklauser/go-sysconf | v0.3.16 | BSD-3-Clause | https://github.com/tklauser/go-sysconf/blob/v0.3.16/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/twmb/murmur3 | v1.1.8 | BSD-3-Clause | https://github.com/twmb/murmur3/blob/v1.1.8/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/ua-parser/uap-go/uaparser |  | MIT | https://github.com/ua-parser/uap-go/blob/db9adb27a0b8/uaparser/LICENSE.md | collector builder manifest (OTel 0.155.0) |
| github.com/valyala/fastjson | v1.6.10 | MIT | https://github.com/valyala/fastjson/blob/v1.6.10/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/vultr/govultr/v3 | v3.31.2 | MIT | https://github.com/vultr/govultr/blob/v3.31.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/x448/float16 | v0.8.4 | MIT | https://github.com/x448/float16/blob/v0.8.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| github.com/zeebo/xxh3 | v1.1.0 | BSD-2-Clause | https://github.com/zeebo/xxh3/blob/v1.1.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.etcd.io/bbolt | v1.5.0 | MIT | https://github.com/etcd-io/bbolt/blob/v1.5.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/auto/sdk | v1.2.1 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go-instrumentation/blob/sdk/v1.2.1/sdk/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/client | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/client/v1.61.0/client/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/component | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/component/v1.61.0/component/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/component/componentstatus | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/component/componentstatus/v0.155.0/component/componentstatus/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/component/componenttest | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/component/componenttest/v0.155.0/component/componenttest/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configauth | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configauth/v1.61.0/config/configauth/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configcompression | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configcompression/v1.61.0/config/configcompression/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configgrpc | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configgrpc/v0.155.0/config/configgrpc/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/confighttp | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/confighttp/v0.155.0/config/confighttp/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configmiddleware | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configmiddleware/v1.61.0/config/configmiddleware/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/confignet | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/confignet/v1.61.0/config/confignet/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configopaque | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configopaque/v1.61.0/config/configopaque/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configoptional | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configoptional/v1.61.0/config/configoptional/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configretry | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configretry/v1.61.0/config/configretry/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configtelemetry | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configtelemetry/v0.155.0/config/configtelemetry/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/config/configtls | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/config/configtls/v1.61.0/config/configtls/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/confmap | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/confmap/v1.61.0/confmap/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/confmap/provider/envprovider | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/confmap/provider/envprovider/v1.61.0/confmap/provider/envprovider/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/confmap/provider/fileprovider | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/confmap/provider/fileprovider/v1.61.0/confmap/provider/fileprovider/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/confmap/provider/httpprovider | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/confmap/provider/httpprovider/v1.61.0/confmap/provider/httpprovider/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/confmap/provider/httpsprovider | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/confmap/provider/httpsprovider/v1.61.0/confmap/provider/httpsprovider/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/confmap/provider/yamlprovider | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/confmap/provider/yamlprovider/v1.61.0/confmap/provider/yamlprovider/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/confmap/xconfmap | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/confmap/xconfmap/v0.155.0/confmap/xconfmap/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/connector | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/connector/v0.155.0/connector/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/connector/connectortest | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/connector/connectortest/v0.155.0/connector/connectortest/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/connector/forwardconnector | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/connector/forwardconnector/v0.155.0/connector/forwardconnector/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/connector/xconnector | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/connector/xconnector/v0.155.0/connector/xconnector/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/consumer | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/consumer/v1.61.0/consumer/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/consumer/consumererror | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/consumer/consumererror/v0.155.0/consumer/consumererror/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/consumer/consumererror/xconsumererror | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/consumer/consumererror/xconsumererror/v0.155.0/consumer/consumererror/xconsumererror/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/consumer/consumertest | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/consumer/consumertest/v0.155.0/consumer/consumertest/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/consumer/xconsumer | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/consumer/xconsumer/v0.155.0/consumer/xconsumer/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/v1.61.0/exporter/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter/debugexporter | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/debugexporter/v0.155.0/exporter/debugexporter/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter/exporterhelper | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/exporterhelper/v0.155.0/exporter/exporterhelper/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter/exporterhelper/xexporterhelper | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/exporterhelper/xexporterhelper/v0.155.0/exporter/exporterhelper/xexporterhelper/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter/exportertest | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/exportertest/v0.155.0/exporter/exportertest/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter/nopexporter | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/nopexporter/v0.155.0/exporter/nopexporter/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter/otlpexporter | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/otlpexporter/v0.155.0/exporter/otlpexporter/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter/otlphttpexporter | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/otlphttpexporter/v0.155.0/exporter/otlphttpexporter/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/exporter/xexporter | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/exporter/xexporter/v0.155.0/exporter/xexporter/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/extension | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/extension/v1.61.0/extension/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/extension/extensionauth | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/extension/extensionauth/v1.61.0/extension/extensionauth/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/extension/extensioncapabilities | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/extension/extensioncapabilities/v0.155.0/extension/extensioncapabilities/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/extension/extensionmiddleware | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/extension/extensionmiddleware/v0.155.0/extension/extensionmiddleware/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/extension/extensiontest | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/extension/extensiontest/v0.155.0/extension/extensiontest/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/extension/memorylimiterextension | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/extension/memorylimiterextension/v0.155.0/extension/memorylimiterextension/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/extension/xextension/storage |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/extension/xextension/v0.155.0/extension/xextension/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/extension/zpagesextension | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/extension/zpagesextension/v0.155.0/extension/zpagesextension/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/featuregate | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/featuregate/v1.61.0/featuregate/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/filter | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/filter/v0.155.0/filter/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/internal |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/v0.155.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/internal/componentalias | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/internal/componentalias/v0.155.0/internal/componentalias/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/internal/fanoutconsumer | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/internal/fanoutconsumer/v0.155.0/internal/fanoutconsumer/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/internal/grpccompression |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/v0.155.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/internal/memorylimiter | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/internal/memorylimiter/v0.155.0/internal/memorylimiter/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/internal/sharedcomponent | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/internal/sharedcomponent/v0.155.0/internal/sharedcomponent/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/internal/statusutil |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/v0.155.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/internal/telemetry | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/internal/telemetry/v0.155.0/internal/telemetry/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/pdata | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/pdata/v1.61.0/pdata/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/pdata/pprofile | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/pdata/pprofile/v0.155.0/pdata/pprofile/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/pdata/testdata | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/pdata/testdata/v0.155.0/pdata/testdata/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/pdata/xpdata | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/pdata/xpdata/v0.155.0/pdata/xpdata/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/pdata/xpdata/entity |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/pdata/xpdata/v0.155.0/pdata/xpdata/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/pdata/xpdata/pref |  | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/pdata/xpdata/v0.155.0/pdata/xpdata/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/pipeline | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/pipeline/v1.61.0/pipeline/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/pipeline/xpipeline | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/pipeline/xpipeline/v0.155.0/pipeline/xpipeline/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/processor | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/processor/v1.61.0/processor/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/processor/batchprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/processor/batchprocessor/v0.155.0/processor/batchprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/processor/memorylimiterprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/processor/memorylimiterprocessor/v0.155.0/processor/memorylimiterprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/processor/processorhelper | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/processor/processorhelper/v0.155.0/processor/processorhelper/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/processor/processorhelper/xprocessorhelper | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/processor/processorhelper/xprocessorhelper/v0.155.0/processor/processorhelper/xprocessorhelper/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/processor/processortest | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/processor/processortest/v0.155.0/processor/processortest/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/processor/xprocessor | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/processor/xprocessor/v0.155.0/processor/xprocessor/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/receiver | v1.61.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/receiver/v1.61.0/receiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/receiver/nopreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/receiver/nopreceiver/v0.155.0/receiver/nopreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/receiver/otlpreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/receiver/otlpreceiver/v0.155.0/receiver/otlpreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/receiver/receiverhelper | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/receiver/receiverhelper/v0.155.0/receiver/receiverhelper/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/receiver/receivertest | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/receiver/receivertest/v0.155.0/receiver/receivertest/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/receiver/xreceiver | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/receiver/xreceiver/v0.155.0/receiver/xreceiver/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/scraper | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/scraper/v0.155.0/scraper/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/scraper/scraperhelper | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/scraper/scraperhelper/v0.155.0/scraper/scraperhelper/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/service | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/service/v0.155.0/service/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/collector/service/hostcapabilities | v0.155.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-collector/blob/service/hostcapabilities/v0.155.0/service/hostcapabilities/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc | v0.69.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go-contrib/blob/instrumentation/google.golang.org/grpc/otelgrpc/v0.69.0/instrumentation/google.golang.org/grpc/otelgrpc/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/contrib/instrumentation/net/http/httptrace/otelhttptrace | v0.69.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go-contrib/blob/instrumentation/net/http/httptrace/otelhttptrace/v0.69.0/instrumentation/net/http/httptrace/otelhttptrace/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp | v0.69.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go-contrib/blob/instrumentation/net/http/otelhttp/v0.69.0/instrumentation/net/http/otelhttp/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/contrib/otelconf | v0.24.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go-contrib/blob/otelconf/v0.24.0/otelconf/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/contrib/zpages | v0.69.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go-contrib/blob/zpages/v0.69.0/zpages/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/v1.44.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc | v0.20.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/otlp/otlplog/otlploggrpc/v0.20.0/exporters/otlp/otlplog/otlploggrpc/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp | v0.20.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/otlp/otlplog/otlploghttp/v0.20.0/exporters/otlp/otlplog/otlploghttp/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/otlp/otlpmetric/otlpmetricgrpc/v1.44.0/exporters/otlp/otlpmetric/otlpmetricgrpc/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/otlp/otlpmetric/otlpmetrichttp/v1.44.0/exporters/otlp/otlpmetric/otlpmetrichttp/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/otlp/otlptrace | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/otlp/otlptrace/v1.44.0/exporters/otlp/otlptrace/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/otlp/otlptrace/otlptracegrpc/v1.44.0/exporters/otlp/otlptrace/otlptracegrpc/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/otlp/otlptrace/otlptracehttp/v1.44.0/exporters/otlp/otlptrace/otlptracehttp/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/prometheus | v0.66.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/prometheus/v0.66.0/exporters/prometheus/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/stdout/stdoutlog | v0.20.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/stdout/stdoutlog/v0.20.0/exporters/stdout/stdoutlog/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/stdout/stdoutmetric | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/stdout/stdoutmetric/v1.44.0/exporters/stdout/stdoutmetric/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/exporters/stdout/stdouttrace | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/exporters/stdout/stdouttrace/v1.44.0/exporters/stdout/stdouttrace/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/log | v0.20.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/log/v0.20.0/log/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/metric | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/metric/v1.44.0/metric/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/sdk | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/sdk/v1.44.0/sdk/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/sdk/log | v0.20.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/sdk/log/v0.20.0/sdk/log/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/sdk/metric | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/sdk/metric/v1.44.0/sdk/metric/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/otel/trace | v1.44.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-go/blob/trace/v1.44.0/trace/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.opentelemetry.io/proto/otlp | v1.10.0 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-proto-go/blob/otlp/v1.10.0/otlp/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.uber.org/atomic | v1.11.0 | MIT | https://github.com/uber-go/atomic/blob/v1.11.0/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| go.uber.org/goleak | v1.3.0 | MIT | https://github.com/uber-go/goleak/blob/v1.3.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.uber.org/multierr | v1.11.0 | MIT | https://github.com/uber-go/multierr/blob/v1.11.0/LICENSE.txt | collector builder manifest (OTel 0.155.0) |
| go.uber.org/zap | v1.28.0 | MIT | https://github.com/uber-go/zap/blob/v1.28.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.uber.org/zap/exp/zapslog |  | MIT | https://github.com/uber-go/zap/blob/exp/v0.3.0/exp/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.yaml.in/yaml/v2 | v2.4.4 | Apache-2.0 | https://github.com/yaml/go-yaml/blob/v2.4.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.yaml.in/yaml/v3 | v3.0.4 | MIT | https://github.com/yaml/go-yaml/blob/v3.0.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| go.yaml.in/yaml/v4 | v4.0.0-rc.4 | Apache-2.0 | https://github.com/yaml/go-yaml/blob/v4.0.0-rc.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/crypto | v0.53.0 | BSD-3-Clause | https://cs.opensource.google/go/x/crypto/+/v0.53.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/exp | v0.0.0-20260527015227-08cc5374adb3 | BSD-3-Clause | https://cs.opensource.google/go/x/exp/+/08cc5374:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/exp/constraints |  | BSD-3-Clause | https://cs.opensource.google/go/x/exp/+/08cc5374:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/exp/slices |  | BSD-3-Clause | https://cs.opensource.google/go/x/exp/+/08cc5374:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/net | v0.56.0 | BSD-3-Clause | https://cs.opensource.google/go/x/net/+/v0.56.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/net/html |  | BSD-3-Clause | https://cs.opensource.google/go/x/net/+/v0.56.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/oauth2 | v0.36.0 | BSD-3-Clause | https://cs.opensource.google/go/x/oauth2/+/v0.36.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/sync | v0.21.0 | BSD-3-Clause | https://cs.opensource.google/go/x/sync/+/v0.21.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/sync/errgroup |  | BSD-3-Clause | https://cs.opensource.google/go/x/sync/+/v0.21.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/sys/unix |  | BSD-3-Clause | https://cs.opensource.google/go/x/sys/+/v0.46.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/term | v0.44.0 | BSD-3-Clause | https://cs.opensource.google/go/x/term/+/v0.44.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/text | v0.38.0 | BSD-3-Clause | https://cs.opensource.google/go/x/text/+/v0.38.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| golang.org/x/time/rate |  | BSD-3-Clause | https://cs.opensource.google/go/x/time/+/v0.15.0:LICENSE | collector builder manifest (OTel 0.155.0) |
| gonum.org/v1/gonum | v0.17.0 | BSD-3-Clause | https://github.com/gonum/gonum/blob/v0.17.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/api | v0.278.0 | BSD-3-Clause | https://github.com/googleapis/google-api-go-client/blob/v0.278.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/api/internal/third_party/uritemplates |  | BSD-3-Clause | https://github.com/googleapis/google-api-go-client/blob/v0.278.0/internal/third_party/uritemplates/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/genproto/googleapis/api | v0.0.0-20260526163538-3dc84a4a5aaa | Apache-2.0 | https://github.com/googleapis/go-genproto/blob/3dc84a4a5aaa/googleapis/api/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/genproto/googleapis/api/httpbody |  | Apache-2.0 | https://github.com/googleapis/go-genproto/blob/3dc84a4a5aaa/googleapis/api/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/genproto/googleapis/cloud/extendedops |  | Apache-2.0 | https://github.com/googleapis/go-genproto/blob/d00831a3d3e7/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/genproto/googleapis/rpc | v0.0.0-20260526163538-3dc84a4a5aaa | Apache-2.0 | https://github.com/googleapis/go-genproto/blob/3dc84a4a5aaa/googleapis/rpc/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/genproto/googleapis/rpc/status |  | Apache-2.0 | https://github.com/googleapis/go-genproto/blob/3dc84a4a5aaa/googleapis/rpc/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/grpc | v1.81.1 | Apache-2.0 | https://github.com/grpc/grpc-go/blob/v1.81.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| google.golang.org/protobuf | v1.36.11 | BSD-3-Clause | https://github.com/protocolbuffers/protobuf-go/blob/v1.36.11/LICENSE | collector builder manifest (OTel 0.155.0) |
| gopkg.in/evanphx/json-patch.v4 | v4.13.0 | BSD-3-Clause | https://github.com/evanphx/json-patch/blob/v4.13.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| gopkg.in/inf.v0 | v0.9.1 | BSD-3-Clause | https://github.com/go-inf/inf/blob/v0.9.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| gopkg.in/ini.v1 | v1.67.2 | Apache-2.0 | https://github.com/go-ini/ini/blob/v1.67.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| gopkg.in/yaml.v2 | v2.4.0 | Apache-2.0 | https://github.com/go-yaml/yaml/blob/v2.4.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| gopkg.in/yaml.v3 | v3.0.1 | MIT | https://github.com/go-yaml/yaml/blob/v3.0.1/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/api | v0.35.4 | Apache-2.0 | https://github.com/kubernetes/api/blob/v0.35.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/apimachinery/pkg |  | Apache-2.0 | https://github.com/kubernetes/apimachinery/blob/v0.35.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/apimachinery/third_party/forked/golang |  | BSD-3-Clause | https://github.com/kubernetes/apimachinery/blob/v0.35.4/third_party/forked/golang/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/client-go | v0.35.4 | Apache-2.0 | https://github.com/kubernetes/client-go/blob/v0.35.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/klog/v2 | v2.140.0 | Apache-2.0 | https://github.com/kubernetes/klog/blob/v2.140.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/kube-openapi/pkg |  | Apache-2.0 | https://github.com/kubernetes/kube-openapi/blob/16be699c7b31/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/kube-openapi/pkg/internal/third_party/go-json-experiment/json |  | BSD-3-Clause | https://github.com/kubernetes/kube-openapi/blob/16be699c7b31/pkg/internal/third_party/go-json-experiment/json/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/kube-openapi/pkg/validation/spec |  | Apache-2.0 | https://github.com/kubernetes/kube-openapi/blob/16be699c7b31/pkg/validation/spec/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/kubelet/pkg/apis/stats/v1alpha1 |  | Apache-2.0 | https://github.com/kubernetes/kubelet/blob/v0.35.4/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/utils | v0.0.0-20260319190234-28399d86e0b5 | Apache-2.0 | https://github.com/kubernetes/utils/blob/28399d86e0b5/LICENSE | collector builder manifest (OTel 0.155.0) |
| k8s.io/utils/internal/third_party/forked/golang/net |  | BSD-3-Clause | https://github.com/kubernetes/utils/blob/28399d86e0b5/internal/third_party/forked/golang/LICENSE | collector builder manifest (OTel 0.155.0) |
| sigs.k8s.io/json | v0.0.0-20250730193827-2d320260d730 | Apache-2.0 | https://github.com/kubernetes-sigs/json/blob/2d320260d730/LICENSE | collector builder manifest (OTel 0.155.0) |
| sigs.k8s.io/randfill | v1.0.0 | Apache-2.0 | https://github.com/kubernetes-sigs/randfill/blob/v1.0.0/LICENSE | collector builder manifest (OTel 0.155.0) |
| sigs.k8s.io/structured-merge-diff/v6 | v6.3.2 | Apache-2.0 | https://github.com/kubernetes-sigs/structured-merge-diff/blob/v6.3.2/LICENSE | collector builder manifest (OTel 0.155.0) |
| sigs.k8s.io/yaml | v1.6.0 | Apache-2.0 | https://github.com/kubernetes-sigs/yaml/blob/v1.6.0/LICENSE | collector builder manifest (OTel 0.155.0) |

## Review list

Packages under GPL, AGPL, LGPL, SSPL, EUPL, MPL, CDDL, Elastic License, BUSL, Commons Clause, `UNKNOWN`, or with no detected license. The report does not remove or upgrade these dependencies.

| Ecosystem | Package | Version | License | Dependent workspace / source |
| --- | --- | --- | --- | --- |
| go | github.com/hashicorp/consul/api | v1.32.1 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/errwrap | v1.1.0 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/go-cleanhttp | v0.5.2 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/go-immutable-radix | v1.3.1 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/go-multierror | v1.1.1 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/go-retryablehttp | v0.7.8 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/go-rootcerts | v1.0.2 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/go-version | v1.9.0 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/golang-lru | v1.0.2 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/golang-lru/simplelru | (module) | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/golang-lru/v2 | v2.0.7 | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/golang-lru/v2/internal | (module) | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/nomad/api | v0.0.0-20260528135333-5b027732945f | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| go | github.com/hashicorp/serf/coordinate | (module) | MPL-2.0 | collector builder manifest (OTel 0.155.0) |
| npm | @h6s/calendar | 2.2.0 | UNKNOWN | @couchbase-traces/app |

## Retained ClickHouse packages

These `@clickhouse/*` packages are intentionally kept (UI kit and product telemetry SDKs per `PHASE_10_SPEC` §3).

| Package | Version | License | Reason retained |
| --- | --- | --- | --- |
| @clickhouse/click-ui | 0.12.0 | Apache-2.0 | Shared UI kit (components and color tokens). Replacing it is follow-up work, not part of the data-layer port. |
| @clickhouse/clickstack-node | 1.0.2 | Apache-2.0 | OpenTelemetry distribution for the API server's own telemetry; retained until a Couchbase-branded SDK replaces it. |
| @clickhouse/clickstack-browser | 1.2.1 | Apache-2.0 | OpenTelemetry distribution for the web app's own telemetry; retained until a Couchbase-branded SDK replaces it. |
