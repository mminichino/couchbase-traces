# Couchbase Traces v1.0.0 release plan

Status: approved. The user answered every open question on 2026-11-19; the
answers are recorded in section 10 (Decisions). Planning only; no code changes
are made by this document.

Branch: `mm--v1-release-plan`, cut from `main` at `5a99f5f` (Mongo elimination
C5, PR #14).

## 1. Summary

The feature port is functionally complete: `docs/parity.md` shows 51 ported, 2
replaced, 2 dropped with sign-off (PromQL `api-v1`, careers page `app-careers`),
and MongoDB is gone (C0–C5). What stands between `main` and a credible v1.0.0:

1. **Test debt that hides behavior.** 23 upstream API integration suites (about
   880 test cases) are excluded from `yarn ci:int` by `deferredChIntSuites` in
   `packages/api/jest.int.config.js` (lines 22–46, applied at line 63). These
   are not the "51 skipped" in the CI log: the only `describe.skip` in the API
   int tree is the harness-only `metadata.couchbase.int.test.ts` (line 26, which
   wraps the content and alert contract suites), and the user accepted that
   after C0. The ignored suites never run at all and are not counted anywhere.
   AGENTS.md rule 6 makes the upstream tests the specification.
2. **Playwright full-stack E2E is switched off on Main**
   (`.github/workflows/main.yml` lines 297–320: `e2e-tests: if: ${{ false }}`
   plus a green stub `End-to-End Tests` job).
3. **No release path exists.** Nothing pushes images, `version.sh` calls a
   `make release` target that does not exist, changesets cannot move versions
   down from 2.44.0 to 1.0.0, and the Makefile tags the UI and collector images
   without the `ghcr.io` registry that `docker-compose.yml` pulls from.
4. **Version numbers are inherited from upstream HyperDX** (2.44.0, 0.34.0,
   0.9.0, 2.0.0, image major `2`) and must be reset to our own 1.0.0.
5. A handful of small correctness and branding defects that become public
   contract at 1.0 (webhook SSRF blocklist keyed to `CLICKHOUSE_HOST`,
   `~/.config/hyperdx` CLI config path, `-beta` MCP version, stale README and
   DEPLOY status text).

The plan has nine phases, R0–R8, with R2 split into three sub-phases (R2a–R2c).
R0–R7 land as normal PRs from `mm--` branches. R8 bumps the version, and then,
only on the user's explicit instruction, tags `v1.0.0`, pushes images, and
publishes the GitHub release.

## 2. Inventory of open items

Severity: **Blocker** means it must be resolved (or explicitly signed off in
`docs/parity.md` / this plan) before tagging v1.0.0. **Post-1.0** means it is
safe to ship and track afterwards. Size: S under a day, M one to three days, L
more than three days. Items marked _decision_ depend on a question in
section 10.

Sources mined: `docs/port-notes.md` (all sections), `docs/parity.md`,
`docs/mongo-elimination-plan.md` section 12, `docs/acceptance.md`, the
`PHASE_*_SPEC.md` files, `TODO`/`FIXME` comments, skipped tests,
`.github/workflows/*`, `knip.json`, `scripts/ci/ratchet-baseline.json`, lint
caps in each `package.json`, ClickHouse and HyperDX leftovers, and
`gh issue list` / `gh pr list` / `gh release list` (no open issues, no open PRs,
no releases, and no git tags exist on `origin`).

### 2.1 Release blockers

| ID  | Item                                                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Proposed fix                                                                                                                                                                                                                                                                                                                                                                                     | Size                     | Depends on                        |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | --------------------------------- |
| B1  | 23 deferred API int suites never run (~880 cases)                                            | `packages/api/jest.int.config.js:22-63`; `docs/port-notes.md` "Phase 11 — Main CI int shards (K2)"                                                                                                                                                                                                                                                                                                                                                                          | Triage each suite in R0, then port the ClickHouse-shaped assertions to SQL++ shapes (same inputs, same result shape, rule 6) and drop the suite from the list. Split into R2a internal and external API, R2b alerts, R2c MCP                                                                                                                                                                     | L (three M/L sub-phases) | R0                                |
| B2  | Playwright full-stack E2E disabled on Main                                                   | `.github/workflows/main.yml:297-320`; known gaps in port-notes K2: saved-search alert `table-row` empty, heatmap and event deltas, Kubernetes dashboard, chart explorer SQL-mode toggles, ad hoc dashboard click filters; Phase 7 notes: search side-panel tabs (3 tests), time-picker search (1), Couchbase `metric-name-streaming`, `metric-table-autofill`, `correlated-metric-source`                                                                                   | Fix the failing specs, then restore the `e2e-tests` `workflow_call` and the report aggregator from git history (this edits `.github/workflows/main.yml`; the phase is explicitly about CI)                                                                                                                                                                                                       | L                        | R0, R4 sub-items                  |
| B3  | 4 `sources.spec.ts` specs fail on ClickHouse-era UI expectations                             | `packages/app/tests/e2e/features/sources.spec.ts:18` (`'Database'` label), `:289-290` (`Save anyway`), PUT with the GET payload; port-notes C5 "E2E smoke"                                                                                                                                                                                                                                                                                                                  | Update expectations to the Couchbase source form (bucket, scope, collection labels; the current save flow; PUT body shape the API accepts), following `.claude/skills/playwright/SKILL.md`                                                                                                                                                                                                       | S                        | none                              |
| B4  | E2E fails with `authentication failure` when `CBT_COUCHBASE_ADMIN_PASSWORD` is exported      | `port/golden/lib/couchbase-init.sh:8` reads `CBT_COUCHBASE_ADMIN_PASSWORD`; `scripts/test-e2e.sh:173`, `packages/app/tests/e2e/global-setup-fullstack.ts:92`, `packages/app/scripts/run-e2e.js:84` hard-code `cbt-test-admin`                                                                                                                                                                                                                                               | `scripts/test-e2e.sh` sets `CBT_COUCHBASE_ADMIN_PASSWORD=cbt-test-admin` explicitly for the child processes it starts (golden init, Playwright), so the shell value can no longer leak in; one value, one place                                                                                                                                                                                  | S                        | none                              |
| B5  | Webhook SSRF blocklist only knows `CLICKHOUSE_HOST`, which is unset in every real deployment | `packages/api/src/utils/validators.ts:105-121`; `packages/api/src/config.ts:135-137`                                                                                                                                                                                                                                                                                                                                                                                        | Block the hosts of `CBT_METADATA_CONNSTR`, `CBT_COUCHBASE_CONNSTR`, `DEFAULT_CONNECTIONS` hosts, and the ingest and collector endpoints, parsed with `parseConnStr` (`packages/common-utils/src/couchbase/connstr.ts:82`). Remove `CLICKHOUSE_*` from `config.ts`, `packages/api/.env.test:28-33`, and the `main.yml` int-job env (lines 179–182); tests seed connections from `CBT_COUCHBASE_*` | S                        | none                              |
| B6  | Service map node latency percentiles are always NULL (parity gap)                            | `packages/app/src/couchbase/serviceMap.ts:158-159` (`NULL AS p50, NULL AS p95, NULL AS p99`); port-notes "Phase 7: traces"                                                                                                                                                                                                                                                                                                                                                  | Compute node percentiles the same way edge percentiles are computed (lines 153–156): `ARRAY_SORT(ARRAY_AGG(duration))` per node, index at `FLOOR(q * (n - 1))`. Port the upstream node-latency test. Fix before 1.0 (decision Q4)                                                                                                                                                                | M                        | none                              |
| B7  | No image publish path; Makefile tags do not match compose                                    | `Makefile:255-289`: `build-app` and `build-otel-collector` tag `${IMAGE_NAME_DOCKERHUB}:…` with no registry, while `docker-compose.yml:49,63,90,113` pulls `${CBT_IMAGE_REPO}/…:${IMAGE_VERSION}`; only `${IMAGE_VERSION}${IMAGE_VERSION_SUB_TAG}` (e.g. `2.44.0`) is built, never the major tag `2` that compose uses; `version.sh:30` refers to a missing `make release`; `docker-build.yml` only builds with `push: false`                                               | Add `make release-images` (buildx, multi-arch from `BUILD_PLATFORMS`, `--push`) that tags `ghcr.io/mminichino/<image>:1.0.0`, `:1.0`, `:1` and `:latest` (decision Q2). Fix the registry prefix on every build target                                                                                                                                                                            | M                        | R6                                |
| B8  | Versions are upstream's, and changesets cannot reset them                                    | see section 3                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `scripts/release/set-version.mjs` sets every version location in one pass, with a `--check` mode used in CI (section 5)                                                                                                                                                                                                                                                                          | M                        | R6                                |
| B9  | "What's new" changelog link targets a tag scheme that will not exist                         | `packages/app/src/components/AppNav/useWhatsNew.ts:24-29` builds `blob/@couchbase-traces/app@<version>/CHANGELOG.md`                                                                                                                                                                                                                                                                                                                                                        | Link to `blob/v<version>/CHANGELOG.md` to match the `v1.0.0` tag                                                                                                                                                                                                                                                                                                                                 | S                        | none (Q3 decided)                 |
| B10 | Ingest image carries no version                                                              | `packages/ingest/Dockerfile` has no `ARG CODE_VERSION`, no `ENV CODE_VERSION`, no OCI labels; `packages/ingest/src/setup/cli.ts:189` passes `env.CODE_VERSION` as `appVersion`                                                                                                                                                                                                                                                                                              | Add `ARG/ENV CODE_VERSION` and `org.opencontainers.image.version` labels to the ingest image and the other three images                                                                                                                                                                                                                                                                          | S                        | R6                                |
| B11 | MCP server reports `<version>-beta`                                                          | `packages/api/src/mcp/mcpServer.ts:53`                                                                                                                                                                                                                                                                                                                                                                                                                                      | Report `CODE_VERSION` without the suffix                                                                                                                                                                                                                                                                                                                                                         | S                        | none                              |
| B12 | User-visible HyperDX branding left in shipped artifacts                                      | Root `package.json:2` name `hyperdx`; CLI config dir `~/.config/hyperdx/cli` (`packages/cli/src/utils/config.ts:5`); CLI compiled binary names `hdx-linux-x64` etc. (`packages/cli/package.json:33-35`); org API key service-account email domain `service-accounts.hyperdx.invalid` (`packages/api/src/controllers/orgApiKey.ts:52`); collector component ids `otlp/hyperdx`, `bearertokenauth/hyperdx`, `oidc/hyperdx` in `docker/otel-collector/config.standalone*.yaml` | Rename to `couchbase-traces`, `~/.config/couchbase-traces/cli` (read the old path once and migrate), `cbt-<os>-<arch>`, `service-accounts.couchbase-traces.invalid`, and `otlp/cbt` etc.                                                                                                                                                                                                         | S                        | none                              |
| B13 | Status docs say the port is unfinished and images are unpublished                            | `README.md:3-7` ("being ported", "port is in progress"), `README.md` quick start "(when compose Phase 9 land is merged)"; `DEPLOY.md:16-27` ("not published yet", UI image listed without `ghcr.io`), `DEPLOY.md:38,113` and `LOCAL.md:21` use tag `:2`; `docs/development.md:71` uses `:2.44.0`                                                                                                                                                                            | Rewrite for 1.0: supported versions, image names and tags, upgrade notes                                                                                                                                                                                                                                                                                                                         | S                        | R6                                |
| B14 | Stale "pending user decisions" in port-notes                                                 | `docs/port-notes.md:876-879`: local mode was removed in Phase 10 (`packages/app/src/config.ts` comment), and publishing the all-in-one image is undecided                                                                                                                                                                                                                                                                                                                   | Close the local-mode item; record the all-in-one decision (Q1: not published for 1.0)                                                                                                                                                                                                                                                                                                            | S                        | none                              |
| B15 | Acceptance report predates Mongo elimination                                                 | `docs/acceptance.md` generated 2026-11-18 at `6599628`, 8 commits behind `main`; its K1 output still logs a Mongoose warning                                                                                                                                                                                                                                                                                                                                                | Re-run `port/acceptance/run.mjs` (all checks A1–M2) at the release-candidate commit with `--final`, record the CI run                                                                                                                                                                                                                                                                            | M                        | R1–R6                             |
| B16 | Pinned Couchbase image may not be the latest 8.0.x maintenance release                       | `couchbase/server:enterprise-8.0.3` in `.env:22`, `Makefile`, `port/couchbase-test/docker-compose.yml`; AGENTS.md requires the latest 8.0.x on Docker Hub                                                                                                                                                                                                                                                                                                                   | Check Docker Hub in R0; bump if newer, record in port-notes                                                                                                                                                                                                                                                                                                                                      | S                        | none                              |
| B17 | User-visible "legacy store" text (a mechanical rebrand of "ClickHouse")                      | Found in R1: 367 hits in 156 non-test files, e.g. CLI help `cbt connections` "List legacy store connections" (`packages/cli/src/cli.tsx:959`), `packages/api/openapi.json` (23), MCP tool and prompt text (`mcp/tools/query/table.ts`, `mcp/prompts/dashboards/content.ts:974` "legacy store parameterized syntax")                                                                                                                                                         | Rewrite user-facing strings to "Couchbase" or "data store"; where the text teaches ClickHouse syntax, fix it with D2. Leave code comments to P4. Needs a decision: blocker, or post-1.0                                                                                                                                                                                                          | M                        | D2b (blocker, decided 2026-11-20) |

### 2.2 Post-1.0

| ID  | Item                                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Proposed fix                                                                                        | Size           |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| P1  | ClickHouse-named identifiers and legacy CH connection UI | `toQuotedClickHouseKeyExpression` (31 refs), `toClickHouseKeyExpression`, `cleanClickHouseExpression`, `ClickhouseSettingForm` / `useUpdateClickhouseSettings` (`TeamQueryConfigSection.tsx:53-67`), `hasClickHouse` in `connection.ts`, `AppNav.tsx:103,506`, `Spotlights.tsx`, `ConnectionForm.tsx:258` "ClickHouse (no longer supported)", `isClickhouseBuild` in `hdxDebug.ts`, parity title "ClickHouse query settings"; `cli/src/utils/parseError.ts:33` | Rename to neutral names; remove the legacy connection branch once no stored CH connection can exist | M              |
| P2  | Leftover ClickHouse migrations                           | `packages/api/migrations/ch/` (4 SQL files, unreferenced)                                                                                                                                                                                                                                                                                                                                                                                                      | Delete                                                                                              | S              |
| P3  | Retained `@clickhouse/*` packages                        | `@clickhouse/clickstack-node` (api, app), `@clickhouse/clickstack-browser`, `@clickhouse/click-ui` (app); allowlisted as `retained_dependency` (77 entries in `port/remove-ch/allowlist.json`)                                                                                                                                                                                                                                                                 | Replace self-telemetry with plain OpenTelemetry SDKs; replace click-ui components with Mantine      | L              |
| P4  | Internal `hdx` / `HyperDX` naming                        | 134 `hdx`/`HDX` refs in 71 source files (`HDX_*` constants in `packages/app/src/config.ts`, `hdxMTViews.ts`, `hdxDebug.ts`, `x-hdx-team` header in the CLI), `packages/hdx-eval` package name, dev tooling paths `~/.config/hyperdx/{dev-slots,nx-cache}` (`scripts/dev-env.sh:31,44`, `scripts/test-e2e.sh:65`), `scripts/dev-portal/*`, `docker/hyperdx/` directory, comments                                                                                | Mechanical rename; the `x-hdx-team` header needs an alias period because it is wire-visible         | M              |
| P5  | Lint warning caps and ratchet baselines                  | `--max-warnings` api 320 (313 measured at C5), app 568, common-utils 100; `scripts/ci/ratchet-baseline.json` `as-any` api 74 / app 150 / common-utils 21, `eslint-disable` api 32 / app 117 / common-utils 14                                                                                                                                                                                                                                                  | Lower caps to measured values now (free), ratchet down per release                                  | S then ongoing |
| P6  | jscpd advisory clones                                    | `.github/workflows/jscpd.yml:35-38` `continue-on-error`; `Makefile` `-yarn dupes`                                                                                                                                                                                                                                                                                                                                                                              | Review the clone report the port introduced; fold real duplicates into helpers                      | M              |
| P7  | common-utils coverage floors reset low                   | port-notes Phase 11: 76/63/72/77                                                                                                                                                                                                                                                                                                                                                                                                                               | Raise as tests land (B1 will raise them)                                                            | S              |
| P8  | No rollup collections                                    | port-notes Phase 5: `otel_*_kv_rollup_15m` not built; value lists use sampling                                                                                                                                                                                                                                                                                                                                                                                 | Revisit only if field-value latency regresses at scale                                              | M              |
| P9  | Harness flake: `UnambiguousTimeoutError` after rebalance | port-notes C1 "Harness flake seen once"                                                                                                                                                                                                                                                                                                                                                                                                                        | `init.sh` waits for rebalance before metadata provisioning                                          | S              |
| P10 | Port scaffolding at the repo root                        | `PHASE_0_SPEC.md` … `PHASE_11_SPEC.md`; AGENTS.md cites `COUCHBASE_PORT_PLAN.md`, which is absent (Phase 0 waiver)                                                                                                                                                                                                                                                                                                                                             | Move specs to `docs/history/`, update AGENTS.md to point at this plan                               | S              |
| P11 | `main.yml` also triggers on a `v1` branch                | `.github/workflows/main.yml:4,6` (`branches: [main, v1]`, upstream legacy)                                                                                                                                                                                                                                                                                                                                                                                     | Leave as is; if the user wants a `release/1.x` maintenance branch later, add it then                | S              |
| P12 | Upstream TODOs                                           | 11 port-unrelated `TODO`s (e.g. `tasks/checkAlerts/transports/generic.ts:203` webhook signing, `controllers/ai.ts:122`)                                                                                                                                                                                                                                                                                                                                        | Track as normal backlog; webhook signing is the one with security value                             | —              |

Accepted, no action: the 51 skipped `metadata.couchbase.int.test.ts` tests on
the compose CI stack (user decision after C0; they run in the
`Couchbase integration` job); the `metric-table-autofill.spec.ts:127`
`test.skip` and `sources.spec.ts:136` conditional skip (local-mode only paths,
re-check in R4); duplicate-record collapse and exact quantiles (documented
design, `docs/data-model.md`); retained `@opentelemetry/instrumentation-mongo*`
license rows (idle, ship inside auto-instrumentations).

## 3. Where versions live today

None of these numbers are ours. They came with the upstream import
(`UPSTREAM.md`: commit `f172a489c818`, release tag `@hyperdx/app@2.43.1`; `main`
carries the unreleased upstream `2.44.0` bump). They must not be confused with
Couchbase Traces releases. The only Couchbase Traces release heading so far is
`## v0.1.0` in the root `CHANGELOG.md`, which was never tagged.

| Location                                                                                    | Today                                                                           | v1.0.0                                                          | How it is surfaced                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `package.json` `version` (name `hyperdx`)                                              | 2.0.0                                                                           | 1.0.0, name `couchbase-traces`                                  | `Makefile:1` `LATEST_VERSION`                                                                                                                                                                                                                              |
| `packages/api/package.json`                                                                 | 2.44.0                                                                          | 1.0.0                                                           | changesets `fixed` group                                                                                                                                                                                                                                   |
| `packages/app/package.json`                                                                 | 2.44.0                                                                          | 1.0.0                                                           | `APP_VERSION` (`packages/app/src/config.ts:47`), `NEXT_PUBLIC_APP_VERSION` (`next.config.mjs:86,110`), debug panel `hdxDebug.ts:181`                                                                                                                       |
| `packages/otel-collector/package.json`                                                      | 2.44.0                                                                          | 1.0.0                                                           | changesets `fixed` group                                                                                                                                                                                                                                   |
| `packages/ingest/package.json`                                                              | 2.44.0                                                                          | 1.0.0                                                           | not in the `fixed` group today; add it                                                                                                                                                                                                                     |
| `packages/common-utils/package.json`                                                        | 0.34.0                                                                          | 1.0.0 (Q5)                                                      | private, not published                                                                                                                                                                                                                                     |
| `packages/cli/package.json` (bin `cbt`, `publishConfig.access: public`)                     | 0.9.0                                                                           | 1.0.0 (Q5); not published to npm (Q6)                           | `cbt --version` via tsup define (`packages/cli/tsup.config.ts:24`, `src/cli.tsx:391`); sourcemap uploader `src/sourcemaps.ts:22`                                                                                                                           |
| `packages/hdx-eval/package.json`                                                            | 0.3.3                                                                           | unchanged, 0.3.3 (Q5)                                           | dev tool, private                                                                                                                                                                                                                                          |
| `.env` (tracked) `CODE_VERSION`                                                             | 2.44.0                                                                          | 1.0.0                                                           | baked into images as `CODE_VERSION`, `OTEL_RESOURCE_ATTRIBUTES service.version` (`docker/hyperdx/Dockerfile:130-133,171-177`); API `/health` and `/` (`routers/api/root.ts:40,54`); MCP server version (`mcp/mcpServer.ts:53`); ingest `appVersion` marker |
| `.env` `IMAGE_VERSION` / `IMAGE_VERSION_SUB_TAG` / `IMAGE_NIGHTLY_TAG` / `IMAGE_LATEST_TAG` | `2` / `.44.0` / `2-nightly` / `latest`                                          | `1` / `.0.0` / `1-nightly` / `latest`                           | compose pulls `${CBT_IMAGE_REPO}/<image>:${IMAGE_VERSION}`; Makefile builds `${IMAGE_VERSION}${IMAGE_VERSION_SUB_TAG}`                                                                                                                                     |
| `.env.example:7` `IMAGE_VERSION`                                                            | 2                                                                               | 1                                                               | product compose                                                                                                                                                                                                                                            |
| Image repo and names (`.env:4-13`)                                                          | `ghcr.io` + `mminichino/couchbase-traces{,-all-in-one,-ingest,-otel-collector}` | unchanged                                                       | matches `IMAGE_REGISTRY` / `IMAGE_NAMESPACE`                                                                                                                                                                                                               |
| OpenAPI `info.version`                                                                      | 2.0.0 (`packages/api/src/utils/swagger.ts:13`, generated `openapi.json:6`)      | unchanged, 2.0.0: it versions the `/api/v2` contract (Q7)       | Swagger UI, `yarn lint:openapi`, `check-openapi-sync.sh`                                                                                                                                                                                                   |
| External API route version                                                                  | `v2` (`routers/external-api/v2/index.ts:30`)                                    | unchanged (wire path)                                           | URL                                                                                                                                                                                                                                                        |
| Root `CHANGELOG.md`                                                                         | `## v0.1.0 — 2026-11-16`                                                        | `## v1.0.0 — <date>`; the 0.1.0 entry is folded into it (Q3)    | parsed into `public/whats-new.json` by `packages/app/scripts/parse-whats-new.js` at build; keys the Help sparkle (`NEXT_PUBLIC_WHATS_NEW_VERSION`)                                                                                                         |
| Package `CHANGELOG.md` files (6)                                                            | title only                                                                      | `## 1.0.0` entry                                                | changesets                                                                                                                                                                                                                                                 |
| `.changeset/config.json`                                                                    | `fixed: [api, app, otel-collector]`, `access: restricted`                       | add `ingest` to `fixed`                                         | changesets                                                                                                                                                                                                                                                 |
| Docs: `DEPLOY.md:38,113`, `LOCAL.md:21` (`:2`), `docs/development.md:71` (`:2.44.0`)        | upstream tags                                                                   | `:1` / `:1.0.0`                                                 | docs                                                                                                                                                                                                                                                       |
| OTel collector build (`docker/otel-collector/Dockerfile:2-3`)                               | `OTEL_COLLECTOR_VERSION=0.155.0`, core 1.61.0                                   | unchanged (upstream OpenTelemetry component versions, not ours) | image                                                                                                                                                                                                                                                      |
| Couchbase Server, Node SDK                                                                  | `enterprise-8.0.3`, `couchbase` 4.7.2                                           | unchanged unless B16 finds a newer 8.0.x                        | docs                                                                                                                                                                                                                                                       |
| `METADATA_SCHEMA_VERSION` (`common-utils/src/couchbase/metadataKeyspace.ts`)                | schema integer                                                                  | unchanged; independent of the release version                   | `cbt_meta` marker doc                                                                                                                                                                                                                                      |
| Git tags / GitHub releases                                                                  | none                                                                            | `v1.0.0` tag and release, on explicit instruction only          | —                                                                                                                                                                                                                                                          |
| Helm charts                                                                                 | none in this repo                                                               | —                                                               | —                                                                                                                                                                                                                                                          |

Release automation today: `.github/workflows/docker-build.yml` builds the four
images on PRs and pushes to `main` with `push: false` and `CODE_VERSION=pr-<n>`;
nothing pushes images or creates releases. `version.sh` runs
`npx changeset version`, uses macOS-only `sed -i ''`, and then tells the user to
run a `make release` target that does not exist. `npx changeset version` only
increments, so it cannot take 2.44.0 to 1.0.0.

## 4. File and module structure

New files:

| Path                                     | Purpose                                                                                       | Relates to                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `scripts/release/set-version.mjs`        | Set or check every version location from one semver input (section 5.1)                       | replaces `version.sh` logic; read by `make version`, `make ci-lint` (`--check`)       |
| `scripts/release/version-locations.mjs`  | Declarative list of version locations (section 6.1); pure data plus small readers and writers | imported by `set-version.mjs` and its test                                            |
| `scripts/__tests__/set-version.test.mjs` | `node --test` unit tests on a temp-dir fixture repo                                           | picked up by `knip.json` root entry `scripts/__tests__/*.test.mjs` and `make ci-unit` |
| `scripts/release/release-images.sh`      | buildx build and push of the four images with the tag set from section 6.2                    | called by `make release-images`; never run without the user's instruction             |
| `scripts/release/release-notes.mjs`      | Render the GitHub release body from the root `CHANGELOG.md` `## v<version>` section           | used by `gh release create --notes-file`                                              |
| `packages/api/src/utils/blockedHosts.ts` | `getBlockedServiceHosts()` for the webhook SSRF guard (B5)                                    | imported by `utils/validators.ts`; uses `parseConnStr` from common-utils              |
| `docs/release.md`                        | Runbook: how to cut a release (R8 steps), tag scheme, rollback                                | linked from `CONTRIBUTING.md`                                                         |

Changed files (by phase): see section 9. The modules relate as follows:
`set-version.mjs` owns versions; `Makefile` targets (`version`, `build-*`,
`release-images`) read `.env` values that `set-version.mjs` writes; Docker
builds receive `CODE_VERSION`; runtime surfaces (`/health`, MCP, app debug
panel, OTel `service.version`) read `CODE_VERSION` or `package.json` and never
hold their own number.

`version.sh` is deleted in R6 and `make version` calls
`node scripts/release/set-version.mjs "$(VERSION)"`.

## 5. Interfaces and function signatures

### 5.1 Version tooling (`scripts/release/*.mjs`, plain ESM, JSDoc types)

```js
/** @typedef {{ major: number, minor: number, patch: number, prerelease: string | null }} Semver */

/** Throws VersionInputError unless v matches ^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$ (no leading "v", no build metadata). */
export function parseSemver(v /* string */) /* : Semver */ {}

/** Image tags for a release (section 6.2). latest only when opts.latest && prerelease === null. */
export function imageTags(
  version /* Semver */,
  opts /* { latest: boolean } */,
) /* : string[] */ {}

/** Reads each location; returns what would change. Pure apart from reads. */
export function planVersionEdits(
  root /* string */,
  version /* string */,
) /* : Edit[] */ {}

/** Writes all edits atomically (temp file + rename per file); rolls back written files if any write fails. */
export function applyEdits(edits /* Edit[] */) /* : void */ {}

/** Returns every location whose current value differs from the expected value. Empty array = consistent. */
export function verifyVersions(
  root /* string */,
  version /* string */,
) /* : Mismatch[] */ {}
```

CLI: `node scripts/release/set-version.mjs <version> [--check] [--dry-run]`.
Exit 0 on success; 1 on mismatch (`--check`) or I/O failure; 2 on invalid input.
`make version VERSION=1.0.0` wraps it. `make ci-lint` runs
`--check "$(node -p "require('./package.json').version")"` so a partial bump
fails CI.

`release-notes.mjs`:
`node scripts/release/release-notes.mjs <version> > notes.md`;
`export function extractSection(changelog: string, version: string): string`
throws when the `## v<version>` heading is missing or empty.

`release-images.sh`:
`scripts/release/release-images.sh <version> [--latest] [--platforms linux/amd64,linux/arm64] [--images app,ingest,otel-collector]`.
The default image set is `app,ingest,otel-collector`; the script refuses
`all-in-one` for 1.0 (Q1). Requires a clean tree, `HEAD` equal to the
`v<version>` tag, and `docker buildx` logged in to `ghcr.io`.

Makefile targets: `version` (VERSION required), `release-images` (VERSION
required, LATEST=0|1), and corrected `build-app`, `build-otel-collector`,
`build-ingest`, `build-all-in-one` that tag
`${CBT_IMAGE_REPO}/${…_IMAGE_NAME}:${IMAGE_VERSION}${IMAGE_VERSION_SUB_TAG}`.

### 5.2 Webhook SSRF guard (B5)

```ts
// packages/api/src/utils/blockedHosts.ts
export type BlockedHost = {
  key: string /* host:port */;
  source: string /* env var name */;
};
export function getBlockedServiceHosts(env: NodeJS.ProcessEnv): BlockedHost[];
// validators.ts keeps WebhookUrlValidationError and its current call shape;
// BLOCKED_WEBHOOK_HOSTS becomes new Map(getBlockedServiceHosts(process.env).map(h => [h.key, h.source])).
```

Inputs: `CBT_METADATA_CONNSTR`, `CBT_COUCHBASE_CONNSTR`, every host in
`DEFAULT_CONNECTIONS`, the collector and ingest URLs the API already reads.
Couchbase hosts expand to their service ports (8091–8096, 18091–18096,
11210, 11207) because a webhook can target any of them.

### 5.3 Other small interfaces

- `packages/cli/src/utils/config.ts`:
  `CONFIG_DIR = ~/.config/couchbase-traces/cli`;
  `LEGACY_CONFIG_DIR = ~/.config/hyperdx/cli`;
  `function migrateLegacyConfig(): void` copies `session.json` once (mode 0600)
  when the new file is missing.
- `packages/app/src/components/AppNav/useWhatsNew.ts`:
  `changelogUrl(version?: string): string` returns
  `${REPO_URL}/blob/v${version}/CHANGELOG.md` or
  `${REPO_URL}/blob/main/CHANGELOG.md`.
- `packages/app/src/couchbase/serviceMap.ts`: node select gains
  `p50`/`p95`/`p99` from a per-node sorted duration array; no signature change
  to the exported builder.

## 6. Data models

### 6.1 Version locations

```js
/** @typedef {{
 *   id: string,                      // e.g. 'pkg:api', 'env:CODE_VERSION'
 *   file: string,                    // repo-relative path
 *   kind: 'json' | 'dotenv' | 'regex',
 *   pointer?: string,                // JSON pointer for kind 'json', e.g. '/version'
 *   key?: string,                    // dotenv key
 *   pattern?: string,                // regex with one capture group for kind 'regex'
 *   derive: 'full' | 'major' | 'subtag' | 'nightly' | 'fixed',
 *   fixed?: string                   // for derive 'fixed'
 * }} VersionLocation */
/** @typedef {{ location: VersionLocation, from: string, to: string }} Edit */
/** @typedef {{ location: VersionLocation, expected: string, actual: string | null }} Mismatch */
```

Derivations for `1.0.0`: `full` → `1.0.0`; `major` → `1`; `subtag` → `.0.0`;
`nightly` → `1-nightly`. Locations: root and the five lock-stepped package
manifests, `.env` (`CODE_VERSION`, `IMAGE_VERSION`, `IMAGE_VERSION_SUB_TAG`,
`IMAGE_NIGHTLY_TAG`), `.env.example` (`IMAGE_VERSION`), and the doc tag examples
in `DEPLOY.md`, `LOCAL.md`, `docs/development.md`. Package versions for
`common-utils` and `cli` are included and `hdx-eval` is excluded (Q5).
Validation: every `json` location must parse and the pointer must exist; every
`regex` must match exactly once; unknown keys in the location list fail the
test.

### 6.2 Image tags

For release `X.Y.Z` with no prerelease: `X.Y.Z`, `X.Y`, `X`, and `latest` (Q2).
For `X.Y.Z-rc.N`: only `X.Y.Z-rc.N`. Image names (fixed):
`ghcr.io/mminichino/couchbase-traces`, `-ingest`, and `-otel-collector`. The
`-all-in-one` image is not published for 1.0 (Q1); `make build-all-in-one` stays
for local builds. Every image carries `org.opencontainers.image.version=X.Y.Z`,
`org.opencontainers.image.revision=<git sha>`,
`org.opencontainers.image.source=https://github.com/mminichino/couchbase-traces`,
and `org.opencontainers.image.licenses=MIT`.

### 6.3 Changelog

Root `CHANGELOG.md` headings follow `## vX.Y.Z — YYYY-MM-DD`, then the
`<!-- cbt-release-notes version=X.Y.Z … -->` marker that `parse-whats-new.js`
strips (line 34), then the existing emoji subsections. `release-notes.mjs` and
`parse-whats-new.js` must agree on the heading grammar; a unit test feeds both
the same fixture.

### 6.4 No metadata or telemetry schema changes

No `cbt_meta` document shape changes and no `METADATA_SCHEMA_VERSION` bump are
planned. B12's service-account email domain applies to newly minted service
accounts only; existing ones keep their stored email (uniqueness keys are per
email, so old and new never collide).

## 7. Error handling

| Failure mode                                                                    | Detection                                                                | Surfacing                                                               | Recovery                                                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid version input (`v1.0.0`, `1.0`, build metadata)                         | `parseSemver` regex                                                      | exit 2 with the expected format                                         | rerun with `1.0.0`                                                                                                                                   |
| Version location drifted (file renamed, regex no longer matches, matches twice) | `planVersionEdits` match count ≠ 1                                       | exit 1 listing `id`, `file`, match count; no file written               | update `version-locations.mjs`; the unit test pins the list                                                                                          |
| Partial write (disk, permission)                                                | `applyEdits` catch                                                       | exit 1; already-renamed files restored from the in-memory originals     | rerun after fixing the cause; `--check` confirms consistency                                                                                         |
| Partial bump merged                                                             | `set-version --check` in `make ci-lint`                                  | CI lint red, listing mismatches                                         | rerun `make version VERSION=…`                                                                                                                       |
| `yarn.lock` changes after the bump                                              | `yarn install --immutable` in CI                                         | CI red                                                                  | run `yarn install`, commit the lockfile in the bump commit                                                                                           |
| Image build fails for one arch                                                  | buildx non-zero exit                                                     | `release-images.sh` stops before pushing any tag (build all, then push) | fix and rerun; nothing partial on ghcr                                                                                                               |
| Push half-succeeds (network)                                                    | per-image push exit codes                                                | script prints which images and tags landed                              | rerun is idempotent: same digest, same tags                                                                                                          |
| Tag exists, or `HEAD` is not the tag                                            | `git rev-parse v<version>` vs `HEAD`                                     | script refuses to run                                                   | never move a published tag; cut `1.0.1` instead                                                                                                      |
| `CHANGELOG.md` has no `## v1.0.0` section                                       | `release-notes.mjs` throws; `parse-whats-new.js` returns the old version | exit 1; build-time warning                                              | add the section                                                                                                                                      |
| Ported int suite fails on Couchbase                                             | `yarn ci:int` shard red                                                  | CI                                                                      | fix the SQL++ path or, where the result shape cannot match, stop and ask (AGENTS.md rule 9)                                                          |
| Re-enabled E2E flakes                                                           | shard red on Main                                                        | CI                                                                      | fix the spec; do not reintroduce `if: false`. A quarantine tag (`@quarantine`, excluded by grep-invert) needs a linked issue and the user's sign-off |
| Webhook targets an internal service                                             | `getBlockedServiceHosts` match                                           | `WebhookUrlValidationError` (4xx, not retried) as today                 | user picks another URL                                                                                                                               |
| Malformed connection string in env                                              | `ConnStrError` from `parseConnStr`                                       | logged once at startup, host skipped (same as today's `try/catch`)      | fix env                                                                                                                                              |
| CLI legacy config unreadable                                                    | `migrateLegacyConfig` catch                                              | warning, continue logged out                                            | `cbt auth login`                                                                                                                                     |

## 8. Edge cases

- **Version going down.** 2.44.0 → 1.0.0 is a decrease. Changesets and any
  "newer than" logic must not be involved. `METADATA_SCHEMA_VERSION` is
  separate, so the `cbt_meta` "schema is newer than this release" guard
  (`nodeMetadataProvision.ts:195-197`) is unaffected. The What's new sparkle
  keys on the changelog heading, so users who saw `0.1.0` get one sparkle for
  `1.0.0`.
- **Existing `:2` image references.** Nothing was published under `:2`, so no
  one can be pulling it; docs and `.env.example` are the only references and
  change in R6/R7.
- **`.env` is tracked and holds dev-only secrets.** `set-version.mjs` edits only
  the four version keys and preserves comments and order; it never writes other
  keys.
- **`CODE_VERSION` unset** (local `yarn dev`): `/health` returns `''`, the app
  falls back to `package.json`. Keep that; do not fail.
- **Prerelease (`1.0.0-rc.1`).** Allowed by `parseSemver`; `imageTags` returns
  only the exact tag; no `latest`, `1`, or `1.0`.
- **Release from a branch that is not `main`.** The tag must point at a commit
  on `main` (the merge commit of the R8 PR). The script checks
  `git merge-base --is-ancestor HEAD origin/main`.
- **CLI publish.** `packages/cli` has `publishConfig.access: public`, but
  `.changeset/config.json` has `access: restricted` and nothing runs
  `changeset publish`. No npm publish happens (Q6); the CLI ships as GitHub
  release binaries.
- **Concurrent maintainers running `make version`.** Single maintainer; the
  `--check` gate catches any divergent bump at PR time.
- **Shell environment leakage** (B4 generalizes): any `CBT_*` exported in the
  maintainer's shell can change `make` and E2E behavior. `scripts/test-e2e.sh`
  and `release-images.sh` set what they need explicitly.
- **Deferred suites with ClickHouse-only behavior.** Some cases assert
  ClickHouse SQL text or functions with no SQL++ equivalent. Port the behavior
  (inputs and result shape); replace SQL-text assertions with SQL++ text; any
  case that cannot keep its result shape is listed for the user (rule 9), never
  silently deleted.
- **Service map nodes with no spans carrying duration.** p50/p95/p99 stay NULL,
  matching the edge behavior (`ARRAY_LENGTH = 0` → NULL).

## 9. Phases

Each phase runs on its own `mm--…` branch, ends with `make ci-lint`,
`make ci-unit`, and the relevant int suites green, lands as one commit and one
PR, and is merged before the next phase starts (AGENTS.md rule 1). No phase
pushes to `main` directly.

| Phase | Scope                                                     | Items                                                                                                                                                                     | Size | Depends on                    |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------- |
| R0    | Triage and quick fixes                                    | B3, B4, B16, B14 (local-mode half), P5 (lower caps to measured)                                                                                                           | M    | —                             |
| R1    | Correctness and branding fixes                            | B5, B9, B11, B12, P2                                                                                                                                                      | M    | —                             |
| D1    | Defects: SQL++ chart renderer                             | `granularity: 'auto'` throw; duplicate `__hdx_time_bucket` alias; `HAVING` on a select alias; ambiguous `group` alias (section 9.1)                                       | M    | R1                            |
| D2    | Defects: MCP query and analysis tools                     | `count()`, `startsWith`, `toUnixTimestamp64Milli` in event patterns, denoise, emerging signals, service health; ClickHouse examples in tool descriptions (section 9.1)    | M    | D1                            |
| D9    | Defects: builder expressions with `Map['k']` syntax       | Found in D2 (section 9.1)                                                                                                                                                 | M    | D2                            |
| D8    | Defects: MCP reads miss freshly written rows (flaky)      | Found in D2 (section 9.1)                                                                                                                                                 | S    | D2                            |
| D2b   | User-visible "legacy store" text (B17)                    | Rewrite user-visible strings (CLI help, OpenAPI, MCP prompts, UI, errors) and add a CI guard (section 9.1)                                                                | M    | D9                            |
| D3    | Defects: MCP trace tools                                  | ClickHouse `{x:Type}` params, `toDateTime64`, `count()`, `toDate` in `waterfall.ts` and `breakdown.ts` (section 9.1)                                                      | M    | D1                            |
| D4    | Defects: schema inference on empty collections            | INFER "No documents found" fails describe tools and alert column lookups (section 9.1)                                                                                    | S    | R1                            |
| D5    | Defects: onboarding checklist                             | ClickHouse `system.tables` row-count probe sent to Couchbase on every page (section 9.1)                                                                                  | S    | R1                            |
| D6    | Defects: alert connection resolution (investigate)        | 21 alert runs fail with "A connection id is required for Couchbase queries" (section 9.1)                                                                                 | S    | R1                            |
| D7    | Defects: hidden formula operands returned as null columns | Found in D1 (section 9.1)                                                                                                                                                 | S    | D1                            |
| D10   | Defects: page queries and alert detail not-found          | `/service-map`, `/kubernetes`, `/llm`, `/services`, `/sessions` SQL++ failures; `/alerts/[id]` 400 on an unknown id (section 9.1)                                         | M    | D6, D7                        |
| D11   | Defects: alias WITH clauses in SQL++ (with D16, Q35)      | Found in D6 (section 9.1); D16 grouped-ratio `share_of_total` as its own commit in the same PR                                                                            | S    | D6, D10                       |
| D12   | Defects: grouped alert history order                      | Found in D6 (section 9.1); product fix (Q31)                                                                                                                              | S    | —                             |
| D13   | Defects: concurrent invite race (500)                     | Found in D6 (section 9.1)                                                                                                                                                 | S    | —                             |
| D17   | Defects: multi-series HAVING and ORDER BY (Q36)           | Found in D16 (section 9.1); own PR after D13; fixed, Q41                                                                                                                  | S    | D13                           |
| D18   | Defects: intermittent common-utils live tests (Q37)       | Found in D12 (section 9.1); seed lag fixed with D13; SDK timeout remainder in its own PR before D17 (Q39)                                                                 | S    | —                             |
| D19   | Defects: `make ci-int` exits 1 after every test passed    | Found in D13 (section 9.1); with the D18 remainder (Q40)                                                                                                                  | S    | —                             |
| D20   | Defects: mixed gauge/histogram charts drop scalar groups  | Found in D17 (section 9.1); next phase after D17 (Q42); fixed                                                                                                             | S    | D17                           |
| D21   | Defects: cumulative histogram quantile zero-delta row     | Found in D20 (section 9.1); own PR before R2a (Q43); fixed                                                                                                                | S    | D20                           |
| D22   | Defects: exp-histogram count partitions by a select alias | Found in D21 (section 9.1); own PR before R2a (Q44); fixed                                                                                                                | S    | D21                           |
| D23   | Defects: metric source CTEs omit the warm-up window       | Found in D22 (section 9.1); own PR before R2a (Q45); fixed                                                                                                                | M    | D22                           |
| D24   | Defects: metric charts ignore `where`; histograms `filters`| Found in D23 (section 9.1); placement pending (Q46)                                                                                                                       | M    | —                             |
| D25   | Defects: Sum select alias is not defaulted to `Value`     | Found in D23 (section 9.1); placement pending (Q47)                                                                                                                       | S    | —                             |
| D26   | Defects: range end is exclusive where upstream is inclusive| Found in D23 (section 9.1); placement pending (Q48)                                                                                                                       | M    | —                             |
| D14   | Dev tooling: live-test port offset fallback               | Found in D7 (section 9.1)                                                                                                                                                 | S    | —                             |
| R2a   | Port deferred int suites: internal and external API       | B1 (10 suites: `routers/api/{dashboard,iac,sources,connections}`, `routers/external-api/{charts,search,sources,sources-crud,connections}`, `middleware/queryAttribution`) | L    | D1                            |
| R2b   | Port deferred int suites: alerts                          | B1 (5 suites: `checkAlerts`, `multiChannelAlerts`, `renderAlertTemplate`, `singleInvocationAlert`, `providers/default`; 335 tests, 93 failing per R0)                     | L    | R2c, D1, D4, D6               |
| R2c   | Port deferred int suites: MCP                             | B1 (8 suites under `mcp/__tests__/`; 287 tests, 139 failing per R0)                                                                                                       | L    | R2a, D1–D4                    |
| R3    | Service map node latency                                  | B6                                                                                                                                                                        | M    | —                             |
| R4    | Fix failing Playwright specs on the Couchbase stack       | B2 (spec and app fixes); D15 Couchbase E2E seed rows (Q34)                                                                                                                | L    | R2a, D5                       |
| R5    | Re-enable full-stack E2E on Main                          | B2 (restore `e2e-tests` `workflow_call` and report aggregator in `main.yml`)                                                                                              | S    | R4                            |
| R6    | Release tooling                                           | B7, B8, B10; delete `version.sh`; add `ingest` to changesets `fixed`                                                                                                      | M    | —                             |
| R7    | Docs and acceptance re-run                                | B13, B14, B15; `docs/release.md`                                                                                                                                          | M    | R1–R6, D1–D6, D2b             |
| R8    | Release v1.0.0                                            | version bump, changelog, tag, images, GitHub release                                                                                                                      | S    | R7, explicit user instruction |

Order (user decisions 2026-11-19 and 2026-11-20): R1, then the defect-fix phases
D1, D2, D9 (with D8, Q14/Q15), D2b (B17), D3–D7, D10 (Q28), then D11 and D12
(proposed after D10, pending decision), then R2a, R2c, R2b. R3 and R6 are
independent and can land at any point. Product defects found in R0 get their own
PRs ahead of the test-porting phases. R2 no longer fixes product bugs; a defect
R2 finds while porting gets its own PR first (D7 onward).

### 9.1 Defect-fix phases (D1–D6, D2b)

Each D phase is one PR on an `mm--v1-dN-…` branch. Evidence is from the R0 runs
(section 14). In every D phase:

- **Proof.** Locally remove the affected suites from `deferredChIntSuites`, run
  them, and list in the PR which previously failing tests now pass and which
  still fail. Remaining failures must be class T or U, not this defect. The
  suites stay on the deferred list until their R2 phase.
- **Tests.** Add unit tests (renderer output or tool SQL) that fail before the
  fix and pass after. They run in `make ci-unit`, so each fix is guarded before
  R2 re-enables the integration suites.
- **Result shape.** Keep the upstream result shape (rule 6). If SQL++ cannot
  produce it, stop and ask (rule 9).

#### D1: SQL++ chart renderer (size M)

Scope: `packages/common-utils/src/couchbase/render/*` and
`packages/common-utils/src/couchbase/time.ts`.

| Defect                        | Evidence (R0)                                                                                                                                                                                    | Fix                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `granularity: 'auto'` throws  | `parseGranularity` (`couchbase/time.ts:31`) only accepts `"<n> <unit>"`. `POST /api/v2/charts/series` returned 500 "Unsupported granularity: auto" 14 times; `cbt_query_tile` fails the same way | Resolve `auto` from the date range before rendering, the way upstream `convertDateRangeToGranularityString` does. `parseGranularity` keeps rejecting anything else |
| Duplicate `__hdx_time_bucket` | "Ambiguous reference to field '\_\_hdx_time_bucket'" in multi-series external charts (4) and `cbt_timeseries` (2)                                                                                | Emit the bucket expression once: alias it in the inner select and reference the alias outside                                                                      |
| `HAVING` on a select alias    | `cbt_table` with `having: 'n > 1'` fails with "Expression (1 < (`d`.`n`)) must depend only on group keys or aggregates" (pie and bar shapes)                                                     | Rewrite alias references in `having` to their aggregate expressions, or wrap the grouped query and filter outside                                                  |
| Ambiguous `group` alias       | "Ambiguous reference to field 'group'" in `cbt_query_tile` (2)                                                                                                                                   | Same alias rule as the time bucket                                                                                                                                 |

Acceptance: a renderer unit test per row; the 9 P failures in
`routers/external-api/__tests__/charts` pass locally; the `having` and time
bucket cases in `mcp/__tests__/queryTool` pass locally.

#### D2: MCP query and analysis tools (size M)

Scope: `packages/api/src/mcp/tools/query/*`.

| Defect                                 | Evidence (R0)                                                                                                                                                                         | Fix                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count()` in tool-built selects        | `runEventPatterns.ts:218` and `denoise.ts:132` pass `select: 'count() as total'`. "Number of arguments to function count must be 1": 34 event-pattern calls, 4 emerging-signals calls | Use the builder aggregate (`aggFn: 'count'`) or `COUNT(*)` so the SQL++ renderer owns it                                                                   |
| ClickHouse functions in service health | "Invalid function startsWith" (12 calls); `serviceHealth/errorGroups.ts:70` builds `toUnixTimestamp64Milli(toDateTime64(…))`; more in `serviceHealth/queries.ts`                      | SQL++ equivalents through `common-utils/src/couchbase/fn/*` (for example `POSITION(s, p) = 0`, `STR_TO_MILLIS`)                                            |
| Tool descriptions teach ClickHouse SQL | `sqlDescriptions.ts:10,30,33` show `toDateTime64` and `count()`                                                                                                                       | Rewrite the examples in SQL++ with the `$__timeInterval` and `$__timeFilter` macros. Agents copy these examples, so wrong ones turn into failed tool calls |

Acceptance: `mcp/__tests__/emergingSignalsTool` and `serviceHealthTool` pass
locally; the `cbt_event_patterns` cases in `queryTool` pass locally; a unit test
asserts that SQL built by these tools contains no ClickHouse-only function (the
list lives in `common-utils/src/couchbase/functions.ts`).

#### D2b: User-visible "legacy store" text (B17, size M)

Decided 2026-11-20: blocks 1.0 as its own phase, after D2 (D2 rewrites the MCP
tool descriptions that teach ClickHouse syntax; D2b then cleans the remaining
wording without touching the same lines twice).

Evidence: a mechanical rebrand replaced "ClickHouse" with "legacy store". R1
counted 367 hits in 156 non-test files. User-visible ones include CLI help
(`cbt connections`: "List legacy store connections", `packages/cli/src/cli.tsx`
12 hits), the OpenAPI document (`packages/api/openapi.json`, 23, generated from
the route JSDoc in `routers/external-api/v2/*`), MCP tool and prompt text
(`mcp/tools/query/table.ts` 10, `mcp/prompts/dashboards/content.ts:974` "legacy
store parameterized syntax"), app UI strings (`DBSearchPageFilters/utils.ts`,
`app/src/utils.ts`), and CLI error messages (`cli/src/utils/parseError.ts`).

Scope:

- Rewrite every user-visible string: UI text, CLI help and errors, API error
  messages, OpenAPI descriptions (through the JSDoc, then `yarn docgen`), MCP
  tool descriptions, prompts and resources, and package READMEs. Use "Couchbase"
  for the data store, or "SQL++" for syntax. Where the text describes behavior
  that only ClickHouse had (for example map columns returning `''` for missing
  keys), rewrite it to describe the Couchbase behavior, checked against the
  running cluster, not just reworded.
- Code comments and identifiers: fix the ones next to edited strings; the rest
  stay with P4.
- Add a guard: `scripts/ci/check-legacy-store-text.mjs` (node test under
  `scripts/__tests__/`, run by `make ci-lint`) that fails when `/legacy store/i`
  appears in a string literal, JSX text, or template literal in
  `packages/{app,api,cli,common-utils}/src` (excluding `__tests__`), in
  `packages/api/openapi.json`, or in a package `README.md`. Comments are not
  scanned. An allowlist file with a reason per entry covers any deliberate use.

Acceptance: the guard passes and is part of `make ci-lint`; a test plants the
phrase in a fixture string and sees the guard fail; `openapi.json` in sync;
`rg -i "legacy store" packages/*/src --glob '!**/__tests__/**'` lists only
comments; MCP prompt snapshot tests updated with reviewed text;
`cbt connections --help` reads "List Couchbase connections".

Depends on: D2. Size: M.

#### D3: MCP trace tools (size M)

Scope: `packages/api/src/mcp/tools/trace/*`.

| Defect                      | Evidence (R0)                                                                                                                                                                                 | Fix                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| ClickHouse query parameters | `waterfall.ts` uses `{db:Identifier}` and `{tid:String}`: "syntax error … near 'ROM {db:Identifier}.'" (26 calls). `breakdown.ts` uses `{name:String}`: "… String (reserved word)" (10 calls) | SQL++ named parameters (`$tid`) and the backtick identifier helper (rule 4) |
| ClickHouse functions        | `waterfall.ts:254-255` `toUnixTimestamp64Milli(toDateTime64(…))`; `breakdown.ts:162` `count()`; "Invalid function toDate" (2 calls)                                                           | SQL++ equivalents through `common-utils/src/couchbase/fn/*`                 |

Acceptance: the 21 P failures in `mcp/__tests__/trace` pass locally; a unit test
renders the waterfall and breakdown SQL and checks it uses named parameters and
quoted identifiers.

Done (2026-11-21, `mm--v1-d3-mcp-trace`): `trace` 29 → 1 failing of 40 on a
fresh stack; the one left also fails on `main` and depends on suite order (see
the D3 port notes). Builders in `common-utils/src/couchbase/traceQueries.ts`.

#### D4: Schema inference on empty collections (size S)

Evidence: `INFER` on an empty collection fails with error 7014 "No documents
found, unable to infer schema". In R0 it broke `cbt_describe_source` 10 times
and `cbt_describe_metric` 4 times, and alert evaluation logged it 16 times
(before the threshold check). Upstream `DESCRIBE TABLE` on an empty table
returns columns, so an empty collection must not be an error.

Fix: treat 7014 as "no inferred fields" in the column-metadata path
(`inferFields` / `getColumns` in `common-utils`). Callers fall back to the
source's configured expressions. An alert on an empty window evaluates with zero
rows, as upstream does.

Acceptance: unit test with a mocked 7014 response; the 7 P failures in
`mcp/__tests__/sources` pass locally; an alert on an empty collection ends in
`OK`, not an error.

Done (2026-11-21, `mm--v1-d4-empty-infer`): 7014 no longer reaches any caller
(22 logged before, 0 after); one predicate, `isEmptyInferError`, in
`Metadata.inferFields`. `sources` 16 → 13, `checkAlerts` 27 → 24 on a fresh
stack; an alert on an empty `otel_logs` ends in `OK` (`make ci-int`). Of the 7 P
`sources` failures, the 3 that hit 7014 pass. The other 4, and 9 more, are the
metric tools' leftover ClickHouse `sqlExpr` SQL, or describe cases that expect
DDL columns on an empty collection. Both are open (see the D4 port notes).

#### D5: Onboarding checklist probe (size S)

Scope: `packages/app/src/OnboardingChecklist/useOnboardingCompletion.ts:70-90`.

Evidence: the hook asks for `sum(total_rows)` from `system.tables` with
`table = '…' AND database = '…'` filters. Couchbase returns 400 "syntax error …
at: database (reserved word)", and the browser logs it on every page. That
causes 22 of the 24 `route-smoke.spec.ts` failures (section 14.2).

Fix: check each source's collection with a bounded SQL++ query (for example
`SELECT RAW 1 FROM <keyspace> LIMIT 1` through the existing Couchbase data
layer), keeping the "has data" semantics.

Acceptance: hook unit test; `./scripts/test-e2e.sh --quiet route-smoke` has no
failures from this probe.

#### D6: Alert connection resolution (investigate first, size S)

Evidence: 21 alert evaluations in `checkAlerts.int.test.ts` log "A connection id
is required for Couchbase queries"
(`common-utils/src/couchbase/browser.ts:164`).

Work: find out whether the alert task fails to pass the source's connection id
(product defect) or the test sources have no connection (test defect). If it is
the product, fix it and add a unit test in `tasks/checkAlerts`. If it is the
test, write that down here, close D6 with no code change, and leave the fixture
to R2b.

Acceptance: root cause recorded in `docs/port-notes.md`; product fix and unit
test if one applies.

Result (2026-11-21): a product defect. Every saved-search alert with a Lucene
filter hit it: the sample rows in the notification body (and the alias WITH
clauses) were rendered with `connection: ''`, so the column lookup failed, and
the message went out with no sample lines. Fixed by passing `source.connection`;
the sample query also goes back to upstream's CSV lines. See
`docs/port-notes.md` (D6). Found while doing it: D11 and D12 below.

#### D7: Hidden formula operands come back as null columns (found in D1, size S)

Evidence: `mcp/__tests__/dashboards/queryTile` "should save and query a metric
formula tile" got past the `granularity: 'auto'` throw in D1 and now fails on
`expect(rows[0]).not.toHaveProperty('Errors')`: the formula value is right (5),
but the row also has `Errors: null` and `Requests: null`. The rendered SQL++
projects only the formula and the time bucket, so the null columns are added
after the query. `couchbaseResultColumnNames`
(`couchbase/render/postprocess.ts`) still lists both operand aliases (and not
the formula alias) when `showOperandSeries` is false; the first step is to find
which consumer of that list pads rows with it.

Fix: make the column hints match the projection when operands are hidden.
Acceptance: a unit test on `couchbaseResultColumnNames`; the queryTile case
passes locally.

Depends on: D1. Size: S.

Placement (Q12): after D6, not pulled forward.

Result (2026-11-21): the pad is `inferMeta` (`couchbase/inferMeta.ts`). It seeds
the result columns from the `columns` hint and `encodeRow` writes `null` for
each hinted column a row lacks. `couchbaseResultColumnNames` listed the operand
aliases whatever `showOperandSeries` was, and never the formula columns. It now
follows the projection: operands only when shown, then each formula's name as
the renderers derive it (alias or expression, `__<index>` on a collision). See
`docs/port-notes.md` (D7).

#### D10: Page queries and alert detail not-found (found in D5, size M)

Evidence: the D5 route-smoke run (18 pass, 6 fail) shows SQL++ errors from page
queries, read from the Playwright traces of `/api/couchbase/query`:

- `/service-map`: `Invalid function CRC32` (code 3000).
- `/kubernetes`: dotted aliases such as `` `avg(k8s.pod.cpu.utilization)` `` and
  the `'k8s.pod.cpu.utilization'` metric name break the parse (code 3000).
- `/llm`: ClickHouse `arraySum(arrayMap(k -> …))`, `sumMap`, `mapContains`,
  `toFloat64OrZero`, `toUInt64`, `greatest` in the LLM preset expressions.
- `/services`: a select alias reused in the same SELECT
  (`error_requests / total_requests`, code 4210 "must depend only on group keys
  or aggregates") and `toDateTime` (code 3000).
- `/sessions`: "Subquery in FROM clause must have an alias" (code 3000).
- `/alerts/[alertId]`: the smoke fixture id `smoke-alert` is not an ObjectId;
  `GET /api/alerts/smoke-alert` returns 400 (Zod "Invalid id") and the page
  surfaces it.

Scope:

1. Translate or rewrite each failing expression in the SQL++ renderer, or in the
   preset that emits it when the preset text is ClickHouse-specific, keeping the
   upstream result shape (rule 6). Stop and ask (rule 9) if one cannot keep its
   shape.
2. Alerts (Q29), both parts: the route-smoke fixture uses a real, valid alert id
   (`port/acceptance/lib/routes.mjs` and the generated `route-smoke.spec.ts`),
   and the alert detail page shows a not-found state for an invalid or unknown
   id instead of surfacing the 400. It lives here, not in D6: D6 is alert
   evaluation connection resolution, which shares no code with the detail page.

Acceptance: `route-smoke` passes for `/service-map`, `/kubernetes`, `/llm`,
`/services`, `/sessions` and `/alerts/[alertId]` (24 of 24 with no console
errors); a live-cluster case (`port/couchbase-test`) per fixed query shape; a
unit test for the alert page not-found state (invalid id and unknown valid id).

Depends on: D6, D7. Size: M. Placement (Q28): after D6 and D7, before R2a.

Result (2026-11-21): route-smoke 25 of 25 (24 routes plus an "Alert not found"
entry for a malformed id), no console errors. Fixed in the shared renderer and
the presets that emit ClickHouse text: CRC-32 via `HASHBYTES`, whole-name
quoting for dotted aliases, select aliases resolved within the SELECT and in
GROUP BY, per-dialect LLM expressions, aliased FROM subqueries, flat
`SELECT cte.*`, `IN (SELECT RAW …)`, and disjoint parameter names when separate
renders are spliced into one statement. Two of D6's three metric tile alert
cases now pass. Still failing, not query defects: the `kubernetes` and
`sessions` page specs need k8s metric rows and OTel-SDK session spans, replay
rows and log events in the Couchbase E2E seed (D15), and the grouped-ratio
metric tile alert computes `share_of_total` per group (D16). See
`docs/port-notes.md` (D10).

#### D11: Alias WITH clauses render ClickHouse scalar WITH (found in D6, size S)

Evidence: R2b `checkAlerts` "SAVED_SEARCH alert with alias in select and where"
(and "multiple aliases") record `OK` instead of `ALERT`. Once D6 lets the alias
clauses render, the alert query starts
``WITH (toString(Body)) AS `body` SELECT COUNT(*) …``, a ClickHouse scalar WITH,
and Couchbase returns "syntax error - line 1, column 6, near 'WITH '" (the
`isSubquery: false` branch in `couchbase/render/with.ts`). Before D6 the clauses
were dropped (warn log), so the WHERE resolved `body` to an unknown field
(`FALSE`).

Fix: render non-subquery aliases so the alias is usable in WHERE (for example
`LET` after FROM, or inlining the expression where the alias is referenced),
with SQL++ functions for the expression (`toString` is ClickHouse). Acceptance:
a renderer unit test; both R2b alias cases pass locally. Depends on: D6.

Result (2026-11-22): expression aliases render as a SQL++ `LET` after FROM
(subquery clauses stay CTEs), alias-to-alias references are inlined with D10's
select-alias resolver, and Lucene resolves a LET alias before columns. Both R2b
alias cases pass; D16 ships in the same PR as its own commit (Q35). See
`docs/port-notes.md` (D11, D16).

#### D12: Grouped alert history order is not stable (found in D6, size S)

Evidence: `checkAlerts` "INLINE alert (group by) - notifies per group" expects
history groups in `['ServiceName:api', 'ServiceName:worker']` order and fails
about 1 run in 5, on `main` and on the D6 branch alike (5 runs each,
`-t 'notifies per group'`). Both rows share `createdAt`, so `buildHistoryRows`
orders them by random document id. Upstream's Mongo ObjectIds sort by insertion
order.

Fix (Q31, product): alert history rows get a stable insertion order (a monotonic
sequence or tie-breaker written with each row), and `buildHistoryRows` sorts on
it after `createdAt`, so same-timestamp rows read back in insertion order.
Acceptance: a unit test with same-`createdAt` rows; the int case passes
repeatedly. Depends on: none.

Result (2026-11-22, `mm--v1-d12-history-order`): two causes, both fixed.
`processAlert` wrote a bucket's group rows in the order the data query returned
them (SQL++ `GROUP BY` output order is unspecified), and every history reader
broke `createdAt` ties by document key or not at all (`ARRAY_AGG` order is
unspecified too). Rows now carry `seq`, a per-process strictly increasing
microsecond stamp taken at write time; all six readers order same-`createdAt`
rows by `(seq, key)`, and `processAlert` writes an evaluation's rows in byte
order of the group key. The int case passes 30 of 30 runs (21 of 30 before).
Rows written before `seq` keep key order.

#### D13: Concurrent invites of one email can return 500 (found in D6, size S)

Evidence: in one full `make ci-int` run on the D6 branch, `team.int.test.ts`
"handles concurrent invites for the same email idempotently" got 500 from one
request ("Duplicate key: invite_member"); 10 isolated runs passed.
`teamInvites.getOrCreate` loses the `(team, email)` claim to a concurrent
request, then reads the invite back before the winner has inserted it, finds
nothing and rethrows the `DuplicateKeyError`.

Fix (Q32): on a lost claim, wait briefly (bounded retry) for the winner's invite
and return it, idempotent like upstream; no 409. Acceptance: a unit test with a
delayed winner insert; the int case passes under load. Depends on: none.

Result (2026-11-22, `mm--v1-d13-invite-race`): two races in the gap between the
winner's member claim and its invite insert. The loser's stale-owner check
(`ownerExists`) saw no invite yet and either rethrew (the 500), or took the live
claim over, which left two invites for one email. Now the check polls the
owner's invite by KV get, with 10-200 ms backoff, for up to
`INVITE_CLAIM_WAIT_MS` (2 s) before treating the claim as abandoned. A winner
that stalls past that bound re-checks its claim after its insert, deletes its
invite and token claim, and returns the invite of the request that took over.
Tests: unit cases with a 50 ms delayed insert (20 parallel), an abandoned claim,
and a winner stalled past the bound (each red on the old logic except the
abandoned claim, which pins the bound), 30 of 30 repeats; the HTTP int cases now
run 20 in parallel; a live-cluster case runs 30 rounds of 20 concurrent creates.
On an unloaded local stack the int and live cases also passed on the old code
(30 of 30), so the race reproduces only with a delayed insert, as in the unit
tests.

#### D14: Live-test port offset fallback cannot reach KV (found in D7, size S)

Evidence (D7): two `port/couchbase-test/run.sh` runs right after `make ci-int`
timed out on the live cluster, one at offset 20000 (95 failures) and one at
offset 0 (19). Decision Q33: not a 1.0 blocker; fix it as a separate commit at
the start of the D10 PR.

Result (D10): the offset is not the cause. With 8091 held by another process,
`run.sh` moves to offset 20000 and passes 58 + 55 + 4, and so does a run started
while the CI stack is coming down. In both D7 runs the node stopped answering
partway through, after earlier suites had passed (at offset 0 too; there the
later suites recovered), so the node went away while serving. `run.sh` now names
the process or container on a busy port and, on a failed run, logs the node's
state, memory, open ports and babysitter restarts before cleanup removes the
container. See `docs/port-notes.md` (D14).

#### D15: Couchbase E2E seed lacks k8s and OTel-SDK session rows (found in D10, size S)

Evidence: after D10 the `/kubernetes` and `/sessions` queries succeed, but
`kubernetes.spec.ts` fails 12 of 13 and `sessions.spec.ts` 5 of 7 on empty
tables: `seed-couchbase.ts` writes no k8s metric or event rows, and for the OTel
browser SDK sessions only the `otel_sessions` log documents (no spans, replay
rows or browser log events). Fix: seed the rows the upstream ClickHouse seed
writes for those specs. Placement (Q34): fixed with the Playwright work in R4,
which owns its acceptance.

#### D16: Grouped ratio metric tile alert, share of total (found in D10, size S)

Evidence: `checkAlerts` "TILE alert (metrics, grouped ratio) - honors ratioMode
share_of_total" now renders (it failed on a dotted alias before D10) and gets
0.5 where 0.125 is expected, so the denominator is per group instead of across
groups. Placement (Q35): fixed with D11 in the same PR, as its own commit; both
are alert query rendering.

Result (2026-11-22): the SQL++ multi-series renderer ignored `ratioMode`. The
denominator is now `SUM(…) OVER (PARTITION BY __hdx_time_bucket)` for
`share_of_total`, as upstream; the R2b case passes.

#### D17: Multi-series metric charts drop HAVING and ORDER BY (found in D16, size S)

Evidence: `couchbase/render/metrics/multiSeries.ts` renders each branch with
`having: undefined, orderBy: undefined` and the joined statement adds neither,
so a multi-series or ratio metric tile ignores both. Upstream applies them to
the joined result (and filters a `share_of_total` HAVING through a wrapper,
since a window function cannot appear in HAVING). No deferred case covers it
yet. Decision Q36: its own PR, right after D13.

Result (2026-11-22, `mm--v1-d17-multi-series-having-order`, Q41): fixed.

- Root cause confirmed against current source. As upstream, each branch
  renders without `having`, `orderBy` and `limit`, but the joined statement
  added only the time-bucket ORDER BY and a literal `LIMIT n`, dropping the
  user's HAVING, ORDER BY and the OFFSET.
- New `render/metrics/multiSeriesOuter.ts` applies them once, to the joined
  result. HAVING is a `WHERE` on a `SELECT d.* FROM (…) AS d` wrapper for
  every shape, not only `share_of_total`: checked on 8.0.3, SQL++ HAVING
  rejects select aliases ("must depend only on group keys or aggregates"),
  window aggregates ("Window Aggregates not allowed in HAVING"), and is a
  syntax error with no GROUP BY (the number shape). A `"name"` naming an
  output column (ClickHouse quoting) reads that column. Rows are rebuilt in
  hint order, so the wrapper does not change the result shape.
- ORDER BY is the time bucket first, then the user's sort (upstream). A sort
  item naming a group-by expression or alias (HDX-5202) reads the named
  group column the branches already project, or `` `group`[i] `` (0-based)
  when groups travel packed for histogram branches. Upstream needs
  `__hdx_sort_<n>` companion columns because ClickHouse names those columns
  itself.
- LIMIT and OFFSET are named parameters on the outermost statement.
- Tests: `render/__tests__/multiSeriesOuter.test.ts` and
  `multiSeriesSort.test.ts` port upstream's "outer HAVING / ORDER BY /
  LIMIT" cases with the same inputs (21 cases, 18 failed before the fix), and
  `couchbase/__tests__/multiSeriesOuter.couchbase.int.test.ts` runs 7 shapes
  on a live cluster (7 of 7 failed on the old renderer).
- Found here, not fixed: D20.

#### D20: Mixed gauge and histogram charts drop scalar group columns (found in D17, size S)

Evidence: with a group-by, `multiSeries.ts` gives a gauge or sum branch only
`[] AS group` when any branch is histogram-class, so its group columns are
dropped and every scalar row of a bucket joins into one row. Upstream keeps
the scalar branch's group columns, NULL-pads them in histogram branches, and
keeps the two classes' rows apart. D17 sorts such a chart on `` `group`[i] ``,
which matches what the branches project today. Placement (Q42): the next
phase, right after D17.

Result (2026-11-23, `mm--v1-d20-mixed-histogram-groups`): fixed.

- Root cause confirmed against current source and upstream `f172a489c818`
  (`renderChartConfig.ts`, the branch wrappers of the composed query).
- A gauge or sum branch now projects its group columns and pads `group`
  with `[]`; a histogram branch pads each scalar group column with `NULL`;
  the joined statement groups by both. SQL++ UNION ALL merges rows by field
  name, not position, so each pad takes its column's own name instead of
  upstream's `__hdx_group_pad_<n>`. An all-histogram chart is unchanged.
- A sort on a group-by of a mixed chart reads the scalar group column with
  `NULLS LAST`, so histogram rows sort last as upstream's NULL companion
  slots do in ClickHouse (SQL++ puts NULL first ascending). D17's
  `` `group`[i] `` sort now applies to all-histogram charts only.
- Result-column hints list the scalar group columns unless every series is
  histogram-class (upstream "packs every group-by into one group column").
- Tests: `render/__tests__/multiSeriesMixedGroups.test.ts` ports upstream's
  "pads group columns across gauge and histogram branch classes" and the
  mixed-class sort, HAVING and column-placement cases (11 cases, 8 failed
  before the fix). Live: `multiSeriesMixedGroups.couchbase.int.test.ts`
  ports upstream's `grpmix` int cases plus a two-service gauge beside a
  histogram (5 of 5 failed before the fix).
- Found here, not fixed: D21.

#### D21: Cumulative histogram quantile emits a NULL row for a zero-delta bucket (found in D20, size S)

Evidence: upstream's `grpmix.latency` fixture seeds a cumulative zero
baseline at minute 0, and its quantile emits no row there (`WHERE total > 0`).
The SQL++ quantile emits a row with a NULL value for that bucket, so a chart
gets an extra point-free row. Same values, one extra row. The D20 live test
seeds the minute-1 counts as one delta point to stay on its own defect.
Placement (Q43): its own PR, before R2a.

Result (2026-11-23, `mm--v1-d21-histogram-zero-bucket`): fixed, with three
related defects found while porting upstream's histogram int cases (same
renderer, same PR). Wrong values, not only the extra row:

- Empty buckets: the quantile now drops a bucket or group with no
  observations (upstream `WHERE length(point) > 1 AND total > 0`) through
  a wrapper on the `metrics` CTE, so the number shape needs no GROUP BY.
- Series partition: the delta `LAG` windows partitioned by the select's own
  `AttributesHash` alias, which a SQL++ window clause cannot see (it reads
  as MISSING, checked on 8.0.3), so every series of a metric shared one
  partition and subtracted each other's counts. Histogram quantile and
  count now partition by the expressions (group, attributes hash,
  temporality; count adds the bucket layout, as upstream).
- First point: a cumulative series' first visible point is now the zero
  baseline (upstream `arrayWithConstant(…, 0)`), not its raw counts, and a
  bucket-layout change takes the new counts as they are.
- Interpolation: `histogramQuantile` now follows upstream (and the JS
  `histogramQuantileValue`) for the first bucket and the +Inf overflow
  bucket; the old form returned 0 or the 1e12 sentinel there. Buckets sort
  by index as `[i, bound, rate]` tuples, since `ARRAY_SORT` orders objects
  by field name and put the NULL overflow bound first.
- Tests: `render/__tests__/histogramQuantile.test.ts` (9, all failed before)
  and `histogramQuantile.couchbase.int.test.ts`, which ports upstream's
  "Query Metrics - Histogram" two-timestamp, first-visible-baseline,
  non-timeseries grouped and reset cases plus a bucket-layout change (8; 7
  failed before). The D20 live test is back on upstream's cumulative seed
  (3 of its 5 cases fail without this fix). `phase6.couchbase.int.test.ts`
  expected 5 for p50 of [1, 1, 1] over [0, 10, 20]; upstream gives 7.5.
- Found here, not fixed: D22.

#### D22: Exponential-histogram count partitions deltas by a select alias (found in D21, size S)

Evidence: `render/metrics/expHistogram.ts` count computes its `LAG` windows
with `PARTITION BY \`group\`, MetricName, series_key, …`, where `group` and
`series_key` are aliases of the same SELECT. A window clause reads them as
MISSING (checked on 8.0.3), so every series of the metric shares one
partition and a cumulative series subtracts another series' count: the D21
partition defect, on the exponential-histogram count. The quantile path is
not affected (it partitions in a later CTE). Placement (Q44): its own PR,
before R2a.

Result (2026-11-23, `mm--v1-d22-exp-histogram-count-partition`): fixed.
The count's four `LAG` windows now partition by D21's `seriesPartition`
expressions plus `d.MetricName` (upstream `group, MetricName, attr_hash,
AggregationTemporality`). Tests: `render/metrics/__tests__/
expHistogramPartition.test.ts` (3; all failed before) and
`expHistogramCount.couchbase.int.test.ts`, which ports upstream's eight
exponential-histogram count cases that need no warm-up window (2 failed
before: the two with more than one series, i.e. the grouped sum and the
non-timeseries reset modes). Single-series cases already passed; the
Phase 7a suite's count cases each seed one cumulative series (its
two-series cases only test the quantile), so it never caught this.
- Found here, not fixed: D23.

#### D23: Metric source CTEs omit upstream's one-interval warm-up window (found in D22, size M)

Evidence: upstream renders the Sum, histogram, and exponential-histogram
source `WHERE` with `includedDataInterval` set to the chart granularity,
which reaches one interval before (and after) the requested range so the
first visible bucket has a predecessor to subtract. The port's
`sourceWhereClause` (shared by all three) filters to the requested range.
Live, upstream's "subtracts cumulative counts using a warm-up point
outside the requested range" returns 0 at the first bucket where upstream
returns 1. Applies to timeseries charts only (no granularity, no warm-up
upstream either). Needs care that the widened rows feed the deltas but
not the output buckets. Placement (Q45): its own PR, before R2a.

Result (2026-11-23, `mm--v1-d23-metric-warmup-window`): fixed. A new
`render/metrics/sourceWhere.ts` (moved out of `histogram.ts`) widens the
Sum, histogram, and exponential-histogram source scan to
[bucket(start) − I, bucket(end) + I], where I is upstream's
`includedDataInterval` (the chart granularity, 'auto' sized from the
range); buckets align as `timeBucketExpr` does (Monday weeks, UTC months).
Gauge and non-timeseries charts scan the requested range, as upstream. The
outer query keeps the requested range on the time bucket, so the look-back
and look-ahead buckets feed the deltas but are not returned: histograms
already kept it; Sum now does (it had `dateRange: undefined`). That outer
filter binds ISO bounds, because bucket aliases are ISO strings even for an
`epoch_millis` source; before, a histogram on such a source compared a
string with a number and returned no rows. The widened end keeps the
port's exclusive `<` (upstream `<=` comes from its default-inclusive end,
D26); a point on that bound lands in a bucket past the range, so output is
the same. Tests: `render/metrics/__tests__/metricWarmup.test.ts` (12; 8
failed before) and `metricWarmup.couchbase.int.test.ts` (6; 4 failed
before), which ports upstream's three exponential-histogram warm-up cases
(the count case left out of D22, the quantile baseline, and the stale
baseline) and adds Sum and explicit-histogram cases, which upstream does
not have. Upstream's fourth case ("ignores other metrics, filtered
attribute series, and points outside the requested range") needs a chart
`where`, so it waits on D24. The exponential-histogram fixtures moved to
`__tests__/expHistogramFixtures.ts`, shared with the D22 suite.
- Found here, not fixed: D24, D25, D26.

#### D24: Metric charts ignore the chart `where`; histogram charts lose `filters` (found in D23, size M)

Evidence: upstream builds every metric source `WHERE` with
`renderMetricWhere`, which includes the chart's `where` (SQL or Lucene) and
`filters`. `translateMetricChartConfigCouchbase` sets `where: ''` on every
metric type and `sourceWhereClause` has only the metric name and date
range, so a metric chart's `where` never reaches the SQL++ (rendered for
gauge, sum, histogram, and exponential histogram: `where` absent in all
four). `filters` survive only on the outer query: gauge and sum `Bucketed`
carry the OTel columns, but histogram `metrics` has only bucket, group, and
value, so a filtered histogram chart returns no rows. Blocks upstream's
"ignores other metrics, filtered attribute series, and points outside the
requested range". Placement: pending (Q46).

#### D25: Sum select alias is not defaulted to `Value` (found in D23, size S)

Evidence: upstream's Sum branch spreads `{ alias: 'Value', ..._select }`,
so a select with no alias returns a `Value` column. The port's Sum branch
keeps the caller's alias, so the column is `sum(Rate)` (seen live in D23).
Gauge has no default upstream either. Placement: pending (Q47).

#### D26: Date-range end is exclusive by default; upstream is inclusive (found in D23, size M)

Evidence: upstream `renderWhere` passes `dateRangeEndInclusive ?? true`, so
`ts <= end` unless the caller sets it false (alert windows after the first
do). The port's `where.ts` and metric `sourceWhereClause` use `< end`
unless it is `true`. A row exactly at the range end is returned upstream
and not here, in search, charts, and metrics. Not recorded as a decision in
`docs/port-notes.md` or `docs/parity.md`. Placement: pending (Q48).

#### D18: Common-utils live tests fail intermittently (found in D12, size S)

Evidence: two of four `run.sh` runs on the D12 branch lost one common-utils live
test each, reported as an SDK "unambiguous timeout" about 500 ms in, a different
test each time. Placement (Q37): investigated alongside D13, in the same PR, own
commit.

Result (2026-11-22, `mm--v1-d13-invite-race`): one cause fixed, one not found.
35 loops of the full common-utils live set against one long-lived `run.sh`
cluster: 3 failed, with two different symptoms.

- Missing rows (2 of 35, `mapAccess`, `"": 1` absent). `seed()` waited on
  `SELECT RAW COUNT(*)` with no WHERE. EXPLAIN shows a `CountScan`, which reads
  the collection's document count and is exact as soon as the KV writes land.
  The chart query then scanned `#primary` at `not_bounded` before the index had
  the last UPSERT. Fixed: the wait is one `request_plus` count that scans
  `#primary` (`IndexScan3`). After the fix, 30 of 30 full-set loops pass.
- SDK "unambiguous timeout" (1 of 35, and both D12 `run.sh` failures). In D12 it
  came from the first chart query of a suite (`runSql`, about 500 ms). In the
  loop it came from `probeLive` (`testConnection`), so the whole suite failed.
  The query timeout resolves to 60 s and the connect timeout to 10-15 s, so
  neither is the cutoff. 300 fresh connect-and-query loops and 120
  close-then-reconnect loops in a plain Node process: 0 failures. Not seen in
  the 30 loops after the seed fix, which at a rate of about 1 in 35 is not
  proof. Root cause not found. Next steps: log the SDK error context
  (`e.context`, `e.cause`) when a live test or probe fails with TIMEOUT, then
  loop `run.sh` itself (fresh cluster per run) to catch one with that context.

Result (2026-11-22, `mm--v1-d18-sdk-timeout`, Q39): root cause found and
fixed. With SDK context logged, `run.sh` loop 7 caught it: `connecting: true`,
`UnambiguousTimeoutError` about 500 ms in, from opening the cluster. A
single-hostname connection string (`couchbase://localhost`) makes the SDK look
up DNS SRV before bootstrap, with a 500 ms budget, and a lookup that misses it
fails the connect rather than falling back. Reproduced with an unreachable
nameserver (510 ms). Fix: every SDK connect, in the product and in the live
harness, passes `dnsConfig.dnsSrvTimeout` 2000 ms
(`CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS`), which leaves room for the SDK's TCP retry
after a lost UDP answer. That alone left 1 failure in 12 `run.sh` runs, so the
harness connstr also sets `enable_dns_srv=false`. Details and the verification
loops are in `docs/port-notes.md`.

#### D19: `make ci-int` exits 1 after every test passed (found in D13, size S)

Evidence: one D13 `make ci-int` run ended `make: *** [ci-int] Error 1` although
all 1257 tests passed and Nx printed its success summary; the re-run exited 0.
Placement (Q40): investigated with the D18 remainder, in its own PR.

Result (2026-11-22, `mm--v1-d18-sdk-timeout`): root cause found and fixed.

- Not Nx, the tests, or teardown. The Nx daemon log shows the client sending
  `POST_TASKS_EXECUTION` and closing normally, so `nx run-many` returned 0.
- The failing log has, near its start, `tee: …/dev-slots/47/logs-int/ci-int.log:
No such file or directory`. With `set -o pipefail`, tee's exit 1 became the
  pipeline status and so the target's. The directory was gone because another
  `make ci-int` on slot 47 was still tearing down when this one started. This
  run waited for port 8091 to close, so it began the moment the other run's
  `down -v` released it, and that run's `archive-int-logs` (log archived to
  `history/int-2026-11-22T23:56:59Z`, Nx done at 23:56:56) then ran
  `rm -rf logs-int` under it. Both runs used compose project `int-47` and the
  same `/tmp` redirect, so the other run was this same command launched twice
  (the agent shell started it again while the first copy ran; the 8091 wait
  held the copy until the first's teardown). That is why the failing log ends
  in 78 NUL bytes and a second `Network int-47_internal Removed` line: the
  first copy's last write landed at its own, larger offset before this copy
  rewrote the file from the start.
- Fix: one integration run per slot at a time. `scripts/slot-lock.sh` takes a
  per-slot directory lock (`dev-slots/<slot>/int.lock`, holding make's PID) at
  the start of `ci-int`, `dev-int`, and `dev-int-common-utils` and releases it
  after teardown. A second run waits (`CBT_SLOT_LOCK_WAIT_S`, default 30 min)
  with a message, or fails naming the holder; a lock whose PID has exited is
  taken over. Tests: `scripts/__tests__/slot-lock.test.mjs`.

#### D8 onward

Defects R2 finds while porting suites. Each gets its own PR, merged before the
R2 sub-phase that found it.

#### D8: MCP query reads can miss freshly written rows (found in D2, size S)

Evidence: `mcp/__tests__/queryTool` `cbt_table` "applies having to the groups"
and "applies having on shape \"pie\"" each failed once in D2's runs and passed
on re-run with the same code: group `c` (3 rows) was missing. The rendered SQL++
is correct. The suite's seed helpers return before the index has the rows, and
MCP chart queries run with the default `not_bounded` scan consistency.

Fix (Q15): the test seed helpers wait until seeded rows are visible to the index
(a `request_plus` probe, as the common-utils live suites do). MCP tools keep
their current scan consistency; no product change. Acceptance: the `cbt_table`
having group passes 10 runs in a row. Depends on: D2. Size: S. Placement (Q15):
a separate small commit in the D9 PR when it stays small, otherwise its own PR
before R2c. Done: folded into the D9 PR as its own commit (see the D8 port
notes).

#### D9: Builder expressions with ClickHouse map syntax (found in D2, size M)

Evidence: the builder renderer passes `SpanAttributes['k']` through unchanged in
select `valueExpression`, `groupBy` and SQL `where`, and SQL++ reads `['k']` as
an array index (NULL on an object), so those tiles return empty groups or no
rows. The column alias for a map groupBy is built by splitting on dots
(`` `SpanAttributes['http`.`route']` ``). D2 rewrites the form only in
`cbt_event_patterns` bodyExpression and its where. The app, dashboard presets
and upstream tests generate the bracket form, so the MCP builder docs still
teach it.

Fix: translate `Map['k']` to `` Map.`k` `` in the SQL++ renderer (one helper for
select, groupBy, where, having and orderBy; string literals untouched) and alias
map groupBy columns by the original expression. Then switch the MCP builder docs
to whatever form the renderer documents. Acceptance: a live test groups and
filters by `SpanAttributes['http.route']` and gets the seeded groups. Depends
on: D2. Size: M. Placement (Q14): next after D2, before D2b, so D2b rewrites the
builder docs once in their final form.

### R0: Triage and quick fixes

1. Run each of the 23 deferred suites alone on the CI compose stack
   (`make dev-int FILE=…` with the ignore entry removed locally) and record
   per-suite pass/fail counts and failure classes (SQL text assertion, result
   shape, missing fixture, real bug) in a table appended to this plan. That
   table sizes R2a–R2c precisely.
2. Run the full Playwright suite on the Couchbase stack
   (`./scripts/test-e2e.sh --quiet`) and record per-spec results; this is R4's
   worklist.
3. B3: update the four `sources.spec.ts` expectations.
4. B4: make `scripts/test-e2e.sh` export
   `CBT_COUCHBASE_ADMIN_PASSWORD=cbt-test-admin` for its children; add a line to
   `docs/development.md`.
5. B16: check Docker Hub for the newest `couchbase/server:enterprise-8.0.x`;
   bump everywhere it is pinned and record it in port-notes.
6. P5: set `--max-warnings` to the measured counts (api 313, app and
   common-utils measured on the day).

Acceptance: `sources.spec.ts` 6/6 green; E2E passes with
`CBT_COUCHBASE_ADMIN_PASSWORD=wrong` exported; triage tables committed.

R0 result: done on `mm--v1-r0-triage`. See section 14 for the triage tables.
`sources.spec.ts` passes all 6 runnable specs (the seventh, the modal form
check, is skipped by design in full-stack mode) with
`CBT_COUCHBASE_ADMIN_PASSWORD=wrong` exported. B3 needed one harness fix besides
the spec: `run-e2e.js` now sets `timestampFormat: 'iso8601'` on the fixture
sources, because the Couchbase source validator rejects every save without one.
B16: `enterprise-8.0.3` is still the newest 8.0.x tag on Docker Hub
(2026-11-19), so no pin changed.

### R1: Correctness and branding fixes

B5 (blocked hosts module, delete `CLICKHOUSE_*` config and test env), B9
(`changelogUrl`), B11 (MCP version), B12 (root package name, CLI config dir with
migration, CLI binary names, service-account domain, collector component ids),
P2 (delete `packages/api/migrations/ch/`). Unit tests: `blockedHosts.test.ts`
(each env var, malformed connstr, IPv6, port expansion), `config.test.ts` for
the CLI migration, an updated `useWhatsNew` test, the MCP server version test.

Acceptance:
`rg -n "CLICKHOUSE_(HOST|USER|PASSWORD)" packages .github -g '!packages/hdx-eval/**'`
empty (hdx-eval passes those names to the third-party ClickHouse MCP server it
benchmarks against, which reads exactly them); webhook to
`http://<metadata host>:8091` rejected in a unit test;
`rg -n "hyperdx" packages/cli/src/utils/config.ts` shows only
`LEGACY_CONFIG_DIR`; `port/rebrand verify branding` and `port/remove-ch` verify
report no problem that `main` does not already have (both fail on `main` today;
see `docs/port-notes.md` R1).

### R2a / R2b / R2c: Deferred integration suites

Per suite: remove it from `deferredChIntSuites`, port assertions to SQL++ (same
inputs and result shapes), keep the suite green in `yarn ci:int` sharded.
Snapshots that contain ClickHouse SQL are regenerated only after a reviewer
confirms the SQL++ text is equivalent. Product defects found while porting get
their own PR first (D7 onward). Cases that cannot keep the result shape are
listed in the PR and the plan, and the phase stops for the user (rule 9).

Order: R2a, then R2c, then R2b. Acceptance (end of R2b, the last R2 phase):
`deferredChIntSuites` is an empty array and is then deleted; `yarn ci:int`
reports 0 ignored suites; the skipped count equals the harness-only
`metadata.couchbase.int.test.ts` count (51 today) and nothing else; CI
integration shards green within the 55 minute timeout (if not, add shards; that
is a workflow edit inside a CI-scoped phase).

R2c also carries Q26 (the metric tools' leftover ClickHouse SQL). When it ports
`cbt_describe_metric`'s unit/description query, switch that tool's column lookup
to the shared `describeColumns` (Q25). D5 left it on `getColumns`: with declared
columns, an empty gauge table runs the still-ClickHouse query, which fails and
turns the "No data found" hint into `partialFailure`. The third
empty-`otel_logs` describe test ("surfaces partialFailure instead of the no-data
hint") passes only with that switch, so it moves to R2c too.

### R3: Service map node latency

Add node p50/p95/p99 in `serviceMap.ts`; add a golden parity case to
`port/query-parity` (`--slice traces`); port or add the unit test. Acceptance:
node percentiles non-NULL on the parity dataset and within the parity tolerance
of the reference.

### R4: Playwright specs on Couchbase

Fix the spec or the product for each failure recorded in R0 (section 14.2: 115
failures and 8 flaky tests across 29 specs; start with the onboarding
checklist's ClickHouse `system.tables` query, which breaks `route-smoke`).
Follow `.claude/skills/playwright/SKILL.md`. Includes D15 (Q34):
`seed-couchbase.ts` writes the Kubernetes metric and event rows and the
OpenTelemetry browser SDK session spans, replay rows and browser log events that
the upstream ClickHouse seed writes for `kubernetes.spec.ts` and
`sessions.spec.ts`. Acceptance: `make e2e` (all four shards) green twice in a
row locally on a clean stack, including all 13 `kubernetes.spec.ts` and all 7
`sessions.spec.ts` tests.

### R5: Re-enable E2E on Main

Restore `e2e-tests` as a `workflow_call` without `if: false`, and the
`End-to-End Tests` report job that aggregates shard results (git history before
the K2 change). Acceptance: two consecutive Main runs conclude `success` with
E2E shards executed, each under the 45 minute timeout.

### R6: Release tooling

Add `scripts/release/*`, the unit test, `make version` / `make release-images`,
fix Makefile registry prefixes, add `CODE_VERSION` and OCI labels to all four
images, add `ingest` to the changesets `fixed` group, delete `version.sh`, wire
`set-version --check` into `make ci-lint`. Acceptance:
`node --test scripts/__tests__/set-version.test.mjs` green;
`node scripts/release/set-version.mjs 9.9.9 --dry-run` lists every location in
section 3 and nothing else; `make build-app` produces
`ghcr.io/mminichino/couchbase-traces:<IMAGE_VERSION><SUB_TAG>`;
`docker compose config` resolves image names identical to what `make build-*`
tags; `docker inspect` shows the version label on all four images. No push
happens in this phase.

### R7: Docs and acceptance

Rewrite `README.md` status and quick start, `DEPLOY.md` image section,
`LOCAL.md`, `docs/development.md` tag examples; add `docs/release.md`; close
`docs/port-notes.md` "Pending user decisions" (all-in-one not published, Q1);
regenerate `docs/acceptance.md` with `port/acceptance/run.mjs --final` at the
release-candidate commit and record the Main CI run (K2). Acceptance: acceptance
status **pass** at a commit no older than R6; M2 (docs, no TODO/TBD) green;
H1–H3 branding green.

### R8: Release v1.0.0

On branch `mm--release-v1-0-0`:

1. `make version VERSION=1.0.0` (writes section 3 locations), `yarn install`
   (lockfile), OpenAPI `info.version` stays `2.0.0` (Q7), so `openapi.json` does
   not change.
2. Add `## v1.0.0 — <date>` to `CHANGELOG.md` with the release-notes marker:
   highlights (Couchbase Server 8.x / Capella, SQL++, metadata on Couchbase with
   no MongoDB, feature parity, dropped PromQL and careers page with sign-off),
   breaking changes vs upstream HyperDX (no ClickHouse, no MongoDB, new env
   prefix `CBT_`), supported versions, image names. Add `## 1.0.0` to each
   lock-stepped package changelog (changesets, Q9). Fold the `## v0.1.0` entry
   into `## v1.0.0` and delete the 0.1.0 heading (Q3).
3. Commit `Release v1.0.0`, push the branch, open the PR, wait for every
   required check, merge with `gh pr merge` when the user says so.
4. **Only on explicit user instruction:**
   `git tag -a v1.0.0 -m "Couchbase Traces v1.0.0" <merge sha>` and
   `git push origin v1.0.0`.
5. **Only on explicit user instruction:**
   `make release-images VERSION=1.0.0 LATEST=1` (tags `1.0.0`, `1.0`, `1`,
   `latest`; app, ingest, and otel-collector only) from a clean checkout of the
   tag.
6. **Only on explicit user instruction:**
   `gh release create v1.0.0 --title "Couchbase Traces v1.0.0" --notes-file <(node scripts/release/release-notes.mjs 1.0.0) --verify-tag`,
   attaching the CLI binaries `cbt-linux-x64`, `cbt-darwin-arm64`, and
   `cbt-darwin-x64` (Q6).
7. Smoke the published images: `docker compose pull && docker compose up` from a
   clean directory with `.env.example`.

Acceptance: section 11 items 9–14.

## 10. Decisions

Q1–Q10 were answered by the user on 2026-11-19, Q11–Q18 on 2026-11-20. No other
open questions remain for the release as a whole; per-phase questions are raised
in that phase.

| ID  | Question                                                                                                 | Decision                                                                                                                                                                                                                                                                                                                          | Affects        |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Q1  | Publish the all-in-one image (bundles Couchbase Server EE)?                                              | No, not for 1.0. `make build-all-in-one` stays for local use; `DEPLOY.md` says so                                                                                                                                                                                                                                                 | R6, R7, R8     |
| Q2  | Image tag scheme                                                                                         | `1.0.0`, `1.0`, `1`, and `latest` for non-prerelease releases from `main`                                                                                                                                                                                                                                                         | R6, R8         |
| Q3  | Git tag scheme and the `## v0.1.0` changelog entry                                                       | Single product tag `v1.0.0`; fold the never-tagged 0.1.0 entry into 1.0.0                                                                                                                                                                                                                                                         | R1 (B9), R8    |
| Q4  | Service map node latency (B6)                                                                            | Blocker; fix before 1.0 (R3)                                                                                                                                                                                                                                                                                                      | R3             |
| Q5  | Internal package versions                                                                                | Every package except `hdx-eval` moves to 1.0.0 and is lock-stepped (`api`, `app`, `ingest`, `otel-collector`, `common-utils`, `cli`, root); `hdx-eval` stays 0.3.3                                                                                                                                                                | R6, R8         |
| Q6  | Publish the CLI                                                                                          | Attach binaries to the GitHub release; no npm publish                                                                                                                                                                                                                                                                             | R8             |
| Q7  | OpenAPI `info.version`                                                                                   | Stays `2.0.0` (versions the `/api/v2` contract, not the product)                                                                                                                                                                                                                                                                  | R8             |
| Q8  | Do the test gaps block 1.0?                                                                              | Yes, all of them: the 23 deferred API int suites (R2a, R2b, R2c) and full-stack E2E back on in CI (R4, R5). No fallback                                                                                                                                                                                                           | R2a–R2c, R4–R5 |
| Q9  | Changelog tooling                                                                                        | Keep changesets for package changelogs; hand-write the root `CHANGELOG.md` release notes                                                                                                                                                                                                                                          | R6, R8         |
| Q10 | Release automation                                                                                       | Local `make release-images` and `gh release create`; no new release workflow                                                                                                                                                                                                                                                      | R6, R8         |
| Q11 | B17 "legacy store" text (2026-11-20)                                                                     | Blocks 1.0 as its own phase D2b, after D2                                                                                                                                                                                                                                                                                         | D2b            |
| Q12 | Where D7 runs (2026-11-20)                                                                               | After D6, as section 9 orders it; not pulled forward                                                                                                                                                                                                                                                                              | D7             |
| Q13 | External charts "process series from different sources" and the 8 empty log-series failures (2026-11-20) | Stay in R2a; no separate defect phase. R2a finds the cause, and if it is a product defect fixes it there                                                                                                                                                                                                                          | R2a            |
| Q14 | Where D9 (builder `Map['k']` syntax) runs (2026-11-20)                                                   | Next after D2, before D2b, so D2b rewrites the builder docs once in final form                                                                                                                                                                                                                                                    | D9, D2b        |
| Q15 | D8 fix: seed helpers or MCP `request_plus` (2026-11-20)                                                  | Test seed helpers only (wait for index visibility); MCP tools keep their consistency. Folded into the D9 PR as its own commit if small                                                                                                                                                                                            | D8, D9         |
| Q16 | How D2b docs and prompts show map access (2026-11-20)                                                    | Show the map form `SpanAttributes['k']` and say it is translated to SQL++ field access (``SpanAttributes.`k` ``)                                                                                                                                                                                                                  | D2b            |
| Q17 | Name of map group-by result columns (2026-11-20)                                                         | The raw source expression, e.g. `SpanAttributes['http.route']` (current behavior; matches upstream)                                                                                                                                                                                                                               | D9, D2b        |
| Q18 | Leftover `CBT_*`/`COUCHBASE_*` shell variables in local int runs (2026-11-20)                            | Local integration entry points (`make ci-int`, `make dev-int`, `port/couchbase-test/run.sh`) clear them through the `scripts/e2e-env.sh` logic; unit-tested; own commit in the D2b PR                                                                                                                                             | D2b            |
| Q19 | Scope of the legacy-store text guard (2026-11-21)                                                        | Keep the wider scope: package sources, `openapi.json`, package docs, `docs/`, `agent_docs/`, rules, skills, templates, prompts, `docker/`, `smoke-tests/`                                                                                                                                                                         | D2b            |
| Q20 | Two Playwright failures found in D2b, also on `main` (2026-11-21)                                        | R4/R5 worklist: `dashboards-list` "Cluster" card locator also matches the Kubernetes card; `team` connection card lacks `Host:`/`Username:`                                                                                                                                                                                       | R4, R5         |
| Q21 | Dead non-Couchbase test-connection branch in `app/src/connection.ts` (2026-11-21)                        | Remove it (posts to the removed `evalstore-proxy/test` route); own commit in the D3 PR, tests updated                                                                                                                                                                                                                             | D3             |
| Q22 | Couchbase-suite skip under `make ci-int` (2026-11-21)                                                    | Make it explicit: `make ci-int` sets `CBT_TEST_COUCHBASE_REQUIRED=0` and logs that the suite runs in `port/couchbase-test/run.sh`; own commit in the D3 PR                                                                                                                                                                        | D3             |
| Q23 | Leftover `trace` failure "no-match hint when no traces exist" (2026-11-21)                               | Fix in R2c: give the test its own time window; keep upstream's behavior of not clearing `otel_traces` between tests                                                                                                                                                                                                               | R2c            |
| Q24 | Integer query results arrive as strings (Int64 JSON encoding) (2026-11-21)                               | Keep strings at the data-client level (current raw result shape); each tool converts with `Number()` where it needs a number                                                                                                                                                                                                      | D3, D4, all    |
| Q25 | Describe tools on an empty collection (2026-11-21)                                                       | Fall back to the declared OTel schema (ingest collection model, shared via `common-utils`, server-only), as upstream `DESCRIBE TABLE` returns DDL columns; one shared function; own commit in the D5 PR                                                                                                                           | D5             |
| Q26 | Metric tools' leftover ClickHouse SQL (`{x:Identifier}`, `argMax`, `anyLast`, `mapKeys`) (2026-11-21)    | Folded into R2c, not its own phase                                                                                                                                                                                                                                                                                                | R2c            |
| Q27 | Flaky app unit test `HDXMultiSeriesTableChart` "excludes a value by its column filter key" (2026-11-21)  | Own deterministic root-cause fix, own commit in the D5 PR, proven with repeated runs (30x and the full suite)                                                                                                                                                                                                                     | D5             |
| Q28 | Page query failures found by route-smoke in D5 (2026-11-21)                                              | One bug-fix phase, D10 "page queries", after D6 and D7 and before R2                                                                                                                                                                                                                                                              | D10            |
| Q29 | `/alerts/[id]` returns 400 for the smoke fixture id (2026-11-21)                                         | Both: the smoke fixture uses a real valid id, and the page shows a not-found state for an invalid or unknown id instead of the 400. In D10 (unrelated to D6)                                                                                                                                                                      | D10            |
| Q30 | Placement of D11, D12, D13 (2026-11-21)                                                                  | After D10 in the phase order                                                                                                                                                                                                                                                                                                      | D11–D13        |
| Q31 | Grouped alert history order (D12)                                                                        | Product fix: history rows get a stable insertion order so same-timestamp rows sort deterministically; not test-only                                                                                                                                                                                                               | D12            |
| Q32 | Concurrent invite race (D13)                                                                             | The losing request waits briefly and returns the winner's invite, idempotent like upstream; no 409                                                                                                                                                                                                                                | D13            |
| Q33 | Live-test port offset fallback (D14)                                                                     | Not a 1.0 blocker; fixed as a separate commit at the start of the D10 PR, proven with a default port occupied                                                                                                                                                                                                                     | D14            |
| Q34 | Couchbase E2E seed gaps (D15)                                                                            | Fixed with the Playwright work in R4; R4 acceptance includes the `kubernetes` and `sessions` specs                                                                                                                                                                                                                                | R4, D15        |
| Q35 | Grouped ratio alert `share_of_total` (D16)                                                               | Fixed with D11 in the same PR, as its own commit; both are alert query rendering                                                                                                                                                                                                                                                  | D11, D16       |
| Q36 | Placement of D17: multi-series metric charts drop HAVING and ORDER BY (2026-11-22)                       | Its own PR, right after D13                                                                                                                                                                                                                                                                                                       | D17            |
| Q37 | Placement of D18: intermittent common-utils live-cluster failures (2026-11-22)                           | Investigated alongside D13, in the same PR, own commit if a fix is found                                                                                                                                                                                                                                                          | D13, D18       |
| Q38 | Couchbase Node SDK version (2026-11-22)                                                                  | Stay on 4.7.x until Couchbase lists 4.8 for Server 8.0; keep the int-test watchdog. Evidence: 4.8.0 fixes a teardown hang (JSCBC-1520, JSCBC-1522), the strongest lead for the PR #27 shard 1 stall, but the compatibility matrix lists 4.7, not 4.8, for 8.0 (AGENTS.md platform rule). Follow-up F1: revisit when 4.8 is listed | F1             |
| Q39 | Placement of the D18 SDK-timeout remainder (2026-11-22)                                                  | Its own small PR (`mm--v1-d18-sdk-timeout`), merged before D17: SDK error-context logging on TIMEOUT, then `run.sh` loops with a fresh cluster each run                                                                                                                                                                          | D17, D18       |
| Q40 | One-off `make ci-int` exit 1 after every test passed (2026-11-22)                                        | Logged as defect D19 and investigated in the D18 remainder PR                                                                                                                                                                                                                                                                     | D18, D19       | F1             |
| Q41 | SQL++ form of the D17 outer HAVING and group-by sort (2026-11-22)                                        | HAVING is a WHERE on a wrapper in every shape (SQL++ HAVING rejects aliases, windows, and a missing GROUP BY); group-by sorts read the named group column instead of companion columns. Same rows and columns as upstream; a `share_of_total` HAVING with an expression group-by sort now runs, where upstream fails. User kept this divergence (2026-11-23) | D17            |
| Q42 | Placement of D20: mixed gauge/histogram charts drop scalar group columns (2026-11-23)                    | The next phase, right after D17                                                                                                                                                                                                                                                                                                   | D17, D20       |
| Q43 | Placement of D21: cumulative histogram quantile emits a NULL row for a zero-delta bucket (2026-11-23)    | Its own PR, before R2a (user, 2026-11-23)                                                                                                                                                                                                                                                                                         | D21            |
| Q44 | Placement of D22: exponential-histogram count partitions deltas by a select alias (2026-11-23)           | Its own PR, before R2a (user, 2026-11-23)                                                                                                                                                                                                                                                                                         | D22            |
| Q45 | Placement of D23: metric source CTEs omit upstream's one-interval warm-up window (2026-11-23)            | Its own PR, before R2a (user, 2026-11-23)                                                                                                                                                                                                                                                                                         | D23            |
| Q46 | Placement of D24: metric charts ignore `where`; histograms lose `filters` (2026-11-23)                   | Pending; proposed: its own PR before R2a (filtered metric charts return wrong or no rows)                                                                                                                                                                                                                                         | D24            |
| Q47 | Placement of D25: Sum select alias is not defaulted to `Value` (2026-11-23)                              | Pending; proposed: with D24                                                                                                                                                                                                                                                                                                       | D25            |
| Q48 | D26: keep the exclusive range end, or default it to inclusive as upstream (2026-11-23)                   | Pending; proposed: match upstream in its own PR before R2a, since parity is the rule                                                                                                                                                                                                                                              | D26            |

## 11. Acceptance criteria (v1.0.0 is done when)

1. `make ci-lint`, `make ci-unit`, and `make ci-int` are green on the release
   commit; `yarn knip` clean; `bash port/couchbase-test/run.sh` exits 0.
2. `deferredChIntSuites` no longer exists in `packages/api/jest.int.config.js`,
   and the only skipped API int tests are the harness-only
   `metadata.couchbase.int.test.ts` ones (Q8: no fallback).
3. The Main workflow runs Playwright E2E on all four shards and concludes
   `success` on the release commit (Q8: no fallback).
4. `sources.spec.ts` passes 6/6; E2E passes with an unrelated
   `CBT_COUCHBASE_ADMIN_PASSWORD` exported.
5. A unit test proves a webhook URL pointing at a configured Couchbase host is
   rejected; no `CLICKHOUSE_*` config remains in `packages/` or `.github/`.
6. Service map node percentiles are non-NULL on the parity dataset (Q4).
7. `node scripts/release/set-version.mjs 1.0.0 --check` exits 0, and
   `rg -n '"version": "2\.44\.0"|CODE_VERSION=2\.44|IMAGE_VERSION=2$' --glob '!docs/upstream/**' --glob '!port/**'`
   returns nothing.
8. `docs/acceptance.md` status **pass**, generated at a commit no older than R6,
   Final true.
9. `curl /api/health` on the released image returns `"version": "1.0.0"`; the
   app debug panel shows frontend and server `1.0.0`; the MCP server reports
   `1.0.0`; `cbt --version` prints `1.0.0`.
10. `docker inspect` on each published image shows
    `org.opencontainers.image.version=1.0.0` and the release commit SHA.
11. `docker compose pull` with the committed `.env.example` (`IMAGE_VERSION=1`)
    resolves every image from `ghcr.io/mminichino`; each of `1.0.0`, `1.0`, `1`,
    and `latest` resolves to the same digest per image, and no
    `couchbase-traces-all-in-one` package exists on ghcr.
12. Annotated tag `v1.0.0` exists on `origin` and points at a commit on `main`.
13. GitHub release `v1.0.0` exists, its body equals the `## v1.0.0` changelog
    section, the in-app What's new link opens `blob/v1.0.0/CHANGELOG.md`, and
    the release has the three `cbt-*` CLI binaries attached; no
    `@couchbase-traces/cli` package exists on npm.
14. `LICENSE` and the upstream copyright line are unchanged; `NOTICE` and
    `UPSTREAM.md` intact (acceptance J1).

## 12. Risks

| Risk                                                                                        | Impact                        | Mitigation                                                                                       |
| ------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| R2 volume (1,002 tests, 312 failing in R0; `checkAlerts.int.test.ts` alone is 12,222 lines) | schedule; the largest unknown | R0 triage first; split R2b further (alert windows vs templates) if a single PR gets unreviewable |
| Ported suites expose real SQL++ bugs in alerts or external API                              | slip, but this is the point   | fix in the same phase; anything that cannot keep the result shape goes to the user (rule 9)      |
| E2E runtime on GitHub runners (shards already hit 25 minute timeouts)                       | flaky or cancelled Main       | keep the 45 minute timeout, add shards rather than retries                                       |
| Couchbase Enterprise redistribution in the all-in-one image                                 | legal exposure                | Q1: not published for 1.0                                                                        |
| ghcr package visibility defaults to private                                                 | users cannot pull             | set each package public in ghcr settings once, after the first push (manual, on instruction)     |
| Version decrease confuses tooling (changesets, nx cache, Renovate if added)                 | wrong versions                | `set-version.mjs` is the single writer; `--check` in CI                                          |
| Shell env leaks into make/E2E                                                               | false failures                | explicit env in scripts (B4)                                                                     |
| Couchbase Node SDK 4.7.x teardown hang (JSCBC-1520/1522; suspected in the PR #27 stall)     | silent CI stall               | Q38: int-test watchdog fails fast; F1: move to 4.8 once Couchbase lists it for Server 8.0        |

## 13. Size summary

| Phase                                                           | Size |
| --------------------------------------------------------------- | ---- |
| R0 Triage and quick fixes                                       | M    |
| R1 Correctness and branding fixes                               | M    |
| D1 SQL++ chart renderer defects                                 | M    |
| D2 MCP query and analysis tool defects                          | M    |
| D9 Builder `Map['k']` map access                                | M    |
| D8 Seed helpers wait for index visibility                       | S    |
| D2b User-visible "legacy store" text (B17)                      | M    |
| D3 MCP trace tool defects                                       | M    |
| D4 Empty-collection schema inference                            | S    |
| D5 Onboarding checklist probe                                   | S    |
| D6 Alert connection resolution (investigate)                    | S    |
| D7 Hidden formula operands as null columns                      | S    |
| D10 Page queries and alert detail not-found                     | M    |
| D11 Alias WITH clauses in SQL++                                 | S    |
| D12 Grouped alert history order                                 | S    |
| D13 Concurrent invite race                                      | S    |
| D17 Multi-series HAVING and ORDER BY                            | S    |
| D18 Intermittent common-utils live tests                        | S    |
| D19 `make ci-int` exit 1 after a green run                      | S    |
| D20 Mixed gauge/histogram charts drop scalar group columns      | S    |
| D21 Cumulative histogram quantile zero-delta row                | S    |
| D22 Exp-histogram count partition by alias                      | S    |
| D23 Metric source warm-up window                                | M    |
| D24 Metric `where` and histogram `filters` dropped              | M    |
| D25 Sum alias default `Value`                                   | S    |
| D26 Exclusive range end                                         | M    |
| D14 Live-test port offset fallback                              | S    |
| R2a Deferred API int suites (10 suites, 380 tests, 80 failing)  | L    |
| R2b Deferred alert int suites (5 suites, 335 tests, 93 failing) | L    |
| R2c Deferred MCP int suites (8 suites, 287 tests, 139 failing)  | L    |
| R3 Service map node latency                                     | M    |
| R4 Playwright specs on Couchbase                                | L    |
| R5 Re-enable E2E on Main                                        | S    |
| R6 Release tooling                                              | M    |
| R7 Docs and acceptance                                          | M    |
| R8 Release v1.0.0                                               | S    |

Roughly six to eight weeks for one engineer, dominated by R2 and R4. D1–D6 and
D2b add about a week and a half, but they take the product fixes out of R2a and
R2c, which shrink to fixture and assertion work. Every phase in the table blocks
1.0 (Q8).

## 14. R0 triage results

### 14.1 Deferred API integration suites (B1)

Method: each suite in `deferredChIntSuites` ran alone on the CI compose stack
(`docker-compose.ci.yml`, `couchbase/server:enterprise-8.0.3`) with
`DOTENV_CONFIG_PATH=.env.test` and `cbt_meta` emptied between suites. Run date
2026-11-19 on `mm--v1-r0-triage`. Two full runs gave the same counts. During the
second run, temporary hooks in `fixtures.ts` and `mcpTestUtils.ts` logged every
MCP tool error and every API response with status 400 or above. The hooks were
reverted before commit.

Totals: 23 suites, **1,002 tests, 690 pass, 312 fail**. The "~880" in the
inventory was a static estimate; `it.each` expansions account for the
difference.

Failure classes:

- **T: test input or assertion is ClickHouse-shaped.** Port the test (rule 6:
  same inputs, SQL++ expected output). Examples: sources with no `scopeName` or
  `timestampFormat`, `kind: 'clickhouse'` connections, ClickHouse SQL as a tool
  argument, SQL text snapshots, fixtures in a scope that does not exist.
- **P: product defect on Couchbase.** Fix the product in the same phase. The
  captured SQL++ error shows the cause.
- **U: assertion-only failure.** The test fails on a value (for example, alert
  state `OK` instead of `ALERT`) with no captured error. Find the root cause
  while porting; most come from alert fixtures inserting ClickHouse rows or
  queries.

| Phase | Suite                                               | Tests | Pass | Fail |   T |   P |   U | Main causes                                                                                                                                                                                                                                            |
| ----- | --------------------------------------------------- | ----: | ---: | ---: | --: | --: | --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R2a   | `routers/api/__tests__/sources`                     |    58 |   28 |   30 |  28 |   0 |   2 | fixtures lack `from.scopeName` / `timestampFormat` ("Scope is required")                                                                                                                                                                               |
| R2a   | `routers/api/__tests__/dashboard`                   |   150 |  149 |    1 |   0 |   0 |   1 | one `toContain` on a filter error message                                                                                                                                                                                                              |
| R2a   | `routers/api/__tests__/iac`                         |    14 |   11 |    3 |   2 |   0 |   1 | `kind: 'clickhouse'` connection bodies                                                                                                                                                                                                                 |
| R2a   | `routers/api/__tests__/connections`                 |     4 |    3 |    1 |   0 |   0 |   1 | one value assertion                                                                                                                                                                                                                                    |
| R2a   | `routers/external-api/__tests__/charts`             |    28 |   10 |   18 |   0 |   9 |   9 | **P (fixed in D1):** `granularity: 'auto'` throw; ambiguous `__hdx_time_bucket`. After D1: 10 failing; the empty log-series results (8) and "process series from different sources" stay here (Q13)                                                    |
| R2a   | `routers/external-api/__tests__/search`             |    29 |   27 |    2 |   0 |   0 |   2 | row-count assertions                                                                                                                                                                                                                                   |
| R2a   | `routers/external-api/__tests__/sources`            |    29 |   27 |    2 |   0 |   0 |   2 | response shape                                                                                                                                                                                                                                         |
| R2a   | `routers/external-api/__tests__/sources-crud`       |    35 |   24 |   11 |  11 |   0 |   0 | fixtures lack `scopeName` / `timestampFormat`                                                                                                                                                                                                          |
| R2a   | `routers/external-api/__tests__/connections`        |    30 |   21 |    9 |   8 |   0 |   1 | PUT bodies omit `id`, use `kind: 'clickhouse'` or an `http://` host                                                                                                                                                                                    |
| R2a   | `middleware/__tests__/queryAttribution`             |     3 |    0 |    3 |   3 |   0 |   0 | fixture uses ClickHouse `INSERT INTO TABLE FUNCTION`                                                                                                                                                                                                   |
| R2a   | **subtotal (10 suites)**                            |   380 |  300 |   80 |  52 |   9 |  19 |                                                                                                                                                                                                                                                        |
| R2b   | `tasks/checkAlerts/__tests__/checkAlerts`           |   185 |  112 |   73 |   0 |   0 |  73 | logged: raw-SQL alert queries are ClickHouse (`toStartOfInterval(... INTERVAL {x:Int64} ...)`, `count()`); "A connection id is required for Couchbase queries" (21); INFER on empty collections (16)                                                   |
| R2b   | `tasks/checkAlerts/__tests__/renderAlertTemplate`   |   104 |   94 |   10 |   9 |   0 |   1 | 9 snapshots contain ClickHouse SQL text                                                                                                                                                                                                                |
| R2b   | `tasks/checkAlerts/__tests__/multiChannelAlerts`    |     4 |    0 |    4 |   0 |   0 |   4 | alert never fires (same causes as `checkAlerts`)                                                                                                                                                                                                       |
| R2b   | `tasks/checkAlerts/__tests__/singleInvocationAlert` |     6 |    2 |    4 |   0 |   0 |   4 | `count()` in raw SQL                                                                                                                                                                                                                                   |
| R2b   | `tasks/checkAlerts/providers/__tests__/default`     |    36 |   34 |    2 |   0 |   0 |   2 | one fixture writes an alert `source` value the metadata schema rejects                                                                                                                                                                                 |
| R2b   | **subtotal (5 suites)**                             |   335 |  242 |   93 |   9 |   0 |  84 |                                                                                                                                                                                                                                                        |
| R2c   | `mcp/__tests__/queryTool`                           |   113 |   56 |   57 |  24 |  22 |  11 | **P:** `cbt_event_patterns` emits `count()` (34 calls); `having` on an alias fails ("must depend only on group keys"); ambiguous `__hdx_time_bucket`. **T:** ClickHouse SQL passed to `cbt_sql` (`getSetting`, `toUnixTimestamp`, `SELECT 1 AS value`) |
| R2c   | `mcp/__tests__/trace`                               |    40 |   11 |   29 |   0 |  21 |   8 | **P:** `waterfall.ts` keeps ClickHouse `{db:Identifier}` parameters; breakdown uses ClickHouse `{name:String}` and `toDate`                                                                                                                            |
| R2c   | `mcp/__tests__/sources`                             |    61 |   44 |   17 |   0 |   7 |  10 | **P:** `cbt_describe_source` / `cbt_describe_metric` fail on an empty collection (INFER "No documents found")                                                                                                                                          |
| R2c   | `mcp/__tests__/describeTable`                       |    11 |    0 |   11 |  11 |   0 |   0 | fixture scope `mcp_describe_table_test` does not exist                                                                                                                                                                                                 |
| R2c   | `mcp/__tests__/serviceHealthTool`                   |    10 |    4 |    6 |   0 |   6 |   0 | **P:** generated SQL calls ClickHouse `startsWith`                                                                                                                                                                                                     |
| R2c   | `mcp/__tests__/dashboards/queryTile`                |    31 |   18 |   13 |   6 |   5 |   2 | **P:** `count()`, `granularity: auto`, ambiguous `group` alias. **T:** ClickHouse tile SQL                                                                                                                                                             |
| R2c   | `mcp/__tests__/dashboards/queryTiles`               |    16 |   12 |    4 |   0 |   0 |   4 | result values                                                                                                                                                                                                                                          |
| R2c   | `mcp/__tests__/emergingSignalsTool`                 |     5 |    3 |    2 |   0 |   2 |   0 | **P:** `count()` in generated SQL                                                                                                                                                                                                                      |
| R2c   | **subtotal (8 suites)**                             |   287 |  148 |  139 |  41 |  63 |  35 |                                                                                                                                                                                                                                                        |
|       | **total (23 suites)**                               | 1,002 |  690 |  312 | 102 |  72 | 138 |                                                                                                                                                                                                                                                        |

Implications:

1. **R2c is the largest product-fix phase.** 63 of its 139 failures are real
   defects in MCP tools that a user can hit today (`cbt_event_patterns`,
   `cbt_trace_waterfall`, `cbt_trace_top_time_consuming_operations`,
   `cbt_service_health`, `cbt_emerging_signals`, `cbt_describe_*` on empty
   collections). Treat these as bugs, not test debt.
2. **R2a has one shared product defect.** `granularity: 'auto'` throws in
   `packages/common-utils/src/couchbase/time.ts` (`parseGranularity`). The
   external charts API and `cbt_query_tile` both reach it. The duplicate
   `__hdx_time_bucket` alias in multi-series charts is the second defect.
   Everything else in R2a is fixture work: about 40 tests need only
   `from.scopeName` and `timestampFormat` on the mock sources.
3. **R2b is mostly fixture work but needs care.** The alert fixtures write raw
   ClickHouse SQL and ClickHouse rows. Port each to SQL++ (`$__timeInterval`
   macro, `COUNT(*)`) and to the Couchbase fixture helpers. The 21 "connection
   id is required" errors come from alerts whose source has no connection on the
   Couchbase path; find out whether that is a test gap or a scheduler bug before
   closing R2b.
4. Fix order (decided 2026-11-19): the defect-fix phases D1–D6 first (section
   9.1), then R2a, R2c, R2b.

### 14.2 Playwright full-stack E2E (B2, R4 worklist)

Method: `./scripts/test-e2e.sh --quiet` (all specs, one local run, 8 workers,
`retries: 1`) on `mm--v1-r0-triage` with the B3/B4 fixes in, 2026-11-19, 21.1
minutes. Totals: **457 tests: 325 passed, 115 failed, 8 flaky, 9 skipped or did
not run.** 29 of the 62 spec files have a failure or a flaky test; the other 33
pass cleanly.

Failing or flaky specs (R4 worklist, ordered by failure count):

| Spec (`packages/app/tests/e2e/features/`) | Tests | Pass | Fail | Flaky | Main symptom (first error)                                                                                                                                                                                                    |
| ----------------------------------------- | ----: | ---: | ---: | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route-smoke.spec.ts`                     |    24 |    2 |   22 |     0 | **Product:** console errors on every page. `OnboardingChecklist/useOnboardingCompletion.ts:83` sends a ClickHouse `system.tables` condition (`table = '…' AND database = '…'`) to Couchbase, which returns a 400 syntax error |
| `filter-key-edge-cases.spec.ts`           |    19 |    0 |   19 |     0 | search table never renders rows for the interesting-filter-keys source; facet options missing                                                                                                                                 |
| `kubernetes.spec.ts`                      |    13 |    1 |   12 |     0 | pod and node CPU charts never render; timeouts                                                                                                                                                                                |
| `dashboard.spec.ts`                       |    51 |   41 |    9 |     1 | raw SQL tiles not rendered, timeouts                                                                                                                                                                                          |
| `search/search-filters.spec.ts`           |     8 |    0 |    8 |     0 | `beforeEach` times out waiting for the `info` facet value                                                                                                                                                                     |
| `sessions.spec.ts`                        |     7 |    1 |    6 |     0 | no session cards                                                                                                                                                                                                              |
| `heatmap-series.spec.ts`                  |     6 |    3 |    3 |     0 | asserts ClickHouse `INTERVAL 1 hour` in generated SQL (spec), heatmap canvas missing                                                                                                                                          |
| `release-markers.spec.ts`                 |     4 |    1 |    3 |     0 | no `recharts-reference-line` on tiles                                                                                                                                                                                         |
| `search/search.spec.ts`                   |    10 |    7 |    3 |     0 | no table rows / histogram                                                                                                                                                                                                     |
| `traces-workflow.spec.ts`                 |     3 |    0 |    3 |     0 | trace tab never appears in the side panel                                                                                                                                                                                     |
| `heatmap.spec.ts`                         |     2 |    0 |    2 |     0 | heatmap canvas missing                                                                                                                                                                                                        |
| `metric-table-autofill.spec.ts`           |     3 |    0 |    2 |     0 | "Auto-detected metric tables" notification never shows                                                                                                                                                                        |
| `search/event-patterns.spec.ts`           |     2 |    0 |    2 |     0 | no table rows (event patterns; see R2c `count()` defect)                                                                                                                                                                      |
| `search/saved-search.spec.ts`             |    20 |   17 |    2 |     1 | timeouts                                                                                                                                                                                                                      |
| `search/select-star-error-state.spec.ts`  |     2 |    0 |    2 |     0 | no table rows                                                                                                                                                                                                                 |
| `search/side-panel-navigation.spec.ts`    |     3 |    1 |    2 |     0 | `side-panel-tab-trace` missing                                                                                                                                                                                                |
| `services-dashboard.spec.ts`              |     3 |    1 |    2 |     0 | error-rate chart and top-endpoints link missing                                                                                                                                                                               |
| `span-links.spec.ts`                      |     2 |    0 |    2 |     0 | no table rows                                                                                                                                                                                                                 |
| `team.spec.ts`                            |    10 |    8 |    2 |     0 | connection card has no `Host:`/`Username:` text; timeout (still failing after D2b, Q20)                                                                                                                                       |
| `alerts.spec.ts`                          |    25 |   20 |    1 |     4 | saved-search alert `table-row` never visible                                                                                                                                                                                  |
| `dashboards-list.spec.ts`                 |     7 |    6 |    1 |     0 | `Cluster` card locator also matches the Kubernetes card ("Kubernetes cluster"), strict-mode violation (Q20)                                                                                                                   |
| `search/histogram-group-by.spec.ts`       |    10 |    9 |    1 |     0 | group-by series values differ                                                                                                                                                                                                 |
| `search/json-add-to-filter.spec.ts`       |     1 |    0 |    1 |     0 | no table rows                                                                                                                                                                                                                 |
| `search/json-viewer-key-order.spec.ts`    |     1 |    0 |    1 |     0 | key order equals the alphabetical order the spec rejects                                                                                                                                                                      |
| `search/relative-time.spec.ts`            |    13 |   11 |    1 |     1 | timeout                                                                                                                                                                                                                       |
| `search/row-multi-select.spec.ts`         |    13 |   12 |    1 |     0 | selection count                                                                                                                                                                                                               |
| `search/shared-filters.spec.ts`           |     8 |    0 |    1 |     0 | `beforeEach` timeout; the other 7 did not run (serial block)                                                                                                                                                                  |
| `shared/multiline.spec.ts`                |     6 |    5 |    1 |     0 | `tab-trace` missing                                                                                                                                                                                                           |
| `dashboard-static-filters.spec.ts`        |     7 |    6 |    0 |     1 | flaky only                                                                                                                                                                                                                    |

Implications for R4:

1. Fix `useOnboardingCompletion.ts` first: one product fix should clear most of
   `route-smoke` (22) and the console-error noise in other specs.
2. "Table rows never render" is the most common symptom (search, span links,
   JSON, event patterns, select-star, filter keys, alerts). Find the shared
   cause (seeded collection, source, or query) before working spec by spec.
3. Trace side-panel tab missing (`traces-workflow`, `side-panel-navigation`,
   `multiline`) is probably one defect in log-to-trace correlation.
4. Kubernetes, sessions, heatmap, release markers, and services dashboard are
   separate feature slices; each may need seed data or a product fix.
5. The R4 list in section 9 (saved-search alert, heatmap and event deltas,
   Kubernetes, chart explorer SQL mode, ad hoc click filters, side-panel tabs,
   time-picker search, metrics specs) is superseded by this table.
   `chart-explorer`, `dashboard-adhoc-click-filters`,
   `correlated-metric-source`, and `metric-name-streaming` now pass.
6. R4 acceptance stays: `make e2e` green twice in a row on a clean stack. Size
   stays L; 115 failures across 28 specs, with about 6 shared root causes.
