# Architecture

## Data flow

1. **OpenTelemetry Collector** receives OTLP (and optional Datadog/Fluent) and
   forwards to the **ingest** service.
2. **Ingest** normalizes signals and writes documents to **Couchbase** (logs,
   traces, metrics, sessions).
3. **API** runs SQL++ on Couchbase for searches, charts, and alerts.
4. **UI** talks to the API; the Couchbase **`cbt_meta`** bucket stores users, teams, dashboards, and
   saved searches.

## Core models (`cbt_meta` bucket)

- `Connection`: Couchbase cluster connection (connstr, credentials, kind).
- `Source`: telemetry source (collection, timestamp expression, fields).
- `Dashboard`, `SavedSearch`, `Alert`: user metadata and query configs.

## Query path

The API builds SQL++ via `packages/common-utils` (chart config renderer,
serializer, Lucene → N1QL). Browser clients never import the Couchbase SDK;
queries go through authenticated API routes.

## Collector configuration

OpAMP serves generated collector config from `buildOtelCollectorConfig` in the
API. Export is always to Couchbase ingest (`otlphttp/couchbase`).