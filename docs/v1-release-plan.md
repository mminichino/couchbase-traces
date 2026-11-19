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

| ID  | Item                                                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Proposed fix                                                                                                                                                                                                                                                                                                                                                                                     | Size                     | Depends on        |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ----------------- |
| B1  | 23 deferred API int suites never run (~880 cases)                                            | `packages/api/jest.int.config.js:22-63`; `docs/port-notes.md` "Phase 11 — Main CI int shards (K2)"                                                                                                                                                                                                                                                                                                                                                                          | Triage each suite in R0, then port the ClickHouse-shaped assertions to SQL++ shapes (same inputs, same result shape, rule 6) and drop the suite from the list. Split into R2a internal and external API, R2b alerts, R2c MCP                                                                                                                                                                     | L (three M/L sub-phases) | R0                |
| B2  | Playwright full-stack E2E disabled on Main                                                   | `.github/workflows/main.yml:297-320`; known gaps in port-notes K2: saved-search alert `table-row` empty, heatmap and event deltas, Kubernetes dashboard, chart explorer SQL-mode toggles, ad hoc dashboard click filters; Phase 7 notes: search side-panel tabs (3 tests), time-picker search (1), Couchbase `metric-name-streaming`, `metric-table-autofill`, `correlated-metric-source`                                                                                   | Fix the failing specs, then restore the `e2e-tests` `workflow_call` and the report aggregator from git history (this edits `.github/workflows/main.yml`; the phase is explicitly about CI)                                                                                                                                                                                                       | L                        | R0, R4 sub-items  |
| B3  | 4 `sources.spec.ts` specs fail on ClickHouse-era UI expectations                             | `packages/app/tests/e2e/features/sources.spec.ts:18` (`'Database'` label), `:289-290` (`Save anyway`), PUT with the GET payload; port-notes C5 "E2E smoke"                                                                                                                                                                                                                                                                                                                  | Update expectations to the Couchbase source form (bucket, scope, collection labels; the current save flow; PUT body shape the API accepts), following `.claude/skills/playwright/SKILL.md`                                                                                                                                                                                                       | S                        | none              |
| B4  | E2E fails with `authentication failure` when `CBT_COUCHBASE_ADMIN_PASSWORD` is exported      | `port/golden/lib/couchbase-init.sh:8` reads `CBT_COUCHBASE_ADMIN_PASSWORD`; `scripts/test-e2e.sh:173`, `packages/app/tests/e2e/global-setup-fullstack.ts:92`, `packages/app/scripts/run-e2e.js:84` hard-code `cbt-test-admin`                                                                                                                                                                                                                                               | `scripts/test-e2e.sh` sets `CBT_COUCHBASE_ADMIN_PASSWORD=cbt-test-admin` explicitly for the child processes it starts (golden init, Playwright), so the shell value can no longer leak in; one value, one place                                                                                                                                                                                  | S                        | none              |
| B5  | Webhook SSRF blocklist only knows `CLICKHOUSE_HOST`, which is unset in every real deployment | `packages/api/src/utils/validators.ts:105-121`; `packages/api/src/config.ts:135-137`                                                                                                                                                                                                                                                                                                                                                                                        | Block the hosts of `CBT_METADATA_CONNSTR`, `CBT_COUCHBASE_CONNSTR`, `DEFAULT_CONNECTIONS` hosts, and the ingest and collector endpoints, parsed with `parseConnStr` (`packages/common-utils/src/couchbase/connstr.ts:82`). Remove `CLICKHOUSE_*` from `config.ts`, `packages/api/.env.test:28-33`, and the `main.yml` int-job env (lines 179–182); tests seed connections from `CBT_COUCHBASE_*` | S                        | none              |
| B6  | Service map node latency percentiles are always NULL (parity gap)                            | `packages/app/src/couchbase/serviceMap.ts:158-159` (`NULL AS p50, NULL AS p95, NULL AS p99`); port-notes "Phase 7: traces"                                                                                                                                                                                                                                                                                                                                                  | Compute node percentiles the same way edge percentiles are computed (lines 153–156): `ARRAY_SORT(ARRAY_AGG(duration))` per node, index at `FLOOR(q * (n - 1))`. Port the upstream node-latency test. Fix before 1.0 (decision Q4)                                                                                                                                                                | M                        | none              |
| B7  | No image publish path; Makefile tags do not match compose                                    | `Makefile:255-289`: `build-app` and `build-otel-collector` tag `${IMAGE_NAME_DOCKERHUB}:…` with no registry, while `docker-compose.yml:49,63,90,113` pulls `${CBT_IMAGE_REPO}/…:${IMAGE_VERSION}`; only `${IMAGE_VERSION}${IMAGE_VERSION_SUB_TAG}` (e.g. `2.44.0`) is built, never the major tag `2` that compose uses; `version.sh:30` refers to a missing `make release`; `docker-build.yml` only builds with `push: false`                                               | Add `make release-images` (buildx, multi-arch from `BUILD_PLATFORMS`, `--push`) that tags `ghcr.io/mminichino/<image>:1.0.0`, `:1.0`, `:1` and `:latest` (decision Q2). Fix the registry prefix on every build target                                                                                                                                                                            | M                        | R6                |
| B8  | Versions are upstream's, and changesets cannot reset them                                    | see section 3                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `scripts/release/set-version.mjs` sets every version location in one pass, with a `--check` mode used in CI (section 5)                                                                                                                                                                                                                                                                          | M                        | R6                |
| B9  | "What's new" changelog link targets a tag scheme that will not exist                         | `packages/app/src/components/AppNav/useWhatsNew.ts:24-29` builds `blob/@couchbase-traces/app@<version>/CHANGELOG.md`                                                                                                                                                                                                                                                                                                                                                        | Link to `blob/v<version>/CHANGELOG.md` to match the `v1.0.0` tag                                                                                                                                                                                                                                                                                                                                 | S                        | none (Q3 decided) |
| B10 | Ingest image carries no version                                                              | `packages/ingest/Dockerfile` has no `ARG CODE_VERSION`, no `ENV CODE_VERSION`, no OCI labels; `packages/ingest/src/setup/cli.ts:189` passes `env.CODE_VERSION` as `appVersion`                                                                                                                                                                                                                                                                                              | Add `ARG/ENV CODE_VERSION` and `org.opencontainers.image.version` labels to the ingest image and the other three images                                                                                                                                                                                                                                                                          | S                        | R6                |
| B11 | MCP server reports `<version>-beta`                                                          | `packages/api/src/mcp/mcpServer.ts:53`                                                                                                                                                                                                                                                                                                                                                                                                                                      | Report `CODE_VERSION` without the suffix                                                                                                                                                                                                                                                                                                                                                         | S                        | none              |
| B12 | User-visible HyperDX branding left in shipped artifacts                                      | Root `package.json:2` name `hyperdx`; CLI config dir `~/.config/hyperdx/cli` (`packages/cli/src/utils/config.ts:5`); CLI compiled binary names `hdx-linux-x64` etc. (`packages/cli/package.json:33-35`); org API key service-account email domain `service-accounts.hyperdx.invalid` (`packages/api/src/controllers/orgApiKey.ts:52`); collector component ids `otlp/hyperdx`, `bearertokenauth/hyperdx`, `oidc/hyperdx` in `docker/otel-collector/config.standalone*.yaml` | Rename to `couchbase-traces`, `~/.config/couchbase-traces/cli` (read the old path once and migrate), `cbt-<os>-<arch>`, `service-accounts.couchbase-traces.invalid`, and `otlp/cbt` etc.                                                                                                                                                                                                         | S                        | none              |
| B13 | Status docs say the port is unfinished and images are unpublished                            | `README.md:3-7` ("being ported", "port is in progress"), `README.md` quick start "(when compose Phase 9 land is merged)"; `DEPLOY.md:16-27` ("not published yet", UI image listed without `ghcr.io`), `DEPLOY.md:38,113` and `LOCAL.md:21` use tag `:2`; `docs/development.md:71` uses `:2.44.0`                                                                                                                                                                            | Rewrite for 1.0: supported versions, image names and tags, upgrade notes                                                                                                                                                                                                                                                                                                                         | S                        | R6                |
| B14 | Stale "pending user decisions" in port-notes                                                 | `docs/port-notes.md:876-879`: local mode was removed in Phase 10 (`packages/app/src/config.ts` comment), and publishing the all-in-one image is undecided                                                                                                                                                                                                                                                                                                                   | Close the local-mode item; record the all-in-one decision (Q1: not published for 1.0)                                                                                                                                                                                                                                                                                                            | S                        | none              |
| B15 | Acceptance report predates Mongo elimination                                                 | `docs/acceptance.md` generated 2026-11-18 at `6599628`, 8 commits behind `main`; its K1 output still logs a Mongoose warning                                                                                                                                                                                                                                                                                                                                                | Re-run `port/acceptance/run.mjs` (all checks A1–M2) at the release-candidate commit with `--final`, record the CI run                                                                                                                                                                                                                                                                            | M                        | R1–R6             |
| B16 | Pinned Couchbase image may not be the latest 8.0.x maintenance release                       | `couchbase/server:enterprise-8.0.3` in `.env:22`, `Makefile`, `port/couchbase-test/docker-compose.yml`; AGENTS.md requires the latest 8.0.x on Docker Hub                                                                                                                                                                                                                                                                                                                   | Check Docker Hub in R0; bump if newer, record in port-notes                                                                                                                                                                                                                                                                                                                                      | S                        | none              |

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

| Phase | Scope                                               | Items                                                                                                                                                                     | Size | Depends on                    |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------- |
| R0    | Triage and quick fixes                              | B3, B4, B16, B14 (local-mode half), P5 (lower caps to measured)                                                                                                           | M    | —                             |
| R1    | Correctness and branding fixes                      | B5, B9, B11, B12, P2                                                                                                                                                      | M    | —                             |
| R2a   | Port deferred int suites: internal and external API | B1 (10 suites: `routers/api/{dashboard,iac,sources,connections}`, `routers/external-api/{charts,search,sources,sources-crud,connections}`, `middleware/queryAttribution`) | L    | R0                            |
| R2b   | Port deferred int suites: alerts                    | B1 (5 suites: `checkAlerts`, `multiChannelAlerts`, `renderAlertTemplate`, `singleInvocationAlert`, `providers/default`; ~274 cases)                                       | L    | R0                            |
| R2c   | Port deferred int suites: MCP                       | B1 (8 suites under `mcp/__tests__/`; ~278 cases)                                                                                                                          | L    | R0                            |
| R3    | Service map node latency                            | B6                                                                                                                                                                        | M    | —                             |
| R4    | Fix failing Playwright specs on the Couchbase stack | B2 (spec and app fixes)                                                                                                                                                   | L    | R0, R2a                       |
| R5    | Re-enable full-stack E2E on Main                    | B2 (restore `e2e-tests` `workflow_call` and report aggregator in `main.yml`)                                                                                              | S    | R4                            |
| R6    | Release tooling                                     | B7, B8, B10; delete `version.sh`; add `ingest` to changesets `fixed`                                                                                                      | M    | —                             |
| R7    | Docs and acceptance re-run                          | B13, B14, B15; `docs/release.md`                                                                                                                                          | M    | R1–R6                         |
| R8    | Release v1.0.0                                      | version bump, changelog, tag, images, GitHub release                                                                                                                      | S    | R7, explicit user instruction |

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

### R1: Correctness and branding fixes

B5 (blocked hosts module, delete `CLICKHOUSE_*` config and test env), B9
(`changelogUrl`), B11 (MCP version), B12 (root package name, CLI config dir with
migration, CLI binary names, service-account domain, collector component ids),
P2 (delete `packages/api/migrations/ch/`). Unit tests: `blockedHosts.test.ts`
(each env var, malformed connstr, IPv6, port expansion), `config.test.ts` for
the CLI migration, an updated `useWhatsNew` test, the MCP server version test.

Acceptance: `rg -n "CLICKHOUSE_(HOST|USER|PASSWORD)" packages .github` empty;
webhook to `http://<metadata host>:8091` rejected in a unit test;
`rg -n "hyperdx" packages/cli/src/utils/config.ts` shows only
`LEGACY_CONFIG_DIR`; `port/rebrand` verify and `port/remove-ch` verify still
pass.

### R2a / R2b / R2c: Deferred integration suites

Per suite: remove it from `deferredChIntSuites`, port assertions to SQL++ (same
inputs and result shapes), fix product bugs it exposes, keep the suite green in
`yarn ci:int` sharded. Snapshots that contain ClickHouse SQL are regenerated
only after a reviewer confirms the SQL++ text is equivalent. Cases that cannot
keep the result shape are listed in the PR and the plan, and the phase stops for
the user (rule 9).

Acceptance (end of R2c): `deferredChIntSuites` is an empty array and is then
deleted; `yarn ci:int` reports 0 ignored suites; the skipped count equals the
harness-only `metadata.couchbase.int.test.ts` count (51 today) and nothing else;
CI integration shards green within the 55 minute timeout (if not, add shards;
that is a workflow edit inside a CI-scoped phase).

### R3: Service map node latency

Add node p50/p95/p99 in `serviceMap.ts`; add a golden parity case to
`port/query-parity` (`--slice traces`); port or add the unit test. Acceptance:
node percentiles non-NULL on the parity dataset and within the parity tolerance
of the reference.

### R4: Playwright specs on Couchbase

Fix the spec or the product for each failure recorded in R0: saved-search alert
`table-row`, heatmap and event deltas, Kubernetes dashboard, chart explorer SQL
mode, ad hoc dashboard click filters, search side-panel tabs, time-picker
search, metrics specs (`metric-name-streaming`, `metric-table-autofill`,
`correlated-metric-source`). Follow `.claude/skills/playwright/SKILL.md`.
Acceptance: `make e2e` (all four shards) green twice in a row locally on a clean
stack.

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

All ten questions were answered by the user on 2026-11-19. No open questions
remain for the release as a whole; per-phase questions are raised in that phase.

| ID  | Question                                                    | Decision                                                                                                                                                           | Affects        |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| Q1  | Publish the all-in-one image (bundles Couchbase Server EE)? | No, not for 1.0. `make build-all-in-one` stays for local use; `DEPLOY.md` says so                                                                                  | R6, R7, R8     |
| Q2  | Image tag scheme                                            | `1.0.0`, `1.0`, `1`, and `latest` for non-prerelease releases from `main`                                                                                          | R6, R8         |
| Q3  | Git tag scheme and the `## v0.1.0` changelog entry          | Single product tag `v1.0.0`; fold the never-tagged 0.1.0 entry into 1.0.0                                                                                          | R1 (B9), R8    |
| Q4  | Service map node latency (B6)                               | Blocker; fix before 1.0 (R3)                                                                                                                                       | R3             |
| Q5  | Internal package versions                                   | Every package except `hdx-eval` moves to 1.0.0 and is lock-stepped (`api`, `app`, `ingest`, `otel-collector`, `common-utils`, `cli`, root); `hdx-eval` stays 0.3.3 | R6, R8         |
| Q6  | Publish the CLI                                             | Attach binaries to the GitHub release; no npm publish                                                                                                              | R8             |
| Q7  | OpenAPI `info.version`                                      | Stays `2.0.0` (versions the `/api/v2` contract, not the product)                                                                                                   | R8             |
| Q8  | Do the test gaps block 1.0?                                 | Yes, all of them: the 23 deferred API int suites (R2a, R2b, R2c) and full-stack E2E back on in CI (R4, R5). No fallback                                            | R2a–R2c, R4–R5 |
| Q9  | Changelog tooling                                           | Keep changesets for package changelogs; hand-write the root `CHANGELOG.md` release notes                                                                           | R6, R8         |
| Q10 | Release automation                                          | Local `make release-images` and `gh release create`; no new release workflow                                                                                       | R6, R8         |

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

| Risk                                                                        | Impact                        | Mitigation                                                                                       |
| --------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| R2 volume (~880 cases, `checkAlerts.int.test.ts` alone is 12,222 lines)     | schedule; the largest unknown | R0 triage first; split R2b further (alert windows vs templates) if a single PR gets unreviewable |
| Ported suites expose real SQL++ bugs in alerts or external API              | slip, but this is the point   | fix in the same phase; anything that cannot keep the result shape goes to the user (rule 9)      |
| E2E runtime on GitHub runners (shards already hit 25 minute timeouts)       | flaky or cancelled Main       | keep the 45 minute timeout, add shards rather than retries                                       |
| Couchbase Enterprise redistribution in the all-in-one image                 | legal exposure                | Q1: not published for 1.0                                                                        |
| ghcr package visibility defaults to private                                 | users cannot pull             | set each package public in ghcr settings once, after the first push (manual, on instruction)     |
| Version decrease confuses tooling (changesets, nx cache, Renovate if added) | wrong versions                | `set-version.mjs` is the single writer; `--check` in CI                                          |
| Shell env leaks into make/E2E                                               | false failures                | explicit env in scripts (B4)                                                                     |

## 13. Size summary

| Phase                                                | Size |
| ---------------------------------------------------- | ---- |
| R0 Triage and quick fixes                            | M    |
| R1 Correctness and branding fixes                    | M    |
| R2a Deferred API int suites (10 suites, ~327 cases)  | L    |
| R2b Deferred alert int suites (5 suites, ~274 cases) | L    |
| R2c Deferred MCP int suites (8 suites, ~278 cases)   | L    |
| R3 Service map node latency                          | M    |
| R4 Playwright specs on Couchbase                     | L    |
| R5 Re-enable E2E on Main                             | S    |
| R6 Release tooling                                   | M    |
| R7 Docs and acceptance                               | M    |
| R8 Release v1.0.0                                    | S    |

Roughly four to six weeks for one engineer, dominated by R2 and R4. Every phase
in the table blocks 1.0 (Q8).
