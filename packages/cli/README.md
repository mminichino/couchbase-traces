# @couchbase-traces/cli

[![npm version](https://img.shields.io/npm/v/@couchbase-traces/cli.svg)](https://www.npmjs.com/package/@couchbase-traces/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Terminal UI and CLI for [Couchbase Traces](https://github.com/mminichino/couchbase-traces) —
search, tail, chart, and query your logs, traces, and metrics without leaving
the terminal.

The CLI talks to your Couchbase Traces instance (Cloud or self-hosted) and runs the exact
same query pipeline as the web app, so results always match what you see in the
browser.

## Install

```bash
npm install -g @couchbase-traces/cli    # installs the `cbt` binary
# or run without installing:
npx @couchbase-traces/cli --help
```

Requires Node.js >= 22.16.

## Quickstart

```bash
# Sign in (interactive — prompts for app URL and credentials)
cbt auth login

# Launch the interactive TUI
cbt tui

# Chart error volume by service for the past 3 hours
cbt chart -s Logs --where 'SeverityText:error' --group-by ServiceName --since 3h

# Run raw SQL++ against Couchbase
cbt query --connection-id "$CONN" --sql 'SELECT COUNT(*) AS n FROM `otel`.`default`.otel_logs'
```

## Features

- **Interactive TUI** — search and live-tail events, inspect rows, and walk
  trace waterfalls with vim-style keybindings
- **Trace waterfall** — full span tree with correlated logs, span-level detail,
  and open-in-browser deep links
- **Terminal charts** — render saved dashboard tiles or ad-hoc charts (line,
  stacked bar, number, table, bar, pie) as ANSI output
- **Raw SQL++** — run read-only SQL++ against Couchbase through the Couchbase
  Traces API, as NDJSON, JSON, CSV, or TSV
- **Log pattern mining** — cluster query results into Drain log patterns to
  summarize large result sets
- **Alerts & dashboards** — browse alerts (with trigger history) and dashboards
  from the TUI
- **Multi-team support** — kubectx-style team switching for users in multiple
  teams
- **Agent-friendly** — `--json` output on discovery commands, NDJSON streaming,
  documented exit codes, and colors stripped automatically when piping

## Commands

```
cbt tui                             # Interactive TUI (search + live tail)
cbt chart -d <dashboard> [-t tile]  # Render dashboard tiles as ANSI charts
cbt chart -s <source> [--agg ...]   # Ad-hoc chart over a source
cbt chart --sql <query> -s <source> # Ad-hoc chart from raw SQL
cbt query --connection-id <id> --sql <query>  # Raw SQL to stdout
cbt sources                         # List data sources and their field mappings
cbt connections                     # List Couchbase connections
cbt dashboards                      # List dashboards with tile summaries
cbt auth login|status|logout        # Manage authentication
cbt team list|current|use <team>    # Switch between teams
cbt mcp install                     # Add the MCP server to your AI agents
cbt upload-sourcemaps               # Upload JS source maps
```

Every command accepts `-a, --app-url <url>` to point at a Couchbase Traces instance.
After `cbt auth login`, the URL is saved and the flag becomes optional. Run
`cbt <command> --help` for full flag documentation.

### `cbt tui` — Interactive TUI

The main event viewer: a searchable, live-tailing table of logs or traces with a
detail panel, trace waterfall, pattern mining, alerts, and dashboards.

```bash
cbt tui                          # Pick a source interactively
cbt tui --source "Logs"          # Skip the source picker
cbt tui -q "level:error" -f      # Start with a search query, in follow mode
```

| Key           | Action                                     |
| ------------- | ------------------------------------------ |
| `j` / `↓`     | Move selection down                        |
| `k` / `↑`     | Move selection up                          |
| `l` / `Enter` | Expand row detail                          |
| `h` / `Esc`   | Close detail / blur search                 |
| `G` / `g`     | Jump to newest / oldest                    |
| `Ctrl+D/U`    | Page down / up                             |
| `/`           | Search (global in table, filter in detail) |
| `Tab`         | Cycle sources/searches or detail tabs      |
| `Shift+Tab`   | Cycle backwards                            |
| `t`           | Edit time range in `$EDITOR`               |
| `s`           | Edit SELECT clause in `$EDITOR`            |
| `Shift+P`     | Show event patterns                        |
| `Shift+D`     | Show generated SQL                         |
| `f`           | Toggle follow mode (live tail)             |
| `o`           | Open trace in browser                      |
| `w`           | Toggle line wrap                           |
| `Shift+A`     | Open alerts page                           |
| `d`           | Open dashboards page                       |
| `?`           | Toggle help                                |
| `q`           | Quit                                       |

The row detail panel has three tabs — **Overview** (structured OTel attributes),
**Column Values** (every column of the row), and **Trace** (span waterfall with
correlated logs, navigable with `j`/`k`).

### `cbt chart` — Terminal charts

Render charts as terminal output. Designed for troubleshooting from the CLI
(including by AI agents): visualize a metric, spot the spike, then narrow down
with `--where` or `cbt query`. All modes run through the same
`renderChartConfig` pipeline as the web dashboards.

Three modes:

```bash
# 1. Dashboard tiles — render saved tiles from a dashboard
cbt chart -d "Service Health"                       # All tiles, past 1h
cbt chart -d "Service Health" -t "P95 Latency" --since 24h

# 2. Ad-hoc builder — chart an aggregation over a source
cbt chart -s Logs --where 'SeverityText:error' --group-by ServiceName --since 3h
cbt chart -s Traces --agg quantile --level 0.95 --value Duration \
    --where 'ServiceName:api' --since 6h
cbt chart -s Logs --display bar --where 'SeverityText:error' --group-by ServiceName
cbt chart -s Metrics --metric-type sum --metric-name otelcol_exporter_sent_spans

# 3. Raw SQL — chart arbitrary queries with time macros
cbt chart -s Logs --sql 'SELECT $__timeInterval(Timestamp) AS ts, COUNT(*) AS n
    FROM $__sourceTable WHERE $__timeFilter(Timestamp)
    GROUP BY $__timeInterval(Timestamp) ORDER BY ts'
```

- **Display types** (`--display`): `line` (default), `stacked_bar`, `number`,
  `table`, `bar`, `pie`
- **Time ranges**: `--since 15m|1h|7d`, or `--from`/`--to` with ISO 8601
  (`2026-07-01T00:00:00Z`), dates (`2026-07-01`), or relative values (`now-24h`)
- **SQL macros**: `$__timeFilter(col)` expands to the selected range,
  `$__timeInterval(col)` buckets by the chart granularity
- **Output**: ANSI colors are stripped automatically when piping (override with
  `--color always|never`); `--json` emits raw rows + column metadata

### `cbt query` — Raw SQL

Execute read-only SQL++ (`SELECT`, `WITH`, or `INFER`; one statement per call)
against a Couchbase connection through the Couchbase Traces API. Output defaults
to `JSONEachRow` (NDJSON — one JSON object per line), so results pipe cleanly into
`jq` and friends. `--format` also accepts `JSON`, `CSV`, `TabSeparatedRaw`, and
`JSONCompactEachRowWithNamesAndTypes`.

Name keyspaces in full and backtick-quote `default` (a reserved word). Read map
attributes with field access, e.g. ``LogAttributes.`http.route` ``.

```bash
CONN=$(cbt connections --json | jq -r '.[0].id')
cbt query --connection-id "$CONN" --sql 'SELECT COUNT(*) AS n FROM `otel`.`default`.otel_logs'
cbt query --connection-id "$CONN" --sql 'SELECT t.* FROM `otel`.`default`.otel_traces AS t LIMIT 5'
```

**Pattern mining** (`--patterns`): cluster the result into templated log
patterns using the [Drain](https://github.com/logpai/Drain3) algorithm and emit
one JSON object per pattern, sorted by count — useful for summarizing thousands
of rows into a handful of templates:

```bash
cbt query --connection-id "$CONN" --patterns \
    --sql 'SELECT Body FROM `otel`.`default`.otel_logs LIMIT 10000' --body-column Body
# {"pattern":"connection <*> closed","count":4823,"sample":"connection 10.0.3.7 closed"}
```

Exit codes: `0` on success (empty stdout means zero rows), `1` on failure.

### `cbt sources` / `cbt connections` / `cbt dashboards` — Discovery

List the data sources, Couchbase connections, and dashboards available to your
team. All three support `--json` for structured output.

```bash
cbt sources               # Sources with their bucket, scope, and collection
cbt sources --json        # Includes column expression mappings per source
cbt connections --json    # Connection IDs for `cbt query` / `cbt chart --sql`
cbt dashboards            # Dashboards + tile names for `cbt chart -d`
```

### `cbt auth` — Authentication

```bash
cbt auth login                                    # Interactive prompts
cbt auth login -a https://traces.example.com \
    -e user@example.com -p "$PASSWORD"            # Non-interactive (CI)
cbt auth status                                   # Who am I + active team
cbt auth logout
```

The session is saved to `~/.config/couchbase-traces/cli/session.json` (mode `0600`) and
reused by all commands until it expires.

### `cbt team` — Team switching

For users that belong to multiple teams, switch the team
that all commands are scoped to — kubectx-style:

```bash
cbt team list             # All teams, active one marked
cbt team current          # Print the active team
cbt team use "My Team"    # Switch by name or ID
```

The choice persists across CLI invocations. On single-team deployments these
commands are effectively no-ops.

### `cbt mcp install` — Connect AI agents

Adds the Couchbase Traces MCP server to every supported agent it finds: Claude Code,
Codex, Cursor, and VS Code. It asks for a personal access key or an
organization API key with hidden input and checks it before changing any
config, so the key stays out of shell history and agent chats.

```bash
npx @couchbase-traces/cli mcp install -a https://traces.example.com
```

The key is stored in plain text in each agent's user config, which the
command lists when it finishes. Running it again replaces the existing entry.

### `cbt upload-sourcemaps` — Source maps

Upload JavaScript source maps to Couchbase Traces for stack trace de-obfuscation. Run it
in your build pipeline:

```bash
npx @couchbase-traces/cli upload-sourcemaps \
  --serviceKey "$CBT_API_ACCESS_KEY" \
  --apiUrl "$CBT_API_URL" \
  --path .next \
  --releaseId "$RELEASE_ID"
```

| Flag                     | Description                                            | Default |
| ------------------------ | ------------------------------------------------------ | ------- |
| `-k, --serviceKey <key>` | Couchbase Traces service account API key                        |         |
| `-p, --path <dir>`       | Directory containing sourcemaps                        | `.`     |
| `-u, --apiUrl <url>`     | Couchbase Traces API URL (required for self-hosted deployments) |         |
| `-rid, --releaseId <id>` | Release ID to associate with the sourcemaps            |         |
| `-bp, --basePath <path>` | Base path for the uploaded sourcemaps                  |         |
| `--apiVersion <version>` | API version: `v1` (Couchbase Traces V1 Cloud) or `v2` (latest)  | `v1`    |

Optionally, set the `CBT_SERVICE_KEY` environment variable to avoid passing
the `--serviceKey` flag.

## For AI agents & scripting

The CLI is built to be driven by scripts and AI agents:

- `cbt sources --json`, `cbt connections --json`, `cbt dashboards --json`, and
  `cbt team list --json` emit structured output for discovery
- `cbt query` streams NDJSON by default and documents its exit-code contract
  (`0` success, `1` failure — with "unknown connection" distinguished from "bad
  SQL" on stderr)
- `cbt query --patterns` compresses large result sets into a few templated
  patterns
- `cbt chart --json` returns the queried rows + column metadata instead of a
  rendered chart; ANSI colors are stripped automatically when stdout is not a
  TTY
- Non-interactive login: `cbt auth login -a <url> -e <email> -p <password>`

## Links

- [Couchbase Traces repository](https://github.com/mminichino/couchbase-traces)
- [Couchbase Traces documentation](https://github.com/mminichino/couchbase-traces/tree/main/docs)
- [Report an issue](https://github.com/mminichino/couchbase-traces/issues)
- [Contributing](https://github.com/mminichino/couchbase-traces/tree/main/packages/cli/CONTRIBUTING.md)

## License

[MIT](https://github.com/mminichino/couchbase-traces/blob/main/LICENSE)
