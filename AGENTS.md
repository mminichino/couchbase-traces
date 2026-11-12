# AGENTS.md

Project context for coding assistants working on Couchbase Traces. Read this file in full before any task. The phased work plan is in `COUCHBASE_PORT_PLAN.md`; run its phases in order and follow the rules here throughout.

## Goal

Turn this project into Couchbase Traces: the full HyperDX product, rebranded, running on Couchbase Server Enterprise 8.x / Capella with SQL++ in place of ClickHouse. Every HyperDX feature is preserved.

## Constants

Change these here and nowhere else. The plan and every phase refer to them by name.

| Name | Value |
|---|---|
| `UPSTREAM_PATH` | `/Users/michael/IdeaProjects/hyperdx` |
| `ORIGIN_URL` | `https://github.com/mminichino/couchbase-traces.git` |
| `PRODUCT_NAME` | `Couchbase Traces` |
| `PRODUCT_SLUG` | `couchbase-traces` |
| `NPM_SCOPE` | `@couchbase-traces` |
| `ENV_PREFIX` | `CBT_` |
| `BRAND_ASSETS` | `branding/` in this project (logo SVGs, favicon, color tokens) |
| `COUCHBASE_VERSION` | Couchbase Server Enterprise 8.x; minimum 8.0 |
| `COUCHBASE_DOCS` | `https://docs.couchbase.com/server/8.0/` |

## Target platform

- Couchbase Server Enterprise Edition 8.x, self-managed, and Capella clusters running 8.x. No support for 7.x or Community Edition, so Enterprise-only features such as window functions and anything introduced in 8.0 are allowed.
- Services required: Data, Query, Index, Search.
- Buckets use Magma storage, the 8.0 default.
- Check every SQL++ function, system keyspace, RBAC role, and REST endpoint against `COUCHBASE_DOCS`, not against older documentation or memory.
- Use the current Couchbase Node SDK 4.x release that lists Server 8.0 as supported.
- Dev and CI pin one Enterprise 8.0.x image tag, the latest maintenance release available on Docker Hub. Record the tag in `docs/port-notes.md`.

## Scope

Full feature parity with the imported HyperDX commit:

- Search: Lucene and SQL filters, histogram, results table, row detail, field sidebar, live tail, saved searches, event patterns, event deltas.
- Chart explorer and dashboards, including every aggregation and chart type.
- Traces: span search, waterfall, service map, log and trace correlation.
- Metrics: gauge, sum, histogram, exponential histogram, summary.
- Session replay.
- Alerts and every scheduled task that queries the data store.
- Kubernetes and any other preset views.
- Ingestion through the OpenTelemetry collector.
- Sources and connections, teams, users, auth, API keys, and the external API.

Nothing is removed for being hard to port. A feature is dropped only with written sign-off recorded in `docs/parity.md`.

## Rules

1. Work one phase at a time. Each phase ends with lint, type check, and unit tests green, then one commit. Do not start the next phase with a red build.
2. Verify every path and symbol named in the plan against the imported source before editing. Upstream moves fast and names here come from a point-in-time reading. Record corrections in `docs/port-notes.md`.
3. Never import the `couchbase` npm package from `packages/app` or from any module the browser bundle reaches. It is a native addon and runs server-side only.
4. Every SQL++ statement uses named parameters for values. Identifiers are backtick-quoted through one helper that rejects any identifier containing a backtick.
5. Do not edit ClickHouse modules in place. Build the Couchbase data layer alongside them and switch features over one slice at a time through the seam in Phase 6. ClickHouse code is deleted in Phase 10.
6. The upstream unit and integration tests are the specification. Port each test with its feature: same inputs, SQL++ expected output, same result shape.
7. Never push to `origin` without an explicit instruction from the user. Do not commit credentials, `.env` files with secrets, or Capella connection strings.
8. Keep `LICENSE` and the upstream copyright line intact in every phase.
9. Stop and ask when: an existing file conflicts with an imported path at Phase 0, brand assets are missing from `BRAND_ASSETS`, or a feature cannot be expressed in SQL++ with the same result shape.

## Upstream conventions

Merged from docs/upstream-AGENTS.md, .cursor/rules/playwright.mdc, .cursor/rules/ui-sentence-case.mdc, AGENTS.md, CLAUDE.md at upstream commit f172a489c818. The sections above take precedence over anything here.

### Commands
- Use `yarn setup` to install dependencies.
- Use `yarn dev` to start the full stack with worktree-isolated ports.
- Use `yarn lint:fix` after finishing code edits to auto-fix formatting and lint across all packages.
- Use `make ci-lint` for lint and TypeScript check across all packages.
- Use `make ci-unit` for unit tests across all packages.
- In `packages/app`, use `yarn ci:unit` for unit tests and `yarn dev:unit` for watch mode.
- In `packages/api`, use `yarn ci:unit` for unit tests; use `make dev-int-build` once, then `make dev-int FILE=<TEST_FILE_NAME>` for integration tests.
- In `packages/common-utils`, use `yarn ci:unit`, `yarn dev:unit`, `yarn ci:int`, and `yarn dev:int`.
- Run a specific unit test with `yarn ci:unit <path/to/test.ts>` or `yarn ci:unit --testNamePattern="pattern"`.
- In `packages/cli`, type-check with `npx tsc --noEmit`.
- For E2E: install Chromium with `cd packages/app && yarn playwright install chromium`, then `make e2e`, or `make dev-e2e FILE=<name>` / `make dev-e2e GREP="<pattern>"`.
- For Playwright E2E helpers, follow `.claude/skills/playwright/SKILL.md` and run via `./scripts/test-e2e.sh --quiet <file>`.

### Code style
- Use TypeScript strictly; validate with Zod schemas.
- Before defining a type, Zod schema, helper, or component, search for an existing one (`packages/common-utils/src/` first, then the current package) and reuse it.
- Keep files under 300 lines; break down large components.
- Use custom Button/ActionIcon variants (`primary`, `secondary`, `danger`), `useConfirm` for confirmation dialogs, and sentence case for all user-facing UI text.
- Prefer Mantine components as the UI standard.
- Client state uses Jotai; server state uses TanStack Query; filters often live in URL params.
- Comments explain why, not what; omit self-evident restatements.
- Read `agent_docs/code_style.md` before writing or planning `packages/app` UI changes and before adding shared types, schemas, helpers, or components.
- Read `agent_docs/naming_objects.md` before adding or changing any name field (`InlineNameInput`).

### Testing
- Put tests in `__tests__/` directories; use Jest for unit and integration tests.
- Write or update tests alongside the implementation.
- When writing or fixing Playwright E2E tests, follow `.claude/skills/playwright/SKILL.md`.

### Repository layout
- Monorepo with Yarn 4.13.0 workspaces.
- `packages/app` — Next.js frontend (TypeScript, Mantine UI, TanStack Query).
- `packages/api` — Express backend (Node.js 22+, MongoDB for metadata); also hosts MCP, External API v2, and OpAMP as sub-applications.
- `packages/common-utils` — shared TypeScript utilities for query parsing and validation.
- `packages/cli` — terminal CLI and interactive TUI (`hdx`) with its own `packages/cli/AGENTS.md`.
- `packages/otel-collector` — custom OpenTelemetry Collector (Go, OCB).
- `packages/hdx-eval` — AI eval framework for MCP server benchmarking.
- Package-specific guides live under each package; cross-cutting agent docs live in `agent_docs/`.
