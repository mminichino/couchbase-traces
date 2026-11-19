# Contributing

## From issue to pull request

New bug reports and feature requests open with a `Needs Feedback` label (the
issue templates apply it automatically). That label means the issue is still
being discussed — the scope, the approach, or whether we want the change at all
isn't settled yet. **Please don't start a PR against a `Needs Feedback`
issue**; the discussion often changes what the fix should be, and code written
too early tends to get thrown away.

Once a maintainer is happy with the direction, they swap `Needs Feedback` for
`Accepting PR`. That's the green light: the issue is understood and ready for
someone to pick up. Comment to claim it so two people don't duplicate work, then
open your PR and reference the issue (e.g. `Closes #123`).

If an issue you care about is stuck in `Needs Feedback`, add the missing detail
(a clear repro, the debug info from Help → Copy debug info, your use case) or
ask on the issue — that's usually what unblocks it. This is a convention, not a
hard gate: it keeps effort pointed at changes we've agreed on.

## Reproducing issues and PRs

Every bug report and every PR needs steps someone else can follow to see the
problem (or the fix) for themselves. If a maintainer can't reproduce it, they
can't triage the issue or review the PR.

**Reproduce it locally.** The quickest way is the frontend in local mode, which
needs no Docker and no account: run `yarn app:dev:local`, open the app URL it
prints, and add a connection to your telemetry backend (full-stack dev uses
Couchbase via `make dev`). Connections and sources live in browser storage; clear site
data to start over.

Local mode has no API behind it (dashboards and saved searches are kept in local
storage), so it can't reproduce anything involving alerts, webhooks, auth,
teams, or the API itself. For those, use the full stack (`make dev`, see
[Development](#development) and [docs/development.md](docs/development.md)).
Preset Couchbase sources apply when `CBT_DEFAULT_SOURCES_PRESET=couchbase` (see
`CBT_API_KEY` under [Development](#development)).

If the bug depends on your own schema or data, say so, and include Couchbase
collection/index detail or source
settings. Strip anything sensitive.

**What good steps look like:**

- Start from a known place: `yarn app:dev:local` or a fresh `yarn dev` (say
  which).
- Number each step and name the UI element you interact with by its visible
  text: "Open **Search**, pick the **Demo Logs** source, set the time range to
  **Last 15 minutes**, type `SeverityText:error` and press Enter."
- End with what you expected and what happened instead.
- For bugs, add the debug info from **Help → Copy debug info**.

**In a PR**, fill in the "How to reproduce" section of the template with:

- Steps that show the bug or missing behavior on `main` (or a link to the issue
  that has them).
- The same steps on your branch, and what's different now.
- Anything extra the reviewer needs: env vars, a feature flag, a particular
  source or schema, seed data.

## UI changes need before/after screenshots

Any PR that changes something a user can see in the app must include before and
after screenshots, or a short video if the change involves interaction or
animation. Put them in the "Screenshots or video" table of the PR template.

- **Before** is `main`; **after** is your branch. Take both at the same
  viewport size and theme, showing the same screen and data, so the difference
  is obvious.
- For a brand new screen or component there's no "before"; show the place it's
  reached from instead.
- If the change affects both light and dark mode, include each one that looks
  different.
- Keep them focused. Crop to the area that changed, or annotate the full page.

This isn't enforced by a check, but reviewers won't start on a UI PR without
them.

## Architecture Overview

![architecture](./.github/images/architecture.png)

Service Descriptions:

- OpenTelemetry Collector (otel-collector): Receives OTLP and forwards to the
  ingest service (Couchbase).
  Includes OpAMP supervisor that pulls configuration from the API.
- Couchbase: Telemetry storage (logs, traces, metrics, sessions).
- Ingest: Normalizes OTLP and writes to Couchbase.
- Couchbase metadata bucket (`cbt_meta`): Stores users, saved searches, alerts,
  and dashboards.
- Couchbase Traces API (api): Executes SQL++ on behalf of the frontend and runs
  alert checks.
- Couchbase Traces UI (app): Next.js frontend, serves the UI.

## Development

Pre-requisites:

- Docker
- Node.js (`>=22`)
- Yarn (v4)

You can get started by deploying a complete development stack in dev mode.

```bash
yarn dev
```

This starts the API, Next.js frontend, OpenTelemetry collector, and
Couchbase (see [docs/development.md](docs/development.md)).

Each worktree automatically gets unique ports so multiple developers (or agents)
can run `yarn dev` simultaneously without conflicts. A dev portal at
http://localhost:9900 auto-starts and shows all running stacks with their
assigned ports. Check the portal to find the URL for your instance.

To stop the stack:

```bash
yarn dev:down
```

To enable self-instrumentation and demo logs, you can set the `CBT_API_KEY`
to your ingestion key (visit the Team settings page after creating your account).
The API and the Next.js server pass it to the OpenTelemetry SDK
(`@clickhouse/clickstack-node`) as `apiKey`, and the browser SDK
(`@clickhouse/clickstack-browser`) gets it from `/api/config`. The API and the
alert task report as `hdx-oss-dev-api`, the Next.js server as
`hdx-oss-dev-app-next`, and the browser as `hdx-oss-dev-app`.

To do this, create a `.env.local` file in the root of the project and add the
following:

```sh
CBT_API_KEY=<YOUR_INGESTION_API_KEY_HERE>
```

Then restart the stack using `yarn dev`.

The core services are all hot-reloaded, so you can make changes to the code and
see them reflected in real-time.

### Volumes

The development stack mounts volumes locally for persisting storage under
`.volumes`. Each worktree gets its own volume directory (e.g.
`.volumes/couchbase_dev_89`). Clear the `.volumes` directory to reset Couchbase
storage.

### Windows

If you are running WSL 2, Hot module reload on Nextjs (Frontend) does not work
out of the box on windows when run natively on docker. The fix here is to open
project directory in WSL and run the above docker compose commands directly in
WSL. Note that the project directory should not be under /mnt/c/ directory. You
can clone the git repo in /home/{username} for example.

To develop from WSL, follow instructions
[here](https://code.visualstudio.com/docs/remote/wsl).

## Testing

All test environments use slot-based port isolation, so they can run
simultaneously with the dev stack and across multiple worktrees.

### E2E Tests

E2E tests run against a full local stack (Couchbase + API). Docker must
be running.

```bash
# Run all E2E tests
make e2e

# Run a specific spec file (dev mode: hot reload, containers kept running)
make dev-e2e FILE=search

# Run with grep pattern
make dev-e2e FILE=search GREP="filter"

# Run via script directly for more control
./scripts/test-e2e.sh --ui --last-failed
```

Tests live in `packages/app/tests/e2e/`. Page objects are in `page-objects/`,
shared components in `components/`.

### Integration Tests

```bash
# Build dependencies (run once before first test run)
make dev-int-build

# Run a specific test file
make dev-int FILE=checkAlerts
```

### Unit Tests

To run unit tests or update snapshots, you can go to the package you want (ex.
common-utils) to test and run:

```bash
yarn dev:unit
```

### Mutation Tests

Coverage tells you a line ran; it doesn't tell you a test would fail if that
line were wrong. [Stryker](https://stryker-mutator.io/) edits the source in
small ways (flips a comparison, empties a return) and reports which edits the
test suite failed to catch. A surviving mutant is a missing assertion.

Set up in `common-utils` only for now. From `packages/common-utils`:

```bash
# The file you're working on — seconds to a couple of minutes
yarn dev:mutation --mutate src/filters.ts

# Everything you've changed off main
yarn dev:mutation --mutate "$(git diff --name-only --diff-filter=d --relative origin/main... -- 'src/**/*.ts' | grep -v __tests__ | paste -sd, -)"

# The whole package (slow — tens of minutes)
yarn dev:mutation
```

Scope it to what you're working on. Runs are roughly linear in mutants, and the
whole package is ~365 files. Results are cached between runs, so a re-run after
editing one file only re-tests that file.

Read the `Survived` entries: each one shows the edit that was made and the tests
that ran anyway. `NoCoverage` means no unit test reaches that code at all — some
of those are covered by integration tests, which this doesn't run. An HTML
report lands in `reports/mutation/`.

The score is not a coverage number for the whole file. Module-level code —
constants, regexes, lookup tables — isn't mutated at all (`ignoreStatic`, about
10% of the mutants here) and is left out of the denominator, so a high score
says nothing about whether those are asserted on.

Not wired into CI. It's a tool for while you're writing tests, not a gate.

One wrinkle worth knowing about: the root `package.json` pins
`@stryker-mutator/core/minimatch` to `^9`. Our blanket `brace-expansion`
resolution forces v2 (CJS) everywhere, and minimatch v10's ESM build needs
`brace-expansion` v5's named exports, so Stryker crashes on startup without the
pin. Drop it if that blanket resolution is ever narrowed.

## AI-Assisted Development

Couchbase Traces includes an [MCP server](https://modelcontextprotocol.io/) that lets AI assistants query observability data, manage dashboards, and
explore data sources. See [MCP.md](/MCP.md) for setup instructions.

The repo also ships with configuration for AI coding assistants that enables interactive browser-based E2E test generation and debugging via
the [Playwright MCP server](https://github.com/microsoft/playwright-mcp).

### Claude Code

The project includes agents and skills for test generation, healing, and planning under `.claude/`. These are loaded automatically when you open the project in Claude Code. No additional setup required.

### Cursor

A Playwright MCP server config is included at `.cursor/mcp.json`. To activate it:

1. Open **Cursor Settings → Tools & MCP**
2. The `playwright-test` server should appear automatically from the project config
3. Enable it

This gives Cursor's AI access to a live browser for test exploration and debugging.
