# Couchbase Traces MCP Server

Couchbase Traces exposes a
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that
lets AI assistants query your observability data, manage dashboards, and explore
data sources directly.

## Prerequisites

- A running Couchbase Traces instance (see [CONTRIBUTING.md](/CONTRIBUTING.md) for local
  development setup, or [DEPLOY.md](/DEPLOY.md) for self-hosted deployment)
- A **Personal API access key** — find yours in the Couchbase Traces UI under **Team
  Settings > API keys > Personal API access key**

## Endpoint

The MCP server is available at the `/api/mcp` path on your Couchbase Traces instance. For
local development this is:

```
http://localhost:8080/api/mcp
```

Replace `localhost:8080` with your instance's host and port if you've customized
the defaults.

> **Note:** The examples below use `localhost:8080` (the frontend app). You can
> also reach the MCP server directly at `<backend_url>/mcp`, but not all
> deployments expose the backend, so these docs use frontend paths.

## Connecting an MCP Client

The MCP server uses the **Streamable HTTP** transport with Bearer token
authentication. In the examples below, replace `<your-couchbase-traces-url>` with your
instance URL (e.g. `http://localhost:8080`).

### Install with the CLI (recommended)

This asks for a personal access key or an organization API key with hidden
input, checks it, and adds the server to Claude Code, Codex, Cursor and VS Code.
The key stays out of your shell history and agent chats.

```bash
npx @couchbase-traces/cli mcp install --app-url <your-couchbase-traces-url>
```

### Claude Code

`read -rs` waits for you to paste the key and press Enter, without echoing it,
so the key isn't saved in your shell history:

```bash
read -rs CBT_ACCESS_KEY
claude mcp add --scope user --transport http couchbase-traces <your-couchbase-traces-url>/api/mcp \
  --header "Authorization: Bearer $CBT_ACCESS_KEY"
```

### Codex CLI

The Codex CLI reads the bearer token from an environment variable rather than a
`--header` flag, so the variable must be set wherever Codex runs:

```bash
read -rs CBT_ACCESS_KEY && export CBT_ACCESS_KEY
codex mcp add couchbase-traces --url <your-couchbase-traces-url>/api/mcp \
  --bearer-token-env-var CBT_ACCESS_KEY
```

### OpenCode

Add the following to your [OpenCode config](https://opencode.ai/docs/config):

```json
"mcp": {
  "couchbase-traces": {
    "enabled": true,
    "type": "remote",
    "url": "<your-couchbase-traces-url>/api/mcp",
    "headers": {
      "Authorization": "Bearer <your-personal-access-key>"
    }
  }
}
```

### Cursor

Add the following to `.cursor/mcp.json` in your project (or your global Cursor
settings):

```json
{
  "mcpServers": {
    "couchbase-traces": {
      "url": "<your-couchbase-traces-url>/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-personal-access-key>"
      }
    }
  }
}
```

### MCP Inspector

The MCP Inspector is useful for interactively testing and debugging the server.

```bash
cd packages/api && yarn dev:mcp
```

Then configure the inspector:

1. **Transport Type:** Streamable HTTP
2. **URL:** `<your-couchbase-traces-url>/api/mcp`
3. **Authentication:** Header `Authorization` with value
   `Bearer <your-personal-access-key>`
4. Click **Connect**

### Other Clients

Any MCP client that supports Streamable HTTP transport can connect. Configure it
with:

- **URL:** `<your-couchbase-traces-url>/api/mcp`
- **Header:** `Authorization: Bearer <your-personal-access-key>`

## Available Tools

| Tool                          | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `cbt_list_sources`        | List all data sources and connections as a lightweight catalog (IDs, names, kinds)            |
| `cbt_describe_source`     | Full column schema, attribute keys, sampled low-cardinality values, and a round-trippable `config` block (the exact shape `cbt_save_source` accepts, incl. correlation IDs) for a single source; for metric sources also returns a per-kind metric-name sample |
| `cbt_describe_table`      | Inspect a Couchbase collection that is not a registered source: fields, indexes, and an optional row sample. Without a collection, lists collections in a bucket/scope (paginated) |
| `cbt_save_source`         | Create (omit id) or update (provide id) a data source (log, trace, session, metric, or promql) so shipped telemetry becomes queryable. To clone a source, read its `config` from `cbt_describe_source`, drop `id`, and pass it here |
| `cbt_delete_source`       | Permanently delete a data source by ID                                                        |
| `cbt_list_metrics`        | Paginated catalog of metric names on a metric source with optional kind / namePattern / time-window filters |
| `cbt_describe_metric`     | Per-metric drill-down: kind(s), unit, description, attribute keys per map column, and sampled values |
| `cbt_service_health`      | One-call service health on a trace source: throughput, error rate, p50/p95 and top errors per service, compared with yesterday and ranked worst first |
| `cbt_timeseries`          | Plot metrics over time as a line or stacked bar chart (works on log, trace, and metric sources)        |
| `cbt_table`               | Compute aggregated metrics as a table, single number, or pie chart (works on log, trace, and metric sources) |
| `cbt_search`              | Browse individual log, event, or trace rows                                                  |
| `cbt_event_patterns`      | Discover the most common log messages and event patterns using Drain clustering               |
| `cbt_event_deltas`        | Compare two row groups and rank properties by how their value distributions differ            |
| `cbt_emerging_signals`    | Detect NEW or GONE log/event patterns between a baseline and a current window (two-window Drain novelty diff) |
| `cbt_sql`                 | Execute raw SQL++ for advanced queries; pass `queries` to run up to 10 in parallel |
| `cbt_promql`              | Run a PromQL expression (range or instant) against a PromQL source. Only registered when PromQL is enabled |
| `cbt_get_dashboard`       | List all dashboards or get full detail for a specific dashboard                              |
| `cbt_save_dashboard`      | Create or update a dashboard with tiles (charts, tables, numbers, search, markdown)          |
| `cbt_delete_dashboard`    | Permanently delete a dashboard and its attached alerts                                       |
| `cbt_query_tile`          | Execute the query for a specific dashboard tile to validate results                          |
| `cbt_query_tiles`         | Batch-validate many dashboard tiles in one call, returning a per-tile success/failure summary |
| `cbt_get_saved_search`    | List all saved searches or get full detail for a specific saved search                       |
| `cbt_save_saved_search`   | Create or update a saved search (reusable query against a data source)                       |
| `cbt_get_alert`           | List alerts (summary) or get full detail with evaluation history; filter by state             |
| `cbt_save_alert`          | Create a new alert or update an existing one                                                 |
| `cbt_trace_waterfall`     | Fetch all spans in a single trace as a parent/child waterfall tree with optional correlated logs |
| `cbt_trace_top_time_consuming_operations` | Aggregate breakdown of child operations by cumulative time across matching parent traces |
| `cbt_get_webhook`         | List available webhook destinations for use as alert notification channels                    |
| `cbt_save_webhook`        | Create (omit id) or update (provide id) a webhook notification destination (slack, generic, or incidentio) |
| `cbt_delete_webhook`      | Permanently delete a webhook by ID (blocked while alerts still reference it)                   |

> **Maintainers:** when adding/removing/renaming a query tool, update this table
> and — for builder (non-SQL) tools — the hand-curated `BUILDER_TOOLS_LIST` in
> `packages/api/src/mcp/tools/query/builderCatalog.ts`. It isn't auto-derived, so
> it drifts silently.

### Metric Sources

`cbt_timeseries`, `cbt_table`, and the dashboard builder tile
tools accept metric sources transparently. Each `select` item on a metric
query must set `metricType` (`"gauge"`, `"sum"`, `"histogram"`, or
`"exponential histogram"`) and
`metricName` (the OTel metric name, e.g. `system.cpu.utilization`).
`valueExpression` defaults to `"Value"` when omitted, so a typical metric
series looks like:

```jsonc
{ "aggFn": "avg", "metricType": "gauge", "metricName": "system.cpu.utilization" }
```

Per-kind aggregation guidance:

- **Gauge**: `avg`, `last_value`, `min`, or `max`. Set `"isDelta": true` for
  Prometheus-style delta over each bucket.
- **Sum (counter)**: `"increase"` returns the per-bucket counter increase
  (reset-aware), or `sum` / `avg` on the computed rate. `increase` combined
  with `groupBy` is capped at the top 20 groups by the renderer; the tool
  emits a neutral hint when the cap may apply.
- **Histogram**: `"quantile"` with `level` ∈ {0.5, 0.9, 0.95, 0.99} for
  percentiles, or `"count"` for the total bucket count.
- **Exponential histogram**: `"quantile"` with `level` ∈
  {0.5, 0.9, 0.95, 0.99} for percentiles, or `"count"` for the total bucket
  count.

`summary` metrics are not yet supported by the query renderer.

Discovery workflow for metrics:

1. `cbt_list_sources` to find the metric source ID and its
   `metricTables` map.
2. `cbt_describe_source` to see columns, attribute keys, and a
   per-kind metric-name sample.
3. `cbt_list_metrics` for paginated catalog access with optional
   kind / namePattern / time-window filters; pass `nextCursor` unchanged
   for the next page.
4. `cbt_describe_metric` to drill into a specific metric and
   discover its attribute keys + sampled values before authoring queries.
5. `cbt_timeseries` / `cbt_table` to chart the metric.

### PromQL Sources

PromQL is no longer supported. `cbt_promql`, PromQL sources, tiles, and label
filters are hidden from MCP. Creating or updating a PromQL source, tile, or
Prometheus endpoint is rejected.
