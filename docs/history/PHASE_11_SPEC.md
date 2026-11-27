# Phase 11 Spec: Acceptance

Spec date: 2026-11-12

Implements Phase 11 of `COUCHBASE_PORT_PLAN.md`. Where this spec and the plan differ, this spec wins. Constants in capitals are defined in `AGENTS.md`. Earlier phase terms are used as defined there.

## 1. Purpose

Prove the finished product meets the plan's acceptance list, with every check automated, repeatable from a clean checkout, and recorded as evidence:

1. One runner executes every check against freshly built stacks and writes a report.
2. A failed check is fixed in its own commit, then the whole run repeats from clean.
3. Checks that need the user (Capella credentials, open decisions, pushing to GitHub) stop with a clear request instead of passing or failing silently.

The phase ends with `docs/acceptance.md` showing every check passed locally, and, after the user authorizes a push, the GitHub Actions run recorded as passing.

## 2. Checks

| ID | Plan item | Check |
|---|---|---|
| `A1` | Parity rows | Every feature is `ported`, `replaced`, or `dropped` with sign-off; no `needs_decision`, `in_progress`, or `not_started` |
| `A2` | Parity rows | Every `ported` feature has at least one passing test in this run (section 5.2) |
| `A3` | Parity rows | Every app page entry point loads without errors (route smoke) |
| `B1` | Compose stack | A clean `docker compose up` from `.env.example` with generated secrets reaches healthy with no manual steps |
| `B2` | Sample data | After `make`-documented sample loading, every primary view shows data |
| `C1` | Capella | The connection test passes for a Capella `couchbases://` connection |
| `C2` | Capella | Every primary view shows data against Capella |
| `D1` | Index use | Every distinct statement the app issued during `B2` and `G1` uses an index or key lookup; no primary scan |
| `E1` | Read-only | Mutating and multi-statement SQL++ is rejected through every query entry point |
| `F1` | Latency | First page of a 7-day log search: p95 under 2 s on the dev stack |
| `G1` | Alerts | Every alert source × threshold type fires on sample data and notifies through each webhook service |
| `H1` | Branding, static | Phase 3 `verify branding` and Phase 10 `verify` pass |
| `H2` | Branding, rendered | No brand term in the rendered text of any page |
| `H3` | Branding, runtime | No brand term in image names, image labels, container names, or container env var names |
| `I1` | Outbound, browser | Browser requests during the view runs go only to the app's origin |
| `I2` | Outbound, server | No container resolves a blocked or unexpected external host during the runs |
| `J1` | Legal files | `LICENSE`, `NOTICE`, `UPSTREAM.md` correct |
| `J2` | Licenses | `docs/licenses.md` matches a fresh scan |
| `K1` | CI, local | Every CI job's command passes locally |
| `K2` | CI, GitHub | The GitHub Actions run for the pushed commit passes |
| `L1` | Secrets | No secrets committed |
| `M1` | Regression | Golden replay, `port/check.sh` against the Phase 1 baseline, and the full e2e suite pass |
| `M2` | Docs | `docs/development.md`, `docs/capella.md`, `docs/self-managed.md`, `docs/indexes.md`, `docs/data-model.md`, `docs/sqlpp-mapping.md`, `docs/parity.md`, `docs/licenses.md` exist, and generated ones are current |

## 3. Deliverables

```
port/acceptance/
  run.mjs                         runner: CLI, check registry, stack lifecycle, report
  checks/                         one module per check group (a.mjs ... m.mjs)
  lib/stack.mjs                   compose up and down, health waits, secrets generation
  lib/api.mjs                     API client: register, login, sources, queries, alerts
  lib/browser.mjs                 Playwright helpers: views, DOM text, request capture, timings
  lib/capture.mjs                 statement capture reader
  lib/dns.mjs                     DNS query log reader
  views.json                      primary views and their population assertions
  docker-compose.observe.yml      override: CoreDNS logger, statement capture, webhook receiver
  coredns/Corefile
  webhook-receiver/server.mjs     records webhook payloads
  README.md                       how to run, prerequisites, how to provide Capella credentials
packages/api/src/routers/api/couchbase.ts   statement capture behind CBT_QUERY_CAPTURE_FILE
packages/app/tests/e2e/features/route-smoke.spec.ts   generated route smoke
port/state/acceptance/
  report.json                     committed
  evidence/                       screenshots, timings, captures, logs; gitignored except summary.json
docs/acceptance.md                generated, committed
```

`port/.gitignore` gains `state/acceptance/evidence/` and the line `!state/acceptance/evidence/summary.json`.

## 4. Runner

### 4.1 CLI

```
node port/acceptance/run.mjs [--only <ids>] [--skip <ids>] [--capella] [--keep-stack] [--reuse-stack] [--record-ci <run-url>]
```

| Option | Effect |
|---|---|
| `--only`, `--skip` | Comma-separated check ids; a filtered run never produces a passing final report |
| `--capella` | Runs `C1` and `C2`; requires the variables in section 6.3 |
| `--keep-stack` | Leaves stacks running after the run, for debugging |
| `--reuse-stack` | Uses running stacks; for iteration only; a final report requires fresh stacks |
| `--record-ci <url>` | Fetches the GitHub Actions run at `url` and evaluates `K2` (section 6.11) |

Exit codes: 0 all selected checks passed; 1 any failed; 2 any blocked and none failed; 3 runner error.

### 4.2 Check interface

```ts
export type CheckStatus = 'pass' | 'fail' | 'blocked' | 'skipped';
export type CheckResult = {
  id: string; title: string; status: CheckStatus;
  summary: string;                     // one line
  details: unknown;                    // check-specific, JSON-serializable
  evidence: string[];                  // paths under port/state/acceptance/evidence/
  durationMs: number;
  request?: string;                    // for blocked: exactly what the user must do
};
export type Check = {
  id: string; title: string;
  needs: ('static' | 'dev_stack' | 'product_stack' | 'perf_stack' | 'capella_stack' | 'all_in_one')[];
  run(ctx: RunContext): Promise<CheckResult>;
};
export type RunContext = {
  root: string; evidenceDir: string; stacks: StackHandles; api: (stack: string) => ApiClient;
  browser: () => Promise<BrowserSession>; log(msg: string): void;
};
```

### 4.3 Order and stacks

| Stage | Stack | Checks |
|---|---|---|
| 1 | None | `A1`, `H1`, `J1`, `J2`, `L1`, `M2` |
| 2 | Product stack from `docker-compose.yml` with `.env.example` plus generated secrets, with the observe override | `B1`, `B2`, `A3`, `H2`, `H3`, `I1`, `I2`, `D1` (statements from this stage), `E1`, `G1` |
| 3 | Dev stack with 7 days of sample data | `F1` |
| 4 | Capella override (with `--capella`) | `C1`, `C2` |
| 5 | Local all-in-one build | Smoke test, part of `K1` |
| 6 | Test runners | `M1`, `A2`, `K1` |
| 7 | GitHub (with `--record-ci`) | `K2` |

Every stage that starts a stack tears it down with `down -v` at the end unless `--keep-stack` is set. Before stage 2, the runner removes `.volumes/` content for the project it uses (its own compose project name, `cbt-acceptance`, with its own volume paths), never the developer's dev volumes.

### 4.4 Report

`port/state/acceptance/report.json`:

```ts
type Report = {
  schemaVersion: 1;
  generatedAt: string;
  gitSha: string;
  dirty: boolean;
  final: boolean;              // true only for a full run, fresh stacks, clean tree, no filters
  environment: { os: string; dockerVersion: string; dockerCpus: number; dockerMemoryBytes: number; node: string; couchbaseImage: string };
  checks: CheckResult[];       // in the order of section 2
  status: 'pass_local' | 'pass' | 'fail' | 'blocked';
};
```

`status` is `fail` if any check failed; else `blocked` if any blocked; else `pass` if `K2` passed; else `pass_local`.

`docs/acceptance.md` is generated from the report: a table of id, title, status, and summary; then a section per check with its details rendered as a short table or list; the environment; and, for blocked checks, the requests. It starts with "Generated by port/acceptance/run.mjs; do not edit."

## 5. Static and test checks

### 5.1 `A1`: final feature status

Read `port/features.json` and `port/decisions.json`. Fail listing each feature not `ported`, `replaced`, or `dropped` with sign-off. Features still `needs_decision` (for example the careers page) make the check `blocked` instead, with `request`: "Decide each listed feature in port/features.json: set status dropped with decision.signedOffBy and decision.date, or tell the agent to port it." Also blocked if any entry in `decisions.json` has a `null` decision.

### 5.2 `A2`: tests per ported feature

From `port/state/inventory/parity.json`, each `ported` feature's unit, integration, and e2e tests, plus golden cases whose case files list the feature (each golden case file gains a `features` array in this phase, filled from the parity case's slice and the source kinds it touches). Using the results of stage 6, the feature passes if at least one mapped test or golden case ran and passed. A feature with no mapped test fails with "no test covers this feature"; the fix is to add one.

### 5.3 `A3`: route smoke

`route-smoke.spec.ts` is generated from `entrypoints.json`: for each `app_page` route of a non-dropped feature, with dynamic segments filled from objects created through the API (a dashboard, a saved search, a trace id and session id from sample data), log in, open the route, wait for network idle, and assert: HTTP 200 for the document, no uncaught page errors, no console errors except those matching `port/acceptance/console-allowlist.json` (entries need a reason), no failed same-origin requests (status ≥ 500 or network error). Screenshots go to evidence.

### 5.4 `H1`: static branding

Run `port/rebrand.sh verify branding` and `node port/remove-ch/verify.mjs`; both must exit 0.

### 5.5 `J1`: legal files

| File | Requirement |
|---|---|
| `LICENSE` | Byte-identical to the upstream license at the preflight commit (`git -C UPSTREAM_PATH show <sha>:LICENSE`, or the committed import's version if `UPSTREAM_PATH` is unavailable) |
| `NOTICE` | Contains `PRODUCT_NAME`, the upstream URL, the preflight SHA, and the upstream copyright line exactly |
| `UPSTREAM.md` | Its SHA equals `port/state/preflight.json` `upstream.sha`; its repository URL equals `ORIGIN_URL` without `.git` |

### 5.6 `J2`: license report current

Run `port/remove-ch/licenses.mjs` into a temporary file and compare with `docs/licenses.md`, ignoring the generation date line. Any difference fails, listing changed packages. The review list must be empty or each entry must have a line in `docs/port-notes.md` under "License review" stating the user's decision; otherwise `blocked` with a request listing the packages.

### 5.7 `L1`: secrets

Run gitleaks from its official container image at a pinned version over the full git history (`detect --source . --log-opts=--all`). Findings fail, except entries in `port/acceptance/gitleaks-allowlist.toml`, which may list only the documented development defaults from Phase 9 (`dev-*-password`, `dev-ingest-token-*`) and test fixtures, each with a comment giving the reason.

### 5.8 `M1`: regression

Run, recording each exit status and summary: `port/check.sh`, `port/golden/run.sh`, `port/couchbase-test/run.sh`, and the full e2e suite with the command `.github/workflows/e2e-tests.yml` runs (Couchbase-only after Phase 10). All must pass.

### 5.9 `M2`: docs

Each listed file exists. Generated files (`indexes.md`, `data-model.md`, `sqlpp-mapping.md`, `parity.md`, `licenses.md`) match a fresh generation. Hand-written docs contain no `TODO` or `TBD`.

### 5.10 `K1`: local CI

For each job in `.github/workflows/*.yml` that runs on `pull_request` or `push`, the runner reads its `run:` steps and executes the `make` and `yarn` commands they contain locally, in order, with the job's `env`. Steps using actions (checkout, setup-node, caches) are skipped. Docker-based steps run as written. Every executed step must exit 0. Also run `scripts/ci/smoke-all-in-one.sh` on a fresh local all-in-one build.

## 6. Stack checks

### 6.1 Observe override (`docker-compose.observe.yml`)

| Addition | Purpose |
|---|---|
| Service `dns` (CoreDNS, pinned image) on a fixed IP in the compose network, with a `Corefile` that logs every query and forwards to the host resolver | `I2` |
| `dns: [<dns service IP>]` on every service | Sends external lookups through the logger; Docker's embedded DNS still answers service names |
| `CBT_QUERY_CAPTURE_FILE=/capture/statements.ndjson` on `app`, with a volume to the evidence directory | `D1` |
| Service `webhook` running `webhook-receiver/server.mjs` on port 8080 | `G1` |
| `WEBHOOK_HOSTNAME_ALLOWLIST=webhook` on `app` | Lets alert webhooks reach the receiver (upstream blocks private addresses unless allowlisted) |

### 6.2 Statement capture

In `routers/api/couchbase.ts` and in the node data client, when `CBT_QUERY_CAPTURE_FILE` is set, append one line per executed statement: `{ "ts", "statement", "parameters", "connectionId", "queryContext" }`. Disabled by default; parameters are written as given (acceptance uses only sample data). Not added to the product docs.

### 6.3 Capella variables

`CBT_ACCEPT_CAPELLA_CONNSTR`, `CBT_ACCEPT_CAPELLA_ADMIN_USER`, `CBT_ACCEPT_CAPELLA_ADMIN_PASSWORD`, `CBT_ACCEPT_CAPELLA_QUERY_USER`, `CBT_ACCEPT_CAPELLA_QUERY_PASSWORD`, `CBT_ACCEPT_CAPELLA_INGEST_USER`, `CBT_ACCEPT_CAPELLA_INGEST_PASSWORD`. The cluster must be prepared per `docs/capella.md`. Missing variables make `C1` and `C2` `blocked` with the request: "Provide a Capella 8.x cluster prepared per docs/capella.md and set the CBT_ACCEPT_CAPELLA_* variables, then run with --capella." Data written to Capella goes to the documented bucket; the runner does not drop it.

### 6.4 `B1`: fresh product stack

Copy `.env.example` to a temporary env file, fill required secrets with random values (passwords 24 characters, token 48), and run `docker compose -p cbt-acceptance -f docker-compose.yml -f port/acceptance/docker-compose.observe.yml --env-file <tmp> up -d --build`. Pass when `couchbase-init` exits 0 and `app`, `ingest`, and `otel-collector` are healthy within 600 s. Evidence: `docker compose ps` output and the logs of `couchbase-init`.

### 6.5 `B2` and `C2`: views populated

1. Register a user through the API and read the team API key.
2. Run `yarn workspace @couchbase-traces/ingest sample-data --hours 2 --api-key <key>` against the stack's collector (the command documented in `docs/development.md`).
3. Wait until the logs source returns at least 1,000 rows for the last 2 hours, up to 180 s.
4. For each view in `views.json`, open it in Playwright, apply its setup, and evaluate its assertion. Take a screenshot.

`views.json` entries:

```ts
type View = { id: string; route: string; setup?: { action: 'click' | 'fill' | 'select'; selector: string; value?: string }[];
  assert: { kind: 'min_rows' | 'chart_has_series' | 'element_count' | 'text_present'; selector: string; min?: number; text?: string } };
```

Required views: log search (rows ≥ 50), trace search (rows ≥ 50), log histogram (series present), chart explorer with a count by service (≥ 3 series), a dashboard created from a template (every tile has data), trace waterfall for a sampled trace (spans ≥ 3), service map (nodes ≥ 4), metrics chart of the request counter (series present), sessions list (rows ≥ 1), session replay (player renders events), Kubernetes dashboard (every tile has data), services dashboard HTTP and database tabs (every tile has data), event patterns (patterns ≥ 1), event deltas (properties ≥ 1), alerts list (renders), and the Couchbase cluster page from Phase 5a (Queries, Infrastructure, and Status tabs each show data).

Selectors come from the existing e2e page objects in `packages/app/tests/e2e/page-objects/`; add `data-testid` attributes where an assertion needs one.

`C2` runs the same views against the Capella stack. On the cluster page, a tab or part showing Phase 5a's `restricted` or `not_configured` notice passes, because managed services restrict some management APIs; an error display fails.

### 6.6 `C1`: Capella connection

Through the API: test a connection with the Capella connection string and query credentials (Phase 4 `/couchbase/test`), expecting `success: true`; then `test-source` for the logs collection.

### 6.7 `D1`: index use

For each distinct statement in the capture from stages 2 and 4 (distinct by statement text after replacing parameter values), run `EXPLAIN` with the captured parameters and query context. Walk the plan:

| Result | Rule |
|---|---|
| Pass | Every keyspace scan operator is `IndexScan`, `IndexScan2`, `IndexScan3`, `DistinctScan`, `IntersectScan`, `UnionScan`, `OrderedIntersectScan`, `IndexFtsSearch`, `KeyScan`, or `ExpressionScan` |
| Fail | Any `PrimaryScan`, `PrimaryScan3`, or a planning error |
| Exempt | Statements on `system:` keyspaces, `INFER` statements, and `EXPLAIN` itself |

Details list each failing statement with its plan's scan operators and the feature that issued it (from the capture's attribution). Verify the operator names against `COUCHBASE_DOCS` before relying on the list.

### 6.8 `E1`: mutations rejected

Send each of these through the API's Couchbase query route, the MCP `sql` tool, and a raw SQL chart via `queryChartConfig`: `INSERT`, `UPSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE INDEX`, `DROP INDEX`, `CREATE COLLECTION`, `GRANT`, `EXECUTE FUNCTION`, `PREPARE ... INSERT`, a `SELECT` followed by `; DELETE ...`, and an `INSERT` hidden after a leading comment and parenthesis. Each must be rejected with `STATEMENT_NOT_ALLOWED` or `MULTIPLE_STATEMENTS`, and the logs collection's document count must be unchanged afterward. Also run Phase 4's integration case proving the server-side `readOnly` layer, against this stack.

### 6.9 `F1`: search latency

1. Start the dev stack fresh. Record Docker's CPU and memory.
2. Load `sample-data --hours 168 --seed 7` and wait until counts stop changing for 30 s.
3. Run the search page for logs over the last 7 days in Playwright: one warm-up, then 10 measured runs each for: no query; a bare-word query served by the Search index; and a field filter on `ServiceName`.
4. Measure, from Playwright network timing, the duration of the request that returns the first page of rows (start of request to end of response), and separately the time from submit to the first row rendering.

Pass when the p95 of the first-page request is under 2,000 ms for every query shape. Report p50 and p95 for both measures, plus the histogram and count request durations (reported, not gated). If Docker has fewer than 4 CPUs or 8 GB of memory, the check is `blocked` with a request to raise the Docker resources, because the result would not be meaningful.

A failing `F1` is fixed through indexes, query shape, or page-size defaults, never by narrowing the measured time range.

### 6.10 `G1`: alerts

1. Create webhooks of each service type (`generic`, `slack`, `incidentio`) pointing at `http://webhook:8080/<service>`.
2. For each alert source (`saved_search`, `tile`, `inline`) and each threshold type (`above`, `below`, `above_exclusive`, `below_or_equal`, `equal`, `not_equal`, `between`, `not_between`): first query the current value the alert would evaluate for the most recent complete 5-minute window, then create the alert with a 5-minute interval and a threshold chosen so the condition is true for that value. Rotate the three webhooks across alerts.
3. Also create one control alert per source whose condition is false.
4. Run the alert task (`check-alerts`) once in the API container.
5. Pass when every firing alert has state `ALERT`, a history entry with the measured value, and a payload at the receiver for its webhook; and every control alert is in a non-`ALERT` state with no payload.

Details: a matrix of source × threshold with outcomes, and the receiver's payloads.

### 6.11 `K2`: GitHub Actions

`blocked` until the user has pushed, with the request: "Push this commit to origin (ORIGIN_URL) and run the acceptance runner with --record-ci <workflow run URL>." The agent never pushes on its own. With `--record-ci`, fetch the run through the GitHub REST API (unauthenticated for a public repo; `GITHUB_TOKEN` if set), and pass when the run's head SHA equals the report's `gitSha` and its conclusion is `success`, along with every other workflow run for that SHA.

### 6.12 `H2`: rendered branding

During `A3` and `B2`, collect each page's `document.body.innerText` and the document title. Fail on case-insensitive `hyperdx`, `clickstack`, `clickhouse`, or `deploysentinel`, or a standalone `hdx`, listing page, term, and surrounding text. The "About" or attribution text that intentionally names HyperDX is allowed only if it matches `NOTICE`'s attribution wording, listed in `port/acceptance/brand-allowlist.json`.

### 6.13 `H3`: runtime branding

For the stage 2 stack and the all-in-one build: image repository names and tags, image labels (`docker image inspect`), container names, and environment variable names (`docker inspect`, names only) must not contain the brand terms in `H2`. Upstream third-party base image names (for example `otel/opentelemetry-collector-*`) are exempt.

### 6.14 `I1` and `I2`: outbound traffic

- **`I1`:** Playwright records every request in stages 2 and 4. All must be to the app's origin, or `data:` and `blob:` URLs. Any other host fails, listing the URL and the page.
- **`I2`:** From the CoreDNS log for the whole of stage 2, every queried name must be a compose service name, a reverse lookup, or in `port/acceptance/dns-allowlist.json`. The allowlist starts empty; an entry needs the service that makes the query and a reason (for example an OpenTelemetry endpoint the operator configured). Any query for `hyperdx.io`, `clickhouse.com`, `clickhouse.cloud`, a name containing `clickstack`, `reo.dev`, `greenhouse.io`, or `deploysentinel.com` fails regardless of the allowlist.

## 7. Fixing failures

1. A failed check gets a fix in its own commit, `Fix acceptance <id>: <summary>`, with a test that would have caught the failure. The fix follows the rules of the phase that owns the code (for example index changes go into `packages/ingest/src/model/collections.ts` and regenerate `docs/indexes.md`).
2. After fixes, run the full acceptance from fresh stacks; only a full run can produce a final report.
3. Goldens are not re-captured. If a fix intentionally changes a result, the golden case is updated in the same commit with a line in `docs/port-notes.md` explaining why, and the change must be reviewed by the user before `K2`; mark it in the report's `A2` details.
4. A check that cannot pass without a product decision (for example a slower-than-target query whose only fix removes a feature) is `blocked` with a request describing the options; the agent does not choose.

## 8. Errors

| Condition | Behavior |
|---|---|
| Docker not running, or compose missing | Runner error, exit 3 |
| A stack fails to become healthy | The dependent checks `fail`, with container logs in evidence |
| Playwright browser not installed | The runner installs Chromium through Playwright's installer, once |
| A check throws | That check `fail`s with the stack trace in details; other checks continue |
| Capella variables missing | `C1`, `C2` blocked |
| GitHub API rate limited | `K2` blocked with the rate limit reset time |
| Evidence directory not writable | Runner error, exit 3 |

## 9. Edge cases

| Case | Behavior |
|---|---|
| Developer's dev stack is running on the same ports | Stage 2 uses project `cbt-acceptance` with ports offset by 10000 through env; documented in the README |
| Sample data timestamps straddle a 5-minute window during `G1` | Thresholds use the last complete window at measurement time; the alert task runs within the same window, or the step is repeated once |
| `equal` threshold on a count | Threshold set to the measured count; the task runs before the next window starts |
| Capella cluster in a far region | `C2` assertions have no latency gates; `F1` runs only on the dev stack |
| A page legitimately calls a third-party host configured by the operator (for example a custom collector URL) | Not configured in the acceptance stack; would require a `dns-allowlist.json` entry with a reason |
| gitleaks flags upstream history before the import | History before the import is not in this repository; the import commit is scanned like any other |
| `K1` step needs secrets unavailable locally | Phase 3 removed such steps; if one remains, it is reported and the check fails |

## 10. Tests for the runner

Node's built-in runner, `port/acceptance/test/`:

| # | Case |
|---|---|
| 1 | Report status computation for combinations of pass, fail, blocked |
| 2 | `EXPLAIN` plan walker on recorded plans: index scan, FTS, key scan, primary scan, nested subquery with a primary scan |
| 3 | CoreDNS log parser and allowlist matching, including blocked names |
| 4 | Threshold chooser for each threshold type against a measured value |
| 5 | Route smoke generator fills dynamic segments and skips dropped features |
| 6 | `docs/acceptance.md` rendering from a fixed report |

## 11. Completing the phase

1. Implement sections 3 to 6 and the runner tests.
2. Run `node port/acceptance/run.mjs --capella` from a clean tree. Fix failures per section 7 and repeat until no check fails.
3. If only `K2` is blocked, commit `port/state/acceptance/report.json`, `evidence/summary.json`, and `docs/acceptance.md` as `Add acceptance report` and report to the user: the summary table, any blocked checks with their requests, and the instruction to push.
4. After the user pushes and gives the workflow run URL, run with `--record-ci <url>` (the other checks reuse the committed results only if the SHA is unchanged; otherwise run in full). Commit the updated report as `Record CI acceptance`. Do not push; the user does.

## 12. Acceptance criteria

- [ ] `port/acceptance/run.mjs` and its tests exist; the runner's tests pass.
- [ ] A full run from fresh stacks and a clean tree reports every check `pass` except `K2`, which is `blocked` pending the push.
- [ ] After the user pushes, `K2` passes and the report's status is `pass`.
- [ ] `docs/acceptance.md` shows every check with evidence summaries, the environment, the latency figures, the alert matrix, and the index usage results.
- [ ] Every fix made during this phase is its own commit with a test.
- [ ] No feature is `needs_decision` and no entry in `port/decisions.json` is undecided.
- [ ] The agent pushed nothing.
