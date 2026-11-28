# Couchbase Traces backlog

The open work after P3 (`@clickhouse/*` packages removed). Released and fixed
items stay in [`v1-release-plan.md`](./v1-release-plan.md) (section 2.2 for the
original post-1.0 list, section 9.1 for defects) and
[`port-notes.md`](./port-notes.md). An item moves out of this file when its PR
merges; record the outcome in `port-notes.md` under the release that ships it.

Target releases are proposals until the user assigns them. Patch releases
(`1.1.x`) take fixes and CI or tooling work with no user-visible change; minor
releases (`1.x.0`) take anything users or API clients can see.

## Summary

| ID | Title | Proposed target | Size | Blocked on |
| --- | --- | --- | --- | --- |
| R-1.1.0 | Record v1.1.0 digests and checksums | next PR (1.1.1) | XS | — |
| P9 | Harness: wait for rebalance before metadata provisioning | 1.1.1 | S | — |
| P5 | Lower lint warning caps to measured counts | 1.1.1 | S | — |
| P7 | Raise common-utils coverage floors to measured values | 1.1.1 | S | — |
| P6 | Make the jscpd clone check blocking | 1.2.0 | M | P6a |
| P6a | Fold the existing duplicate-code clones | 1.2.0 | M | — |
| P12 | Upstream TODOs (webhook signing first) | 1.2.0 (signing), later (rest) | M | design decision for signing |
| P1 | ClickHouse-named identifiers and legacy connection UI | 1.2.0 | M | — |
| P4 | Internal `hdx` / `HyperDX` naming | 1.2.0 (internal), 2.0.0 (header) | L | `x-hdx-team` transition decision |
| P16 | Browser telemetry on experimental OTel packages | watch | S | upstream releases |
| P17 | app lint headroom is one warning | 1.1.1 (with P5) | XS | — |
| F1 | Couchbase Node SDK 4.8 | when listed | S | Couchbase compatibility list |
| P8 | Rollup collections for value lists | only on regression | L | latency evidence |
| W1 | Q61 watch: E2E waits under CI load | watch | — | — |
| W2 | Flaky-test watch list | watch | — | — |
| W3 | Integration shard 2 balance | watch | — | a shard timeout |

## Items

### R-1.1.0: Record v1.1.0 digests and checksums

- **Description:** add the v1.1.0 image digests (`couchbase-traces`
  `sha256:d7944dc5…`, `-ingest` `sha256:7e4813c5…`, `-otel-collector`
  `sha256:6bd36a13…`) and the CLI SHA-256 sums to `docs/port-notes.md`, as was
  done for v1.0.1.
- **Rationale:** the release notes are the only other record; port-notes is
  where earlier releases keep them.
- **Target:** the next PR after P3 (it is not part of P3's scope).
- **Dependencies:** none.
- **Acceptance:** `docs/port-notes.md` has a v1.1.0 published-artifacts entry
  whose digests match `docker buildx imagetools inspect` for tag `1.1.0` and
  whose checksums match the release assets.

### P9: Harness waits for rebalance before metadata provisioning

- **Description:** `port/couchbase-test/run.sh` once failed in
  `provision-metadata.js` with `UnambiguousTimeoutError` right after a
  "rebalance in progress" index-create retry; a rerun passed (port-notes C1).
  `docker/couchbase/init.sh` should wait until no rebalance is running
  (`GET /pools/default/rebalanceProgress` reports `none`) before provisioning.
- **Rationale:** a CI flake in the live-cluster suite costs a re-run and masks
  real failures.
- **Target:** 1.1.1.
- **Dependencies:** none.
- **Acceptance:** `init.sh` polls rebalance status with a bounded timeout and
  fails with a clear message when it expires; ten consecutive
  `bash port/couchbase-test/run.sh` runs pass; `make ci-int` unchanged.

### P5: Lower lint warning caps to measured counts

- **Description:** `--max-warnings` is api 312, app 496, common-utils 82.
  Measured on the P3 branch: api 310, app 495, common-utils 80. Set each cap to
  its measured count and make `scripts/ci/ratchet.mjs` (or a sibling) fail when
  a cap is above the measured count, so caps only go down.
- **Rationale:** a cap above the count lets new warnings in silently.
- **Target:** 1.1.1.
- **Dependencies:** none (P17 is the app-specific note).
- **Acceptance:** each package's cap equals its measured warning count;
  `make ci-lint` green; a cap above the count fails CI.

### P7: Raise common-utils coverage floors

- **Description:** `packages/common-utils/jest.config.js` floors are 76 / 63 /
  72 / 77 (statements, branches, functions, lines), set in Phase 11. Measure
  `yarn ci:unit --coverage` and raise each floor to the measured value rounded
  down to the integer.
- **Rationale:** floors far below the real coverage do not catch a drop.
- **Target:** 1.1.1.
- **Dependencies:** none.
- **Acceptance:** floors are within 1 point of measured coverage;
  `make ci-unit` green.

### P6a: Fold the existing duplicate-code clones

- **Description:** `yarn dupes:all` reports 100 clones (1.07%). The only clone
  not on `main` that P3 leaves is the 27-line import header shared by
  `NamespaceDetailsSidePanel.tsx` and `NodeDetailsSidePanel.tsx` (pre-existing;
  P3 changed one import line in each). Review each clone; fold the real
  duplicates into shared helpers and add the intentional ones to `.jscpd.json`
  ignores with a reason.
- **Rationale:** P6 cannot become blocking while the baseline has real
  duplicates.
- **Target:** 1.2.0.
- **Dependencies:** none.
- **Acceptance:** `yarn dupes:all` lists only clones that are ignored with a
  reason; tests green.

### P6: Make the jscpd clone check blocking

- **Description:** `.github/workflows/jscpd.yml` runs with
  `continue-on-error`, and the Makefile runs `-yarn dupes`, so new clones never
  fail a build.
- **Rationale:** duplication grows unnoticed.
- **Target:** 1.2.0.
- **Dependencies:** P6a.
- **Acceptance:** a PR that adds a clone over the configured size fails
  `jscpd` and `make ci-lint`; `main` is green.

### P12: Upstream TODOs

- **Description:** upstream `TODO`s that the port did not touch, for example
  `packages/api/src/tasks/checkAlerts/transports/generic.ts:203` ("handle real
  webhook security and signage") and six in `packages/api/src/controllers/ai.ts`
  (dedup with `DBSearchPageFilters`, JSON support, sort order, recovery logic).
- **Rationale:** webhook signing has security value: receivers cannot verify
  that an alert came from this server. The others are code-quality items.
- **Target:** webhook signing in 1.2.0 (user-visible: new webhook setting and
  header); the rest as normal backlog.
- **Dependencies:** a decision on the signing scheme (HMAC-SHA256 over the body
  with a per-webhook secret, header name, rotation).
- **Acceptance (signing):** each webhook can have a secret; deliveries carry a
  timestamped HMAC header; docs show verification; unit tests cover signing,
  missing secret (no header), and rotation; existing webhooks keep working.

### P1: ClickHouse-named identifiers and legacy connection UI

- **Description:** `toQuotedClickHouseKeyExpression` (31 refs),
  `toClickHouseKeyExpression`, `cleanClickHouseExpression`,
  `ClickhouseSettingForm` / `useUpdateClickhouseSettings`
  (`TeamQueryConfigSection.tsx`), `hasClickHouse` in `connection.ts`,
  `ConnectionForm.tsx` "ClickHouse (no longer supported)". The two "ClickHouse
  Terraform provider" strings stay: that provider is ClickHouse's (D2b).
- **Rationale:** the names describe a data store this product does not use and
  slow down anyone reading the code.
- **Target:** 1.2.0.
- **Dependencies:** none; stored `kind` values and IaC names that clients send
  keep their wire names.
- **Acceptance:** no `ClickHouse`/`Clickhouse` identifiers in `packages/*/src`
  outside the allowlisted wire names; remove-ch verify and the rebrand verify
  pass; tests green.

### P4: Internal `hdx` / `HyperDX` naming

- **Description:** 28 `hdx`/`HDX_` references in `packages` (`HDX_*` constants
  in `packages/app/src/config.ts`, `hdxMTViews.ts`, `hdxDebug.ts`), the
  `x-hdx-team` header the CLI sends, the `packages/hdx-eval` package name, and
  dev tooling paths `~/.config/hyperdx/{dev-slots,nx-cache}`.
- **Rationale:** consistency with the product name.
- **Target:** internal names in 1.2.0. The `x-hdx-team` header is part of the
  API contract: accept both `x-hdx-team` and `x-cbt-team` from 1.2.0, and drop
  the old name no earlier than 2.0.0.
- **Dependencies:** a decision on the header transition period.
- **Acceptance:** no `hdx` identifiers outside the header compatibility shim
  and `docs/upstream/`; the API accepts both headers with a test for each; the
  CLI sends the new one.

### P16: Browser telemetry on experimental OTel packages (new in P3)

- **Description:** the browser telemetry ported in P3 depends on
  `@opentelemetry/browser-sdk` 0.6 and `@opentelemetry/browser-instrumentation`
  0.9 (pre-1.0, ESM only) and `@rrweb/record` ~2.2. Minor releases of pre-1.0
  packages may break the API; `@opentelemetry/browser-sdk/session` cannot be
  loaded by the app's Jest setup, so tests use a local `SessionSource` stand-in.
- **Rationale:** an upstream break would silently stop browser telemetry or
  session replay.
- **Target:** watch; review on every Renovate/Dependabot bump of these packages.
- **Dependencies:** upstream releases.
- **Acceptance (per bump):** `src/telemetry` tests pass, and a manual or E2E
  check shows a session with a replay in the Sessions page.

### P17: app lint headroom is one warning (new in P3)

- **Description:** P3 removed 25 unsafe-assertion warnings from its own code,
  but the app now measures 495 warnings against a cap of 496, so the next
  warning anyone adds fails CI.
- **Rationale:** that is the intended ratchet behaviour, but it surprises
  contributors; P5 makes it explicit.
- **Target:** 1.1.1, folded into P5.
- **Dependencies:** P5.
- **Acceptance:** covered by P5.

### F1: Couchbase Node SDK 4.8

- **Description:** move `couchbase` from 4.7.2 (api, common-utils, ingest) to
  4.8.x, which fixes a teardown hang (JSCBC-1520/1522) suspected in the PR #27
  CI stall.
- **Rationale:** the int-test watchdog (Q38) only fails fast; 4.8 removes the
  cause.
- **Target:** the first release after Couchbase lists 4.8 for Server 8.0.
- **Dependencies:** blocked on the Couchbase SDK compatibility list; on
  2026-11-27 it showed Node SDK 4.7 for Server 8.0, not 4.8 (AGENTS.md: use
  the release that lists Server 8.0).
- **Acceptance:** all three packages on the same 4.8.x; `make ci-int`,
  `bash port/couchbase-test/run.sh` and `make e2e` green; the watchdog stays.

### P8: Rollup collections for value lists

- **Description:** Phase 5 did not build `otel_*_kv_rollup_15m`; field-value
  lists sample instead.
- **Rationale:** only needed if field-value latency regresses on large data.
- **Target:** only on measured regression.
- **Dependencies:** latency evidence (field-value p95 against a stated budget).
- **Acceptance:** defined when evidence opens it; it would include rollup
  writes in ingest, index definitions, and parity tests for value lists.

### W1: Q61 watch, E2E waits under CI load

- **Description:** accepted (user, 2026-11-25): no timeout increases. When a
  spec misses a wait under CI load, open a D-numbered fix that makes the query
  cheaper or the wait correct. D32 (Kubernetes charts) and the v1.0.2
  `dashboard-container` and raw-SQL table-cell fixes came from this watch.
- **Target:** ongoing.
- **Acceptance:** each recurrence gets a D-numbered entry with root cause; no
  Playwright timeout changes.

### W2: Flaky-test watch list

- **Description:** tests that failed intermittently and were fixed, kept on
  watch: D8 (MCP reads of freshly written rows), D12 (grouped alert history
  order), D18 (common-utils live tests), D19 (`make ci-int` exit 1 after a green
  run), team "should cancel team name editing" (fixed in v1.1.0), and the P9
  harness timeout.
- **Target:** ongoing.
- **Acceptance:** a recurrence reopens the item as a new D-number with the run
  link; three clean CI runs after a fix close it.

### W3: Integration shard 2 balance

- **Description:** shard 2 runs about 30 of its 55 minutes in tests (PR #42
  timings); shard policy (user, 2026-11-24): no shard changes unless a shard
  actually times out, then report before changing anything.
- **Target:** watch.
- **Dependencies:** a shard timeout.
- **Acceptance:** on a timeout, a report with per-shard timings precedes any
  change.
