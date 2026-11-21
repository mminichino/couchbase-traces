# Auto-Provisioning Connections and Sources

Couchbase Traces supports automatic provisioning of connections and sources for new
instances. This is useful for:

- Local development environments
- Automated deployments
- CI/CD pipelines
- Docker Compose environments

## How It Works

When a new team is created in Couchbase Traces, it checks for the presence of the
following environment variables:

- `DEFAULT_CONNECTIONS`: A JSON array of connection configurations
- `DEFAULT_SOURCES`: A JSON array of source configurations

If these environment variables are set and the team has no existing connections
or sources, Couchbase Traces will automatically create them for the new team.

## Usage

### Setting Default Connections

To set default connections, provide a JSON array of connection objects as the
`DEFAULT_CONNECTIONS` environment variable. Each connection object should
include:

- `name`: A descriptive name for the connection
- `kind`: `couchbase`. A connection without it is stored as an unsupported
  legacy connection and is never queried.
- `host`: A `couchbase://` or `couchbases://` connection string
- `username`: The Couchbase user that runs queries
- `password`: (Optional) The password for `username`
- `monitorUsername` / `monitorPassword`: (Optional) A separate user for cluster
  status and infrastructure metrics

Example:

```json
[
  {
    "name": "Local Couchbase",
    "kind": "couchbase",
    "host": "couchbase://couchbase",
    "username": "cbt_query",
    "password": "<query user password>"
  }
]
```

### Setting Default Sources

The simplest option is the Couchbase preset: set
`CBT_DEFAULT_SOURCES_PRESET=couchbase` and Couchbase Traces creates the Logs,
Traces, Metrics, and Sessions sources on the team's first Couchbase connection,
in the bucket and scope from `CBT_COUCHBASE_BUCKET` (default `otel`) and
`CBT_COUCHBASE_SCOPE` (default `default`). The preset is ignored when
`DEFAULT_SOURCES` is set.

To define sources yourself, provide a JSON array of source objects as the
`DEFAULT_SOURCES` environment variable. Each source object should include:

- `name`: A descriptive name for the source
- `kind`: The type of source (`log`, `trace`, `session`, or `metric`)
- `connection`: The name of the connection to use (must match a connection name
  or ID)
- `from`: Where the documents live
  - `databaseName`: The Couchbase bucket
  - `scopeName`: The scope in that bucket
  - `tableName`: The collection (empty for metric sources, which name their
    collections in `metricTables`)
- Various expressions specific to the source type (see examples below)

Example for logs:

```json
[
  {
    "name": "Logs",
    "kind": "log",
    "connection": "Local Couchbase",
    "from": {
      "databaseName": "otel",
      "scopeName": "default",
      "tableName": "otel_logs"
    },
    "timestampValueExpression": "Timestamp",
    "displayedTimestampValueExpression": "Timestamp",
    "bodyExpression": "Body",
    "severityTextExpression": "SeverityText",
    "serviceNameExpression": "ServiceName",
    "resourceAttributesExpression": "ResourceAttributes",
    "eventAttributesExpression": "LogAttributes",
    "traceIdExpression": "TraceId",
    "spanIdExpression": "SpanId"
  }
]
```

### Correlating Sources

Couchbase Traces allows sources to be correlated with each other. This enables features
like navigating from a log to related traces, or from a trace to related logs.
To set up these correlations in your default sources, use the following fields:

- `logSourceId`: Reference to a log source by name
- `traceSourceId`: Reference to a trace source by name
- `sessionSourceId`: Reference to a session source by name
- `metricSourceId`: Reference to a metric source by name

Example with correlated sources:

```json
[
  {
    "name": "Logs",
    "kind": "log",
    "connection": "Local Couchbase",
    "from": {
      "databaseName": "otel",
      "scopeName": "default",
      "tableName": "otel_logs"
    },
    "timestampValueExpression": "Timestamp",
    "bodyExpression": "Body",
    "traceIdExpression": "TraceId",
    "spanIdExpression": "SpanId",
    "traceSourceId": "Traces"
  },
  {
    "name": "Traces",
    "kind": "trace",
    "connection": "Local Couchbase",
    "from": {
      "databaseName": "otel",
      "scopeName": "default",
      "tableName": "otel_traces"
    },
    "timestampValueExpression": "Timestamp",
    "durationExpression": "Duration",
    "durationPrecision": 9,
    "spanNameExpression": "SpanName",
    "traceIdExpression": "TraceId",
    "spanIdExpression": "SpanId",
    "parentSpanIdExpression": "ParentSpanId",
    "logSourceId": "Logs"
  }
]
```

In this example:

- The log source "Logs" references the trace source by name with
  `traceSourceId: "Traces"`
- The trace source "Traces" references the log source by name with
  `logSourceId: "Logs"`

These references are resolved automatically during source creation, allowing
seamless navigation between correlated sources in the Couchbase Traces UI.

## Docker Compose Example

Here's an example of how to set these variables in a Docker Compose file (the
product `docker-compose.yml` does the same):

```yaml
services:
  app:
    image: ghcr.io/mminichino/couchbase-traces:latest
    environment:
      CBT_DEFAULT_SOURCES_PRESET: couchbase
      DEFAULT_CONNECTIONS: >-
        [{"name":"Local Couchbase","kind":"couchbase","host":"couchbase://couchbase","username":"${CBT_COUCHBASE_QUERY_USER}","password":"${CBT_COUCHBASE_QUERY_PASSWORD}"}]
```

For more complex configurations, you can use environment files or Docker secrets
to manage these values.

## Dashboard Provisioning

Couchbase Traces supports file-based dashboard provisioning, similar to Grafana's
provisioning system. A scheduled task reads `.json` files from a directory
and upserts dashboards into the metadata store, matched by name for idempotency.
The task runs on the same schedule as other Couchbase Traces tasks (every minute
when using the built-in scheduler, or on your own schedule when running
tasks externally).

### Environment Variables

| Variable                            | Required | Default | Description                                                     |
| ----------------------------------- | -------- | ------- | --------------------------------------------------------------- |
| `DASHBOARD_PROVISIONER_DIR`         | Yes      |         | Directory to watch for `.json` dashboard files                  |
| `DASHBOARD_PROVISIONER_TEAM_ID`     | No\*     |         | Scope provisioning to a specific team ID                        |
| `DASHBOARD_PROVISIONER_ALL_TEAMS`   | No\*     | `false` | Set to `true` to provision dashboards to all teams              |

\*One of `DASHBOARD_PROVISIONER_TEAM_ID` or `DASHBOARD_PROVISIONER_ALL_TEAMS=true`
is required when `DASHBOARD_PROVISIONER_DIR` is set.

### Dashboard JSON Format

Each `.json` file in the provisioner directory should contain a dashboard object
with at minimum a `name` and `tiles` array:

```json
{
  "name": "My Dashboard",
  "tiles": [
    {
      "id": "tile-1",
      "x": 0,
      "y": 0,
      "w": 6,
      "h": 4,
      "config": {
        "name": "Request Count",
        "source": "Metrics",
        "displayType": "line",
        "select": [{ "aggFn": "count" }]
      }
    }
  ],
  "tags": ["provisioned"]
}
```

### Behavior

- Dashboards are matched by name and team for idempotency
- Provisioned dashboards are flagged with `provisioned: true` so they never
  overwrite user-created dashboards with the same name
- Removing a file from the directory does **not** delete the dashboard from
  the metadata store (safe by default)
- Files are validated against the `DashboardWithoutIdSchema` Zod schema; invalid
  files are skipped with a warning


## Note on Security

While this feature is convenient for development and initial setup, be careful
with including sensitive connection details like passwords in environment
variables for production deployments. Consider using Docker secrets or other
secure methods for managing sensitive configuration in production environments.
