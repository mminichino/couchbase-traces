# MongoDB elimination plan

Status: **complete** (phases C0–C5 shipped; final state in [Final state](#12-final-state-c5)). Approved direction revision 2, 2026-11-18. Owner decisions are recorded in [Decisions](#decisions). Remaining questions are in [Open questions](#10-open-questions).

Goal: store all Couchbase Traces app metadata (teams, users, sessions, connections, sources, saved searches, dashboards, alerts, alert history, webhooks, favorites, pinned filters, preset dashboard filters, invites) in a dedicated Couchbase Server Enterprise 8.x / Capella metadata bucket. After this plan, no Mongo containers, Mongo drivers, or Mongo env vars are left. Every feature keeps working, and the URL/API/MCP/CLI wire shapes stay the same.

Couchbase Traces is a new utility with **no existing Mongo installs**. Nothing is imported, migrated, or kept backward-compatible with stored Mongo data. MongoDB is only a development-time dependency inherited from upstream HyperDX, and this plan removes it.

This plan follows `AGENTS.md`. Work one phase at a time. Each phase ends with `make ci-lint` and `make ci-unit` green, plus the integration suites named in that phase, and then one commit. The upstream tests are the specification (rule 6): each entity's tests move with the entity. Mongo code is deleted in the last phase. Anything dropped needs written sign-off recorded via `port/features.json` and then `port/inventory.sh render` (`docs/parity.md` is generated, so do not edit it by hand).

## 0. Verified current state (inventory)

Every path below was checked against the tree at `eb21734` (branch `mm--mongo-elimination-plan`).

- `COUCHBASE_PORT_PLAN.md` does not exist at the repo root. Only a test fixture copy exists at `port/inventory/test/fixtures/repo/COUCHBASE_PORT_PLAN.md`. `docs/port-notes.md` already records this as a Phase 0 waiver. This plan stands alone and does not depend on that file.
- Dependencies (`packages/api/package.json`): `mongoose ^6.13.12`, `mongodb ^6.15.0`, `connect-mongo ^4.6.0`, `@hyperdx/passport-local-mongoose ^9.0.1`, dev `migrate-mongo ^11.0.0`. `couchbase 4.7.2` is already pinned (it supports Server 8.0).
- Scale of the change: 167 Mongoose model call sites in 40 non-test files under `packages/api/src` + `scripts`, and about 1,150 model call sites in 72 test files. 52 test files use `connectDB`/`clearDBs`/`closeDB`.

### 0.1 Models (`packages/api/src/models/`)

| Model (Mongo collection) | Key fields / refs | Indexes (unique in **bold**) | Special behavior |
|---|---|---|---|
| `Team` (`teams`) | name, allowedAuthMethods[], hookId, apiKey (uuid default), collectorAuthenticationEnforced, isMetricsSeriesTableEnabled, CH/CB query settings, queryScanConsistency enum, queryMaxParallelism 1–64 | none (lookups by `apiKey`, `findOne({})`) | Single team per deployment (`createTeam` throws if one exists; `getTeam` = `findOne({})`). `LOCAL_APP_TEAM` id `'_local_team_'` cast to ObjectId `5f6c6f63616c5f7465616d5f`. |
| `User` (`users`) | email (lowercased), name, team→Team, accessKey (uuid default), isVirtual, expiresAt/lastUsedAt/revokedAt, createdBy→User, onboardingData{completedTasks[] enum, isDismissed}, hash, salt (select:false, added by the plugin) | **email**, **accessKey** | `passport-local-mongoose` plugin (pbkdf2), virtual `hasPasswordAuth`. Org API keys are virtual users with `accessKey = sha256(key)`. |
| `TeamInvite` (`teaminvites`) | teamId→Team, name, email, token | **(teamId,email)**, TTL `createdAt` 30d | Looked up by `token`, which has no index today. |
| `Connection` (`connections`) | team, name, host, username, password (select:false), kind enum clickhouse/couchbase (default clickhouse), wanProfile, tlsCaCertificate (select:false), monitorUsername, monitorPassword (select:false), managementPort, platformProvisioned (tri-state, no default), unsupported, isPrometheusEndpoint, hyperdxSettingPrefix | (team,_id) | `dataLayerSetup.ts` loads Couchbase connection configs from this model. |
| `Source` (`sources`) | discriminator `kind` (log/trace/session/metric/promql), team, connection→Connection, from{databaseName,scopeName,tableName}, querySettings[≤10], kind-specific expression fields, metricTables (no `_id`), metadataMaterializedViews | (team,_id) | Discriminator models `LogSource`/`TraceSource`/`SessionSource`/`MetricSource`/`PromqlSource`; `minAutoGranularity` setter `''→undefined`. |
| `SavedSearch` (`savedsearches`) | team (immutable), name, select, where, whereLanguage, orderBy, source→Source, tags[], filters[], createdBy (immutable), updatedBy | (team,_id) | Method `toExternalJSON()`. Populates `createdBy`/`updatedBy` (`email name`). |
| `Dashboard` (`dashboards`) | name, tiles (Mixed), team (immutable), tags[], filters[], savedQuery/Language, savedFilterValues, savedDateRange, containers, createdBy (immutable), updatedBy, provisioned | **(name,team) partial `provisioned:true`**, (team,_id) | Provisioner upserts with `$setOnInsert`. |
| `Alert` (`alerts`) | threshold/Max/Type, interval, scheduleOffsetMinutes (validator < interval), scheduleStartAt, channel/channels (Mixed), state enum, source enum (default saved_search), team, createdBy, name/message/note, displayName, tags (default undefined), groupBy, savedSearch, dashboard, tileId, chartConfig, numConsecutiveWindows ≥1, silenced{by,at,until}, executionErrors[] | (team,_id), (team,displayName,_id) | Keyset cursor on (displayName,_id), with null and missing as one block. Regex search on displayName. |
| `AlertHistory` (`alerthistories`) | alert→Alert, counts, createdAt (set explicitly), state, lastValues[{startTime,count}], group, fired, groupValues[{key,value}], errors[], analytics{…} | TTL `createdAt` 30d, (alert,createdAt -1), (alert,group,createdAt -1) | Aggregations in `controllers/alertHistory.ts` (3) and `tasks/checkAlerts/index.ts` (2). Upserts the ERROR row keyed by (alert,createdAt,state). |
| `Webhook` (`webhooks`) | team, service enum, name, url, description, titleEmoji, queryParams/headers (Mongoose `Map`), body | **(team,service,name)**, (team,_id) | `toJSON({flattenMaps})`. No `id` virtual in JSON. |
| `Favorite` (`favorites`) | user, team, resourceType enum, resourceId | **(team,user,resourceType,resourceId)** | |
| `PinnedFilter` (`pinnedfilters`) | team, source, fields[], filters (Mixed) | **(team,source)** | |
| `PresetDashboardFilter` (`presetdashboardfilters`) | name, team, source, sourceMetricType, presetDashboard enum, type, expression, where, whereLanguage | none | |

Other Mongo state:

- Sessions: `connect-mongo` `sessions` collection, created in `packages/api/src/api-app.ts`. Cookie maxAge is 30 days, `rolling: true`.
- `migrate-mongo` `changelog` collection, configured in `packages/api/migrate-mongo-config.ts`. Migrations live in `packages/api/migrations/mongo/`: `20231130053610-add_accessKey_field_to_user_collection.ts`, `20261112220000-add_kind_to_connections.ts`, `20261113200000-disable_legacy_connections.ts`. `packages/api/migrations/ch/` holds ClickHouse leftovers and is out of scope.
- Startup backfill: `packages/api/src/migrations.ts` (`backfillAlertDisplayFields`, which uses `bulkWrite` with `timestamps:false`).
- Under D2/D7 none of these are ported. They exist only to transform data from earlier upstream releases, and Couchbase Traces has none.

### 0.2 Mongo-specific constructs in use (non-test)

- Operators: `$set` 29, `$unset` 20, `$in` 18, `$ne` 11, `$sort` 9, `$push` 7, `$first` 7, `$or` 6, `$match` 6, `$gte/$gt/$lte/$lt`, `$setOnInsert` 4, `$regex` 2, `$addToSet` 2, `$exists` 1, `$all` 1, `$project`, `$limit`, `$unwind` + `$group` (tags).
- `populate('createdBy'|'updatedBy', 'email name')`: `controllers/alerts.ts`, `controllers/savedSearch.ts`, `controllers/dashboard.ts`, `routers/api/orgApiKeys.ts`.
- `aggregate`: `controllers/alertHistory.ts` (×3), `controllers/team.ts#getTags`, `tasks/checkAlerts/index.ts#getPreviousAlertHistories`/`getConsecutiveWindowHistories`.
- Multi-doc and bulk: `updateMany` (`controllers/user.ts#deleteTeamMember` reassigns `Alert.createdBy`), `deleteMany` (`controllers/alerts.ts`, `providers/default.ts`, `scripts/seed-alerts.ts`), `insertMany` (seed script), `bulkWrite` (`migrations.ts`), `User.collection.insertOne` (member restore).
- No transactions and no change streams. `deleteTeamMember` works around the lack of transactions with delete-then-restore.
- ObjectId usage: `mongoose.Types.ObjectId` / `mongodb.ObjectId` in `utils/zod.ts#objectIdSchema` (`isValid`, which also accepts any 12-character string), `controllers/sources.ts`, `controllers/orgApiKey.ts`, `controllers/user.ts`, `controllers/team.ts`, `routers/api/webhooks.ts`, `routers/external-api/v2/search.ts`, `mcp/utils/errors.ts`, `mcp/tools/query/helpers.ts`, `tasks/checkAlerts/index.ts`, `tasks/checkAlerts/providers/default.ts`, `fixtures.ts#randomMongoId`.
- Duplicate-key detection: `utils/errors.ts#isDuplicateKeyError` (code 11000), and `routers/external-api/v2/team.ts` (`err.code === 11000`).
- Connection lifecycle: `models/index.ts` (`connectDB`, `connectDBWithRetry`, `mongooseConnection`, counter `cbt.mongodb.connection_events`), `server.ts`, `serverless.ts`, `utils/readiness.ts` + `routers/api/root.ts` (`/ready` returns `mongo: <readyState>`), `tasks/checkAlerts/providers/default.ts#init` (`autoIndex:false`).
- Auth: `utils/passport.ts` (`User.authenticate()` from the plugin; `serializeUser` stores `_id`), `routers/api/root.ts` (`User.register` ×2, `TeamInvite.findByIdAndRemove`), `middleware/auth.ts` (`Express.User extends UserDocument`; local-mode synthetic ids).

### 0.3 How ids reach clients

- JSON keeps both `_id` and `id`, because Mongoose `toJSON: {virtuals|getters: true}`. Webhook, TeamInvite, and User omit `id`. `packages/app` reads `_id` in 58 places. `packages/cli/src/api/client.ts` types `_id: string`. `common-utils/src/types.ts` schemas (`WebhookSchema`, `AlertsPageItemSchema`, `TeamApiResponseSchema`) require `_id`.
- The 24-hex shape is a hard contract in several places: `common-utils/src/iac.ts#IAC_RESOURCE_ID_RE` (Terraform emit), `types.ts` IaC manifest `id` regex, `isPersistableUserId` (app onboarding), and external API v2 `objectIdSchema` validators. ObjectId timestamp order is also relied on for `_id` sorts and keyset cursors.
- `__v` is emitted. `routers/api/webhooks.ts` and `controllers/savedSearch.ts` strip it explicitly.

### 0.4 Infrastructure that references Mongo

`docker-compose.yml` (`db` service, `MONGO_URI`), `docker-compose.dev.yml`, `docker-compose.ci.yml`, `packages/app/tests/e2e/docker-compose.yml`, `port/golden/docker-compose.yml` (`mongo:7`), `docker/hyperdx/Dockerfile` (`MONGODB_VERSION=8.0.38`, noble apt repo, image labels), `docker/hyperdx/entry.cbt.sh` and `entry.local.base.sh` (`mongod`), `port/couchbase-test/run.sh` (throwaway `mongo:5.0.32-focal`), `port/stack-smoke/run.sh`, `scripts/ci/smoke-all-in-one.sh`, `scripts/test-e2e.sh` (mongosh health), `scripts/slots.sh` + `Makefile` (`CBT_*_MONGO_PORT`, `dev-migrate-db`), `scripts/dev-env.sh`, `scripts/dev-portal/*`, `.github/actions/e2e-setup/action.yml`, `.github/workflows/main.yml` (comment), `.github/workflows/docker-build.yml` (label), `packages/api/.env.{development,test,e2e}`, `packages/app/playwright.config.ts`, `packages/app/tests/e2e/global-setup-fullstack.ts` + `utils/db-helpers.ts` (`runMongoshScript`), `docker/hostmetrics/config.dev.yaml` (`mongodb` receiver), `packages/api/eslint.config.mjs` (`allowModules: ['mongodb', …]`, ignores `migrate-mongo-config.ts`). Self-telemetry (`packages/api/src/telemetry.ts`) uses `@clickhouse/clickstack-node` auto-instrumentation, which carries the mongodb/mongoose instrumentations. No explicit Mongo instrumentation package is listed. Docs: `DEPLOY.md`, `CONTRIBUTING.md`, `docs/development.md`, `docs/self-managed.md`, `docs/capella.md`, `agent_docs/{architecture,development,tech_stack,observability,code_style}.md`, `AGENTS.md` (repository layout line).

### 0.5 Couchbase 8.0 features relied on (checked against `COUCHBASE_DOCS`)

| Feature | Source | Use |
|---|---|---|
| Scopes/collections, collection `maxTTL`, per-document expiry, mutations without `preserveExpiry` clear expiry | server/8.0/learn/data/expiration.html | TTL for alert history, invites, sessions |
| Distributed ACID transactions (Read Committed / MAV), KV + SQL++ mixed, `_txn:atr-*` metadata, custom metadata collection, single-node durability caveat (replicas must be 0) | server/8.0/learn/data/transactions.html; nodejs-sdk/current/howtos/distributed-acid-transactions-from-the-sdk.html | Uniqueness lookup docs + entity writes, member deletion |
| Scan consistency `not_bounded` (default) / `at_plus` / `request_plus` / `statement_plus` | server/8.0/learn/services-and-indexes/indexes/index-replication.html | `request_plus` default for metadata queries |
| `ORDER BY … NULLS FIRST/LAST`; MISSING sorts before NULL in ASC; strings use raw UTF-8 byte collation | server/8.0/n1ql/n1ql-language-reference/orderby.html | Alerts keyset cursor parity |
| Sub-document `arrayAddUnique` (`PathExistsError`), `upsert`/`remove`, CAS | nodejs-sdk/current/howtos/subdocument-operations.html | `$addToSet`, `$set`/`$unset`, concurrent partial updates |
| RBAC roles `data_reader`, `data_writer`, `query_select`, `query_insert`, `query_update`, `query_delete`, `query_manage_index`, `scope_admin` | server/8.0/learn/security/roles.html | Metadata service user |
| Magma with 128 vBuckets is the 8.0 default and has a 100 MiB per-node minimum quota (1024 vBuckets: 1 GiB) | server/8.0/learn/buckets-memory-and-storage/storage-engines.html | Small dedicated metadata bucket |
| No unique GSI | (GSI has no unique constraint) | Lookup documents |

Enterprise-only items we use: window functions (`ROW_NUMBER() OVER`), index replicas, and transactions on Capella and EE.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Separate metadata bucket** `CBT_METADATA_BUCKET` (default `cbt_meta`), scope `CBT_METADATA_SCOPE` (default `app`), on the same cluster by default (`CBT_METADATA_CONNSTR` falls back to `CBT_COUCHBASE_CONNSTR`). | User decision. It also gives an independent RAM quota, no interaction with the telemetry collections' TTLs, independent backup/restore, and an RBAC boundary: connection passwords live in metadata, and the telemetry query user that powers raw SQL++ in the UI must never be able to read them. |
| D2 | **No import tool, no data migration, no Mongo compatibility.** | User decision: new utility with no existing installs. |
| D3 | **Custom Couchbase KV session store.** | User decision. KV only, per-document expiry, `touch` for `rolling: true`. No session-cutover handling. |
| D4 | **Password hashing: Node `crypto.scrypt`**, async (runs on the libuv threadpool), N=2^15, r=8, p=3, 64-byte key, 16-byte random salt, `maxmem` 64 MiB. Stored as one self-describing string `scrypt$1$N=32768,r=8,p=3$<salt b64url>$<hash b64url>`; verified with `crypto.timingSafeEqual`. | Memory-hard, so it is far more resistant to GPU cracking than pbkdf2-sha256. Built into Node 22, so no native addon and no new dependency. The parameters are one of the OWASP Password Storage Cheat Sheet's equivalent scrypt configurations (32 MiB per hash), affordable at login rates. The encoded parameters let a future release raise the cost and rehash on the next successful login. No passport-local-mongoose compatibility is needed (D2). |
| D5 | **Keep 24-hex ObjectId-format ids**, generated in-repo (`metadata/ids.ts`: 4-byte big-endian seconds + 5-byte per-process random + 3-byte counter, hex). **No `bson` dependency.** | Existing data is not the reason; the code is. Several places hard-depend on the shape: `common-utils/src/iac.ts#IAC_RESOURCE_ID_RE` (Terraform emit sink), the IaC manifest Zod `id` regex in `common-utils/src/types.ts`, `isPersistableUserId` (app onboarding, `DBSearchPage.tsx`, `dashboard.ts`), `api/src/utils/zod.ts#objectIdSchema` (external API v2 validators and OpenAPI docs), `mongoose.isValidObjectId` guards in `controllers/{alerts,alertsPage,connection}.ts`, `routers/api/{alerts,dashboards,ai}.ts`, `setupDefaults.ts`, and nine `mcp/tools/**` files (these become `isValidId` from `metadata/ids.ts`: exactly 24 hex chars, which is slightly stricter than `isValidObjectId`, since that also accepts any 12-character string; no caller is known to rely on that quirk, and C0 checks the tests for it), and 43 upstream test files that use `randomMongoId()` or literal hex ids such as `68dd82484f54641b08667897`. Keeping the shape leaves all of them unchanged, and timestamp-prefixed ids keep `_id` sort == creation order, which the keyset cursors rely on. A 20-line generator is cheaper than adding a package and removes any Mongo-origin dependency. |
| D6 | **No dual Mongo/Couchbase implementation.** Repository interfaces with exactly two implementations: Couchbase (production) and in-memory (unit tests). Callers switch **entity by entity**: each slice replaces the Mongoose model with its repository, ports that entity's upstream tests, and deletes the model file in the same phase. Mongo stays running only for entities not yet switched. | There is no data to carry across, so a Mongo adapter would only re-implement Mongoose behind a second interface and then be deleted. AGENTS.md rule 5 applies to ClickHouse modules, not Mongo. Every phase still ends green, because unswitched entities keep using Mongoose unchanged and cross-entity references are plain id strings. |
| D7 | **Provisioning, not migrations.** An idempotent `ensureMetadataKeyspace` creates the bucket (self-managed), scope, collections, indexes, and the metadata RBAC user. It runs from the existing `couchbase-init` setup command, and at API startup when `CBT_METADATA_AUTO_PROVISION=true`. The three `migrations/mongo/*` scripts, `migrate-mongo`, and the startup `backfillAlertDisplayFields` are deleted, not ported. | No stored data to transform. Every alert written through current code already gets `displayName`/`tags` derived at write time (`controllers/alerts.ts` → `deriveAlertDisplayFields`). Defaults the migrations set (`kind`, `accessKey`) are applied at write time and by the Zod read schema. |
| D8 | **Minimal schema version marker only**: `meta::schema` `{ schemaVersion: 1, appVersion, provisionedAt }`, written by provisioning. The API refuses to start if the stored `schemaVersion` is newer than the code's `METADATA_SCHEMA_VERSION` (downgrade protection) and raises it after a successful `ensure`. No migration runner is built now. | A deployed instance will eventually meet a release whose document shape is not additive (upstream ships such data migrations regularly, and three exist in-tree today). The version marker is about 40 lines and gives that future migration an anchor and a downgrade guard. Additive changes need nothing: Zod read defaults handle them lazily. A runner is added only when the first non-additive change arrives, so we don't build it speculatively. |
| D9 | **Alert scheduler lease on by default** (`lock::check-alerts`, TTL 2× tick, renewed; `CBT_ALERT_SCHEDULER_LEASE=false` disables it). | New deployments on Kubernetes or Capella commonly run more than one task replica. Duplicate alert notifications are worse than skipping one tick while another runner holds the lease. The cost is one KV op per tick. The lease lives in the task runner wrapper (`tasks/index.ts`), so the upstream `checkAlerts` unit/int specs are unaffected. |
| D10 | **Last-write-wins for user edits** (no ETag/`If-Match`); CAS used internally for read-modify-write. | Upstream UI, CLI, and tests send no version, so 409s would diverge from the spec. CAS prevents lost updates between the scheduler and internal merges. |
| D11 | **`/ready` reports `metadata: <state>`** instead of `mongo`. `routers/api/__tests__/health.int.test.ts` is ported with the new key. | No existing consumers (D2); keeping a `mongo` key that describes Couchbase would mislead. |
| D12 | **Dedicated metadata DB user** `CBT_METADATA_USER` / `CBT_METADATA_PASSWORD` with `data_reader`, `data_writer`, `query_select`, `query_insert`, `query_update`, `query_delete` on `[cbt_meta]` only. Index, scope, and bucket management is done by the setup command with the admin credentials. | Least privilege. The telemetry users (`cbt_query`, ingest) get no access to the metadata bucket, and the metadata user gets none to `otel`. |
| D13 | **Update `AGENTS.md`'s repository-layout line** ("MongoDB for metadata" → "Couchbase metadata bucket") and `docs/development.md` "Where data lives" in the final phase. | Factual description of the stack, not a policy rule. |

## Key design decisions

1. **Repositories, not a Mongoose look-alike**: one typed repository per entity, with one method per distinct query shape. There is no free-form filter API.
2. **The id is the KV key**: `GET /dashboards/:id` is a KV `get`. The wire shape keeps `_id` and `id` as the same string (the Mongoose `toJSON` virtuals behavior).
3. **The metadata connection comes from env**: `CBT_METADATA_*`, never a stored Connection document. User-defined Connection documents describe telemetry clusters and are data. The metadata cluster connection is configuration.
4. **Uniqueness via lookup documents**: unique keys become `uniq::<kind>::<sha256(parts)>` documents written in the same transaction as the entity (or, when no transaction is needed, a KV `insert` first). `DocumentExistsError` maps to the existing duplicate-key paths (formerly Mongo code 11000).
5. **TTL becomes per-document expiry**: AlertHistory and TeamInvite expire 30 days after `createdAt` (collection `maxTTL` as a backstop). Sessions expire at the cookie expiry and are refreshed by `touch`.
6. **Read-your-writes**: SQL++ metadata queries use `request_plus`. Single-document reads use KV. Hot auth paths (session user, bearer access key, team API key, invite token, login email) use lookup document → KV only, with no query.

## 1. File and module structure

All new modules are server-only and live under `packages/api/src/metadata/`. Nothing here is reachable from `packages/app` (rule 3). ESLint `no-restricted-imports` already blocks `couchbase` in app. Extend it to block `@/metadata/**` from any browser entry. The only shared piece is a pure-data keyspace definition in `common-utils` (no `couchbase` import), so the API and the setup command agree on collections and indexes.

```
packages/common-utils/src/couchbase/
  metadataKeyspace.ts      # NEW, pure data: METADATA_COLLECTIONS, METADATA_INDEXES, METADATA_SCHEMA_VERSION,
                           # METADATA_ROLES; no SDK import (safe for any entry)
packages/api/src/metadata/
  index.ts                 # getMetadataStore() / setMetadataStoreForTests(); Couchbase in prod, memory in unit tests
  types.ts                 # MetadataStore, repository interfaces, Page<T>, ListOptions, WriteOptions
  ids.ts                   # newId(), isValidId(), LOCAL_APP_TEAM_ID; in-repo ObjectId-format generator (D5)
  errors.ts                # DuplicateKeyError, NotFoundError, CasConflictError, MetadataUnavailableError,
                           # IndexNotReadyError, SchemaVersionError, TransactionFailedError; fromCouchbaseError()
  schemas/                 # Zod doc + input schemas per entity, reusing common-utils types
    team.ts user.ts teamInvite.ts connection.ts source.ts savedSearch.ts dashboard.ts
    alert.ts alertHistory.ts webhook.ts favorite.ts pinnedFilter.ts presetDashboardFilter.ts session.ts
  serialize.ts             # toWire(doc, key): adds _id (+ id where Mongoose emitted it), ISO dates, strips secrets
  couchbase/
    config.ts              # loadMetadataConfig(): CBT_METADATA_* env
    cluster.ts             # connect with retry (via common-utils clusterCache), health, close
    keyspace.ts            # metaKeyspace(collection) via common-utils keyspace()/quoteIdent()
    kv.ts query.ts tx.ts unique.ts lock.ts
    schemaVersion.ts       # read/assert/raise meta::schema (D8)
    verify.ts              # verifyMetadataKeyspace(): collections + indexes online (no DDL rights needed)
    sessionStore.ts        # CouchbaseSessionStore extends express-session Store (D3)
    repos/                 # one file per entity (13) + tags.ts
  auth/
    password.ts            # scrypt hashPassword / verifyPassword / needsRehash (D4)
    localStrategy.ts       # passport-local Strategy over UserRepository; same error strings
  testing/
    memoryStore.ts         # in-memory MetadataStore (unit tests; replaces jest.mock('@/models/...'))
    contract.ts            # repository contract suite, run against memory and Couchbase
    seed.ts                # int-test seed helpers (replaces Model.create in tests)
packages/ingest/src/setup/
  metadata.ts              # NEW: ensureMetadataKeyspace() (bucket, scope, collections, indexes, RBAC user, schema doc)
  cli.ts                   # CHANGED: --metadata (default on) / --no-metadata; reuses ensureBucket/ensureUsers helpers
```

Why provisioning lives in `packages/ingest/src/setup`: the `couchbase-init` one-shot container in every compose file, CI, and the all-in-one entrypoint already runs that CLI with the admin credentials (`docker/couchbase/init.sh` → `node dist/setup/cli.js --create-bucket --create-users`). Putting the metadata DDL there means one init step and no admin credentials in the API. The API only verifies (`verify.ts`) unless `CBT_METADATA_AUTO_PROVISION=true`, in which case it calls the same ensure code. **Decided in C0:** `packages/api` does not depend on `@couchbase-traces/ingest` (and ingest is a private service package with no library entry point), so the definitions and the ensure/verify code live in `common-utils`: `couchbase/metadataKeyspace.ts` (pure definitions, browser-safe), `couchbase/nodeMetadataIndexes.ts` and `couchbase/nodeMetadataProvision.ts` (server-only, import `couchbase`). `packages/ingest/src/setup/metadata.ts` is a thin CLI adapter over them. See `docs/port-notes.md`, "Mongo elimination: C0".

Changed files (grouped by phase in section 7):

- `packages/api/src/config.ts`: adds `CBT_METADATA_*`. `MONGO_URI` is removed in C5.
- Per slice: every caller in section 0.1/0.2 moves from `Model.x()` to `getMetadataStore().<entity>.y()`. The Mongoose model file and its test helpers are deleted in the same phase.
- `utils/zod.ts#objectIdSchema` and every `mongoose.isValidObjectId` / `ObjectId.isValid` guard → `isValidId` (C0). `fixtures.ts#randomMongoId` → `newId` (C0).
- `utils/errors.ts#isDuplicateKeyError` recognizes `DuplicateKeyError` as well as code 11000 during the transition. The 11000 branch is removed in C5.
- `api-app.ts` (session store, C1), `utils/passport.ts` (C1), `middleware/auth.ts` (C1), `dataLayerSetup.ts` + `fixtures.ts` loader (C2), `utils/readiness.ts` + `routers/api/root.ts` (C0 adds `metadata`; C5 removes `mongo`), `server.ts` / `serverless.ts` (C0 connect; C5 remove Mongo connect).
- `docker/couchbase/init.sh`: `cbt_meta` is carved out of `CBT_COUCHBASE_RAM_MB` (the `otel` bucket gets `CBT_COUCHBASE_RAM_MB - CBT_METADATA_RAM_MB`), so the cluster quota and container memory limits stay the same (C0; changed from the original "quota grows" idea, see port-notes).
- Infrastructure in section 0.4 (C0 adds metadata provisioning; C5 removes Mongo).

Module relations:

```
routers / controllers / mcp / opamp / tasks / scripts
          │ (entity already switched)          │ (entity not yet switched; shrinks every phase)
          ▼                                    ▼
  metadata/index.ts ── MetadataStore     @/models/* (Mongoose)   ── deleted by C5
          ├─ couchbase/repos/* ──► couchbase/{kv,query,tx,unique} ──► common-utils couchbase/node
          └─ testing/memoryStore (unit tests)
  auth/localStrategy ──► store.users     CouchbaseSessionStore ──► couchbase/kv
  dataLayerSetup ──► store.connections.getWithSecrets()   (telemetry Connection docs; metadata cluster from env)
  ingest setup cli ──► setup/metadata.ts ──► common-utils nodeMetadataProvision ──► metadataKeyspace (definitions)
  api startup     ──► couchbase/verify.ts ──► common-utils nodeMetadataIndexes  ──► metadataKeyspace (same definitions)
```

### 1.1 Metadata bucket layout (D1)

| Setting | Default | Env | Notes |
|---|---|---|---|
| Bucket | `cbt_meta` | `CBT_METADATA_BUCKET` | Magma, 128 vBuckets (8.0 default), so the 100 MiB per-node minimum applies |
| RAM quota | 256 MiB | `CBT_METADATA_RAM_MB` | Metadata is small; ejection `fullEviction` |
| Replicas | 0 (dev, CI, all-in-one); docs recommend 1 for multi-node | `CBT_METADATA_REPLICAS` | Transactions need replicas ≤ nodes − 1 |
| Durability for transactions | `majority` | `CBT_METADATA_TX_DURABILITY` | `none` allowed for single-node dev only (logged warning) |
| Scope | `app` | `CBT_METADATA_SCOPE` | |
| Connection | `CBT_COUCHBASE_CONNSTR` | `CBT_METADATA_CONNSTR` | Same cluster by default; can point to a different cluster |
| Service user | `cbt_meta` | `CBT_METADATA_USER` / `CBT_METADATA_PASSWORD` | Roles in D12 |

All names go through `keyspace({bucket, scope, collection})` / `quoteIdent` in `packages/common-utils/src/couchbase/sqlpp.ts` (rejects backticks, NUL, newlines, and names longer than 251 characters; rule 4).

| Collection | Contents | maxTTL |
|---|---|---|
| `teams` | Team | 0 |
| `users` | User (incl. virtual/org-key users) | 0 |
| `team_invites` | TeamInvite | 2592000 (30d) |
| `connections` | Connection | 0 |
| `sources` | Source (all kinds) | 0 |
| `saved_searches` | SavedSearch | 0 |
| `dashboards` | Dashboard | 0 |
| `alerts` | Alert | 0 |
| `alert_history` | AlertHistory | 2592000 (30d) |
| `webhooks` | Webhook | 0 |
| `favorites` | Favorite | 0 |
| `pinned_filters` | PinnedFilter | 0 |
| `preset_dashboard_filters` | PresetDashboardFilter | 0 |
| `unique_keys` | uniqueness lookup docs | 0 |
| `sessions` | express-session docs | 0 (per-doc expiry) |
| `system` | `meta::schema` version marker, `lock::*` leases | 0 (leases use per-doc expiry) |
| `txn_meta` | transactions metadata collection (ATRs) | 0 |

The previous revision's `migrations` collection is gone (D7). The schema marker and leases share one small `system` collection.

## 2. Interfaces and function signatures

### 2.1 Core types (`metadata/types.ts`, `metadata/ids.ts`)

```ts
export type Id = string; // 24 lowercase hex (D5)
export type TeamId = Id;

export function newId(now?: Date): Id;        // 4B seconds | 5B per-process random | 3B counter (wraps), hex
export function isValidId(v: unknown): v is Id; // /^[0-9a-f]{24}$/i, normalized to lowercase by callers
export const LOCAL_APP_TEAM_ID: Id = '5f6c6f63616c5f7465616d5f'; // hex of '_local_team_', same value as today

export type WriteOptions = { cas?: Cas; tx?: TxContext };
export type Consistency = 'request_plus' | 'not_bounded';
export type ListOptions<S extends string> = {
  sort?: { field: S; dir: 'asc' | 'desc' }[];
  limit?: number;            // hard cap 1000 unless noted
  after?: string;            // opaque keyset cursor
  consistency?: Consistency; // default 'request_plus'
};
export type Page<T> = { items: T[]; next?: string };
export type Versioned<T> = { doc: T; cas: Cas };

export interface TeamScopedRepository<T, In, Patch, S extends string = 'id'> {
  create(teamId: TeamId, input: In, opts?: WriteOptions): Promise<T>;
  get(teamId: TeamId, id: Id): Promise<T | null>;         // KV; doc.team !== teamId → null
  getVersioned(teamId: TeamId, id: Id): Promise<Versioned<T> | null>;
  list(teamId: TeamId, opts?: ListOptions<S>): Promise<T[]>;
  page(teamId: TeamId, opts: ListOptions<S>): Promise<Page<T>>;
  count(teamId: TeamId): Promise<number>;
  update(teamId: TeamId, id: Id, patch: Patch, opts?: WriteOptions): Promise<T | null>; // CAS retry loop, last-write-wins (D10)
  delete(teamId: TeamId, id: Id, opts?: WriteOptions): Promise<boolean>;
}

export interface MetadataStore {
  teams: TeamRepository;            users: UserRepository;           teamInvites: TeamInviteRepository;
  connections: ConnectionRepository; sources: SourceRepository;
  savedSearches: SavedSearchRepository; dashboards: DashboardRepository;
  alerts: AlertRepository;          alertHistory: AlertHistoryRepository; webhooks: WebhookRepository;
  favorites: FavoriteRepository;    pinnedFilters: PinnedFilterRepository;
  presetDashboardFilters: PresetDashboardFilterRepository;
  locks: LockService;
  tags: { distinct(teamId: TeamId, type?: TagResourceType): Promise<string[]> };
  withTransaction<R>(fn: (tx: TxContext) => Promise<R>): Promise<R>;
  connect(opts?: { retry?: ConnectRetryOptions }): Promise<void>;
  readiness(): MetadataReadiness; // { ready: boolean; state: 'connecting'|'provisioning'|'indexing'|'ready'|'degraded'|'closed' }
  close(): Promise<void>;
}

export function getMetadataStore(): MetadataStore;
export function setMetadataStoreForTests(store: MetadataStore): void;
export function createMemoryStore(seed?: Partial<MemorySeed>): MetadataStore; // testing/memoryStore.ts
```

During C1–C4, `MetadataStore` only exposes the entities switched so far. It grows by one slice per phase, so an unswitched entity cannot be half-used.

### 2.2 Entity-specific methods (beyond the generic interface)

Each method replaces call sites named in section 0.2. The rule is one method per distinct query shape, and no method accepts a free-form filter. Exact lists are finalized per slice by reading each caller (rule 2).

```ts
interface TeamRepository {
  exists(): Promise<boolean>;                         // isTeamExisting
  createFirst(input: TeamInput): Promise<Team>;       // claims uniq::team.singleton in a tx
  getOnly(): Promise<Team | null>;                    // getTeam() == findOne({})
  getById(id: Id): Promise<Team | null>;
  getByApiKey(apiKey: string): Promise<Team | null>;  // lookup doc → KV
  listAll(fields?: (keyof Team)[]): Promise<Team[]>;
  rotateApiKey(id: Id): Promise<Team>;
  setName(id: Id, name: string): Promise<Team>;
  updateQuerySettings(id: Id, s: TeamQuerySettingsUpdate): Promise<Team>; // null → field removed
}

interface UserRepository {
  register(input: { email: string; name?: string; team?: Id }, password: string): Promise<User>; // DuplicateKeyError(user.email) → existing 'UserExistsError' path
  getById(id: Id): Promise<User | null>;
  getByEmailWithSecret(email: string): Promise<UserWithSecret | null>; // lowercased; lookup doc → KV; auth only
  getByAccessKey(key: string, now?: Date): Promise<User | null>;       // incl. hdx_org_ sha256 path
  listByTeam(teamId: Id): Promise<User[]>;                            // non-virtual, createdAt asc
  createVirtual(input: VirtualUserInput): Promise<User>;
  rotateAccessKey(id: Id): Promise<User>;
  setPassword(id: Id, password: string): Promise<void>;               // scrypt (D4)
  replacePasswordHash(id: Id, encoded: string, cas: Cas): Promise<void>; // rehash-on-login when params change
  addOnboardingTask(id: Id, task: OnboardingTaskId): Promise<User | null>; // subdoc arrayAddUnique
  setOnboardingDismissed(id: Id, v: boolean): Promise<User | null>;
  touchLastUsed(id: Id, at: Date): Promise<void>;                     // fire-and-forget
  revokeOrgKey(teamId: Id, id: Id, at: Date): Promise<User | null>;
  listOrgKeys(teamId: Id): Promise<User[]>;
  deleteTeamMember(teamId: Id, targetId: Id, requesterId: Id): Promise<'deleted'|'not_found'|'last_member'>;
  getDisplay(ids: Id[]): Promise<Map<Id, { _id: Id; email: string; name: string }>>; // populate() replacement
}

interface TeamInviteRepository {
  create(teamId: Id, input: { email: string; name?: string }): Promise<TeamInvite>; // DuplicateKeyError(invite.member)
  getByToken(token: string): Promise<TeamInvite | null>;                           // lookup doc → KV
  list(teamId: Id): Promise<TeamInvite[]>;
  delete(teamId: Id, id: Id): Promise<boolean>;
  consume(token: string, tx?: TxContext): Promise<TeamInvite | null>;              // findByIdAndRemove parity
}

interface ConnectionRepository extends TeamScopedRepository<Connection, ConnectionInput, ConnectionPatch> {
  getWithSecrets(id: Id, teamId?: Id): Promise<ConnectionWithSecrets | null>; // replaces select('+password +tlsCaCertificate +monitorPassword')
}
interface SourceRepository extends TeamScopedRepository<Source, SourceInput, SourcePatch> {
  listByConnection(teamId: Id, connectionId: Id): Promise<Source[]>;
}
interface SavedSearchRepository extends TeamScopedRepository<SavedSearch, SavedSearchInput, SavedSearchPatch> {
  listWithUsers(teamId: Id): Promise<SavedSearchWithUsers[]>; // createdBy/updatedBy via users.getDisplay
}
interface DashboardRepository extends TeamScopedRepository<Dashboard, DashboardInput, DashboardPatch> {
  search(teamId: Id, q: { nameContains?: string; tagsAll?: string[]; limit: number }): Promise<Dashboard[]>;
  upsertProvisioned(teamId: Id, name: string, insert: DashboardInput, update?: DashboardPatch): Promise<{ created: boolean; doc: Dashboard }>;
  deleteProvisionedNotIn(teamId: Id, names: string[]): Promise<number>;
}
interface AlertRepository extends TeamScopedRepository<Alert, AlertInput, AlertPatch, 'displayName'|'id'> {
  listAll(): Promise<Alert[]>;                                  // scheduler
  pageForAlertsPage(teamId: Id, f: AlertsPageFilter, cursor: AlertsPageCursor | undefined, limit: number): Promise<Page<Alert>>;
  countForAlertsPage(teamId: Id, f: AlertsFilterParams): Promise<number>;
  findBySavedSearch(teamId: Id, savedSearchId: Id): Promise<Alert[]>;
  findByDashboard(teamId: Id, dashboardId: Id, tileIds?: string[]): Promise<Alert[]>;
  deleteBySavedSearch(teamId: Id, savedSearchId: Id, tx?: TxContext): Promise<number>;
  deleteByDashboardTiles(teamId: Id, dashboardId: Id, tileIdsToKeep?: string[], tx?: TxContext): Promise<number>;
  setState(id: Id, state: AlertState, errors: IAlertError[]): Promise<void>;   // subdoc, disjoint paths
  setExecutionErrors(id: Id, errors: IAlertError[]): Promise<void>;
  reassignCreatedBy(teamId: Id, from: Id, to: Id, tx?: TxContext): Promise<number>;
}
interface AlertHistoryRepository {
  createMany(rows: AlertHistoryInput[]): Promise<PromiseSettledResult<void>[]>;
  upsertErrorRow(alertId: Id, windowStart: Date, errors: IAlertError[], analytics?: IAlertHistoryAnalytics): Promise<void>; // deterministic key, preserveExpiry
  deleteErrorRows(alertId: Id, range: { gt?: Date; lte: Date } | Date): Promise<number>;
  latestPerGroup(alertId: Id, now: Date, lookback: Date): Promise<AggregatedAlertHistory[]>;   // getPreviousAlertHistories
  rangeExcludingErrors(alertId: Id, gte: Date, lt: Date): Promise<AggregatedAlertHistory[]>;    // getConsecutiveWindowHistories
  groupedByWindow(alertId: Id, createdAt: DateRange, limit: number): Promise<GroupedAlertHistory[]>;
  structuredWindows(alertId: Id, createdAt: DateRange, limit: number): Promise<StructuredWindow[]>;
  transitionWindows(alertId: Id, gte: Date, lte: Date): Promise<TransitionWindow[]>;
  deleteByAlert(alertId: Id, tx?: TxContext): Promise<number>;
}
interface WebhookRepository extends TeamScopedRepository<Webhook, WebhookInput, WebhookPatch> {
  listByService(teamId: Id, service?: WebhookService): Promise<Webhook[]>;
  getMany(teamId: Id, ids: Id[]): Promise<Map<Id, Webhook>>;    // scheduler getWebhooks (KV multi-get)
}
interface FavoriteRepository {
  list(teamId: Id, userId: Id): Promise<Favorite[]>;
  add(teamId: Id, userId: Id, type: FavoriteType, resourceId: string): Promise<Favorite>; // idempotent on duplicate
  remove(teamId: Id, userId: Id, type: FavoriteType, resourceId: string): Promise<boolean>;
  removeForResource(teamId: Id, type: FavoriteType, resourceId: string): Promise<number>;
}
interface PinnedFilterRepository {
  get(teamId: Id, sourceId: Id): Promise<PinnedFilter | null>;
  put(teamId: Id, sourceId: Id, v: PinnedFilterInput): Promise<PinnedFilter>;  // deterministic key pin::<team>::<source>
}
interface PresetDashboardFilterRepository extends TeamScopedRepository<PresetDashboardFilter, PresetDashboardFilterInput, PresetDashboardFilterPatch> {
  listForSource(teamId: Id, sourceId: Id, preset: PresetDashboard): Promise<PresetDashboardFilter[]>;
}
```

### 2.3 Couchbase primitives (`metadata/couchbase/*`)

```ts
// config.ts
export type MetadataClusterConfig = {
  connstr: string; username: string; password: string; bucket: string; scope: string;
  wanProfile?: boolean; caCertPath?: string;
  kvTimeoutMs: number; queryTimeoutMs: number; txTimeoutMs: number; txDurability: 'majority' | 'none';
  autoProvision: boolean; indexWaitMs: number;
};
export function loadMetadataConfig(env?: NodeJS.ProcessEnv): MetadataClusterConfig; // throws MetadataConfigError (non-retryable)

// cluster.ts
export function connectMetadataCluster(cfg: MetadataClusterConfig, retry?: ConnectRetryOptions): Promise<Cluster>;
export function metaCollection(name: MetaCollection): Collection;
export function closeMetadataCluster(): Promise<void>;

// keyspace.ts
export type MetaCollection = (typeof METADATA_COLLECTIONS)[number]['name'];
export function metaKeyspace(c: MetaCollection): string; // keyspace({bucket, scope, collection: c})

// kv.ts
export function getDoc<T>(c: MetaCollection, key: string, schema: z.ZodType<T>): Promise<Versioned<T> | null>;
export function getMany<T>(c: MetaCollection, keys: string[], schema: z.ZodType<T>): Promise<Map<string, T>>;
export function insertDoc<T>(c: MetaCollection, key: string, doc: T, o?: { expiry?: Date; tx?: TxContext }): Promise<Cas>; // DocumentExists → DuplicateKeyError
export function replaceDoc<T>(c: MetaCollection, key: string, doc: T, o: { cas: Cas; preserveExpiry?: boolean; tx?: TxContext }): Promise<Cas>; // CasMismatch → CasConflictError
export function mutateDoc<T>(c: MetaCollection, key: string, schema: z.ZodType<T>, fn: (cur: T) => T | null, o?: { maxRetries?: number /* 3 */ }): Promise<T | null>;
export function removeDoc(c: MetaCollection, key: string, o?: { cas?: Cas; tx?: TxContext }): Promise<boolean>;
export function subdoc(c: MetaCollection, key: string, specs: MutateInSpec[], o?: { cas?: Cas; preserveExpiry?: boolean }): Promise<Cas>;

// query.ts — q is built with the common-utils `sqlpp` tag; values only as named params, identifiers only via metaKeyspace/quoteIdent (rule 4)
export function runQuery<T>(q: SqlPP, schema: z.ZodType<T>, o?: { consistency?: Consistency; tx?: TxContext; timeoutMs?: number }): Promise<T[]>;

// tx.ts — cluster.transactions().run with metadataCollection = txn_meta; maps TransactionFailed / CommitAmbiguous
export function withTransaction<R>(fn: (tx: TxContext) => Promise<R>, o?: { timeoutMs?: number }): Promise<R>;

// unique.ts — key 'uniq::' + kind + '::' + sha256(JSON.stringify(parts))
export type UniqueKind = 'team.singleton'|'team.apiKey'|'team.hookId'|'user.email'|'user.accessKey'|'invite.member'|'invite.token'|'dashboard.provisioned'|'webhook.name'|'favorite';
export function claimUnique(kind: UniqueKind, parts: string[], ownerId: Id, o?: { tx?: TxContext; expiry?: Date }): Promise<void>; // DuplicateKeyError(kind)
export function releaseUnique(kind: UniqueKind, parts: string[], ownerId: Id, tx?: TxContext): Promise<void>; // only if owner matches
export function resolveUnique(kind: UniqueKind, parts: string[]): Promise<Id | null>;

// lock.ts — lease docs in `system`, key lock::<name>
export interface LockService {
  acquire(name: string, ttlMs: number, owner: string): Promise<Lease | null>; // KV insert with expiry; null if held
  renew(lease: Lease, ttlMs: number): Promise<boolean>;                         // CAS replace with new expiry
  release(lease: Lease): Promise<void>;                                          // CAS remove; ignore not-found
}
```

### 2.4 Session store (`metadata/couchbase/sessionStore.ts`)

```ts
export class CouchbaseSessionStore extends session.Store {
  constructor(o: { collection?: 'sessions'; defaultTtlSeconds?: number /* 30d, = cookie maxAge */ });
  get(sid: string, cb: (err: unknown, s?: SessionData | null) => void): void;  // KV get; not found → cb(null, null)
  set(sid: string, s: SessionData, cb?: (err?: unknown) => void): void;        // KV upsert, expiry = s.cookie.expires ?? now + ttl
  touch(sid: string, s: SessionData, cb?: (err?: unknown) => void): void;      // collection.touch(key, expiry) for rolling: true
  destroy(sid: string, cb?: (err?: unknown) => void): void;                    // KV remove; DocumentNotFound ignored
  clear(cb?: (err?: unknown) => void): void;                                   // tests only: DELETE FROM sessions
}
```

Keys are `sess::<sid>` (express-session sids are 32 url-safe chars, well under the 250-byte key limit), and the body is `{ session: SessionData, expiresAt }`. `passport.serializeUser` stores the user id string. `length`/`all` are not implemented, because express-session does not call them and no caller uses them. Logout `destroy` and `req.session.regenerate` on login keep today's fixation protection.

### 2.5 Password auth (`metadata/auth/*`)

```ts
export const SCRYPT_PARAMS = { N: 32768, r: 8, p: 3, keylen: 64, saltlen: 16, maxmem: 64 * 1024 * 1024 } as const;
export function hashPassword(password: string): Promise<string>;  // 'scrypt$1$N=32768,r=8,p=3$<salt>$<hash>' (base64url)
export function verifyPassword(password: string, encoded: string): Promise<boolean>; // parse; unknown scheme → false; timingSafeEqual
export function needsRehash(encoded: string): boolean;             // params below SCRYPT_PARAMS
export const AUTH_ERRORS = {
  incorrect: 'Password or username is incorrect',
  missingPassword: 'No password was given',
  missingUsername: 'No username was given',
  userExists: 'A user with the given username is already registered',
} as const;
export class UserExistsError extends Error { name = 'UserExistsError' } // same name the register routes branch on
export function createLocalStrategy(users: UserRepository): passport.Strategy; // usernameField 'email', lowercases
```

These are the strings and the error name that `middleware/auth.ts`, `routers/api/root.ts`, the register/login int tests, and the app's login form match on today (verified in C1 against the tests, rule 2). The legacy `noSalt` message goes away: every user created through the app has a hash, virtual users are rejected before verification (as in `utils/passport.ts` today), and an absent hash returns `incorrect`. There is no lockout, matching `limitAttempts` unset today. The password is length-checked (1–1024 bytes) before hashing to bound CPU. The minimum-strength checks already in the register Zod schema stay. The stored `hash` field replaces the plugin's `hash` + `salt` pair, is `select:false`-equivalent (stripped by `toWire`), and `hasPasswordAuth` = `hash` is present.

### 2.6 Provisioning and schema version (`packages/ingest/src/setup/metadata.ts`, `metadata/couchbase/{verify,schemaVersion}.ts`)

```ts
// common-utils/src/couchbase/metadataKeyspace.ts (pure data)
export const METADATA_SCHEMA_VERSION = 1;
export const METADATA_COLLECTIONS: readonly { name: string; maxTTL: number }[];
export const METADATA_INDEXES: readonly { name: string; collection: string; keys: string[]; where?: string }[];
export const METADATA_ROLES: (bucket: string) => { role: string; bucket_name: string }[]; // D12

// ingest setup (admin credentials)
export function ensureMetadataKeyspace(cluster: Cluster, o: {
  bucket: string; scope: string; ramMb: number; replicas: number;
  createBucket: boolean;      // false on Capella: bucket must exist (prints required settings)
  createUser: boolean;        // false on Capella: prints METADATA_ROLES for the Capella UI/API
  indexReplicas: number;      // CBT_METADATA_INDEX_REPLICAS, default 0
  log: SetupLogger;
}): Promise<{ created: string[]; existing: string[] }>; // idempotent; writes/raises meta::schema last

// api
export function verifyMetadataKeyspace(cluster: Cluster, cfg: MetadataClusterConfig): Promise<VerifyResult>; // collections exist, indexes online
export function assertSchemaVersion(stored: number | null, code = METADATA_SCHEMA_VERSION): void;            // throws SchemaVersionError if stored > code
```

Order inside `ensureMetadataKeyspace`: bucket (`createBucket`; wait for the bucket to be ready) → scope → collections with `maxTTL` → `CREATE INDEX IF NOT EXISTS … WITH {"defer_build": true, "num_replica": $n}` → one `BUILD INDEX` per collection for deferred indexes → wait for online → RBAC user (self-managed) → upsert `meta::schema` with `schemaVersion = max(stored, METADATA_SCHEMA_VERSION)`. Every step tolerates "already exists". There is no `DROP`, and indexes that are no longer listed are reported, not removed. Exit codes reuse `packages/ingest/src/setup/errors.ts` (`SetupError`).

API startup: connect → `assertSchemaVersion` → `verifyMetadataKeyspace`. If verification fails and `CBT_METADATA_AUTO_PROVISION=true` (default in dev, CI, all-in-one, and the API int-test harness), the API runs `ensureMetadataKeyspace` with `createBucket: false, createUser: false` using its own credentials. That requires the extra roles `scope_admin` + `query_manage_index`, which are granted only in those environments. Otherwise `/ready` stays 503 with the missing items listed.

Schema change policy (D8): additive fields get Zod read defaults and no version bump. A non-additive change bumps `METADATA_SCHEMA_VERSION` and ships the first migration step with its own idempotent test. That PR also adds the runner, which is not built now.

## 3. Data models

### 3.1 Conventions for every metadata document

- **Key**: the 24-hex id from `newId()`. The body does not repeat `_id`. Repositories read the id from the key (`META().id` in SQL++) and `serialize.ts#toWire` adds `_id`, plus `id` where Mongoose emitted the virtual (not for Webhook, TeamInvite, or User; see 0.3). Deterministic-key exceptions: `uniq::…`, `sess::…`, `lock::…`, `meta::schema`, alert-history ERROR rows `err::<alertId>::<windowStartMs>`, and pinned filters `pin::<team>::<source>`.
- **References** (`team`, `source`, `connection`, `createdBy`, …) are stored as 24-hex strings. During C1–C4, Mongo-resident entities keep their `ObjectId` ref fields, and Mongoose casts the hex strings both ways, so references work across the two stores.
- **Dates** are ISO-8601 UTC strings with millisecond precision (`toISOString()`, always 24 characters), so lexicographic order equals chronological order. Repositories return `Date` objects, and JSON output is unchanged.
- **Timestamps**: `createdAt`/`updatedAt` are set by repositories. Whether the scheduler's `setState` bumps `updatedAt` follows what Mongo `updateOne` + `$set` does with `timestamps: true`. That is pinned by a test written in C4 *before* the Mongo alert model is deleted, so the spec is captured from the real behavior.
- **Optional fields**: absent means *missing*, not `null`. Mongoose defaults (`state: OK`, `source: saved_search`, `disabled: false`, `provisioned: false`, `isVirtual: false`, `tags: []` on dashboards, `onboardingData`) are applied on write by the input schema, and again on read by the doc schema, so a doc written by an older release still reads correctly. `Connection.kind` is required on write. The `clickhouse` read default goes away with the legacy-data migrations (D7), and connection creation already sets `kind`. Filters that treat "missing equals default" (`inOrMissing` in `controllers/alertsPage.ts`) use `IFMISSINGORNULL(field, <default>)` in SQL++ and in the index key.
- **`__v`** is neither stored nor emitted. A C0 contract snapshot confirms that no client reads it (two server paths strip it already).
- **Validation**: per collection, a Zod `XxxDocSchema` (persisted, lenient read: `.passthrough()` on Mixed fields such as `tiles`, `chartConfig`, `channel`, and `filters`) and `XxxInputSchema` / `XxxPatchSchema` (strict write). Both reuse `common-utils` schemas (`DashboardSchema`, `SavedSearchSchema`, `LogSourceSchema`…`PromqlSourceSchema`, `WebhookService`, `AlertThresholdType`, `AlertErrorType`, `ONBOARDING_TASK_IDS`, `MetricsDataType`, `PresetDashboard`, `zAlertChannel(s)`). Mongoose validators are ported one-to-one: `scheduleOffsetMinutes` in `[0,1439]` and less than the interval in minutes, `numConsecutiveWindows ≥ 1`, `querySettings` length ≤ 10 with `setting`/`value` minlength 1, `queryMaxParallelism` 1–64, enums, `minAutoGranularity '' → undefined`, and "empty string satisfies required" (`models/index.ts` `checkRequired`). Error messages that tests assert are kept verbatim.
- **Immutability**: `team` on every entity, and `createdBy` on Dashboard and SavedSearch, are omitted from `Patch` types (Mongoose `immutable: true` parity).
- **Secrets**: `Connection.password`, `tlsCaCertificate`, `monitorPassword`, and `User.hash` live in the same document. They are stripped by `toWire` and by every list projection. Only `getWithSecrets` and `getByEmailWithSecret` return them. They are never logged (`scrubMessage`).
- **Multi-tenancy**: every team-scoped SQL++ filters `team = $team`, and every KV `get(teamId, id)` checks `doc.team === teamId`. A cross-team id behaves exactly like a missing document (404). Every index leads with `team` (or `alert` for history, which is team-checked via the parent alert).
- **Local app mode**: `LOCAL_APP_TEAM_ID` keeps the same hex so `alert.team` comparisons in `providers/default.ts` need no cast. Synthetic user `_local_user_` stays non-persistable (`isPersistableUserId` unchanged).

### 3.2 Per-entity documents

Fields not listed are carried over verbatim from section 0.1.

| Collection / key | Document shape (persisted) | Uniqueness (lookup kind → parts) | GSI indexes (`ix_<coll>_<purpose>`) |
|---|---|---|---|
| `teams` / id | `{ name, allowedAuthMethods?, hookId, apiKey, collectorAuthenticationEnforced, isMetricsSeriesTableEnabled, metadataMaxRowsToRead?, searchRowLimit?, queryTimeout?, fieldMetadataDisabled?, parallelizeWhenPossible?, filterKeysFetchLimit?, queryScanConsistency?, queryMaxParallelism?, createdAt, updatedAt }` | `team.singleton → []`; `team.apiKey → [apiKey]`; `team.hookId → [hookId]` | `ix_teams_created (createdAt)` |
| `users` / id | `{ email (lowercase), name?, team?, accessKey, isVirtual, expiresAt?, lastUsedAt?, revokedAt?, createdBy?, onboardingData, hash?, createdAt, updatedAt }` | `user.email → [email]`; `user.accessKey → [accessKey]` | `ix_users_team (team, isVirtual, createdAt)`; `ix_users_orgkeys (team, createdBy) WHERE isVirtual = true` |
| `team_invites` / id | `{ teamId, name?, email, token, createdAt, updatedAt }`; expiry = createdAt + 30d | `invite.member → [teamId, email]`; `invite.token → [token]` (both with the invite's expiry) | `ix_invites_team (teamId, createdAt)` |
| `connections` / id | as §0.1, incl. secrets; `kind` required | none | `ix_connections_team (team)` |
| `sources` / id | discriminated union on `kind`; `{ team, connection, name, …kind-specific }`; `metricTables` / `metadataMaterializedViews` without `_id` | none | `ix_sources_team (team, kind)`; `ix_sources_connection (team, connection)` |
| `saved_searches` / id | `{ team, name?, select?, where?, whereLanguage?, orderBy?, source, tags?, filters?, createdBy?, updatedBy?, createdAt, updatedAt }` | none | `ix_saved_searches_team (team)`; `ix_saved_searches_tags (team, DISTINCT ARRAY t FOR t IN tags END)` |
| `dashboards` / id | `{ name, tiles, team, tags, filters, savedQuery?, savedQueryLanguage?, savedFilterValues?, savedDateRange?, containers?, createdBy?, updatedBy?, provisioned, createdAt, updatedAt }` | `dashboard.provisioned → [team, name]`, claimed only when `provisioned: true` | `ix_dashboards_team (team)`; `ix_dashboards_tags (team, DISTINCT ARRAY t FOR t IN tags END)`; `ix_dashboards_provisioned (team, name) WHERE provisioned = true` |
| `alerts` / id | as §0.1; `channels` and `tags` missing unless set | none | `ix_alerts_team (team)`; `ix_alerts_page (team, IFMISSINGORNULL(displayName, NULL), META().id)`; `ix_alerts_tags (team, DISTINCT ARRAY t FOR t IN tags END)`; `ix_alerts_saved_search (team, savedSearch)`; `ix_alerts_dashboard (team, dashboard, tileId)`; `ix_alerts_created_by (team, createdBy)` |
| `alert_history` / id, or `err::<alertId>::<ms>` | `{ alert, counts, createdAt, state, lastValues[], group?, fired?, groupValues?, errors?, analytics? }`; expiry = createdAt + 30d | ERROR-row identity = deterministic key | `ix_alert_history_alert (alert, createdAt DESC, state)`; ``ix_alert_history_group (alert, IFMISSINGORNULL(`group`, ""), createdAt DESC, state)`` |
| `webhooks` / id | `{ team, service, name, url?, description?, titleEmoji?, queryParams?: Record<string,string>, headers?: Record<string,string>, body?, createdAt, updatedAt }` | `webhook.name → [team, service, name]` | `ix_webhooks_team (team, service)` |
| `favorites` / id | `{ user, team, resourceType, resourceId, createdAt, updatedAt }` | `favorite → [team, user, resourceType, resourceId]` | `ix_favorites_user (team, user)`; `ix_favorites_resource (team, resourceType, resourceId)` |
| `pinned_filters` / `pin::<team>::<source>` | `{ team, source, fields, filters, createdAt, updatedAt }` | key is the constraint | `ix_pinned_filters_team (team)` |
| `preset_dashboard_filters` / id | as §0.1 | none | `ix_preset_filters (team, presetDashboard, source)` |
| `unique_keys` / `uniq::<kind>::<sha256>` | `{ kind, owner: Id, parts: string[], createdAt }` | (is the constraint) | none (KV only) |
| `sessions` / `sess::<sid>` | `{ session: SessionData, expiresAt }`; doc expiry | n/a | none |
| `system` / `lock::<name>`, `meta::schema` | lease `{ owner, acquiredAt, expiresAt }` (doc expiry); schema `{ schemaVersion, appVersion, provisionedAt, updatedAt }` | n/a | none |

There are no `META().id` scan indexes and no primary indexes in production: no import or backfill needs them now. Test setups (`port/couchbase-test`) may create primary indexes for `DELETE FROM` resets. Hashing `parts` keeps lookup keys under the 250-byte limit and keeps user text out of keys. The parts stay in the body for diagnostics.

### 3.3 Mongo operation to Couchbase mapping

| Mongo construct | Couchbase replacement |
|---|---|
| `findById`, `findOne({_id, team})` | KV `get` + team check |
| `findOne({email})`, `({accessKey})`, `({apiKey})`, `({token})` | KV `get` on the `uniq::` doc, then KV `get` on the entity (no query on hot auth paths) |
| `find({team, …}).sort({_id:1})` | `SELECT … FROM ks AS d WHERE d.team = $team … ORDER BY META(d).id`, `request_plus` |
| `$set` / `$unset` | sub-doc `mutateIn` `upsert`/`remove` on scheduler hot paths; `mutateDoc` CAS loop elsewhere |
| `$addToSet` | `MutateInSpec.arrayAddUnique(path, v, {createPath:true})`; `PathExistsError` → no-op |
| `$in`, `$ne`, `$exists`, `$or`, ranges | `IN $arr`, `!=`, `IS NOT MISSING` / `IS VALUED`, `OR`, `>=` / `<` |
| `$regex` (escaped, `i`) | `CONTAINS(LOWER(d.displayName), LOWER($q))` (same literal-substring semantics) |
| `tags: {$all: arr}` | `EVERY t IN $tags SATISFIES t IN d.tags END` |
| `$unwind` + `$group` distinct tags | `SELECT DISTINCT RAW t FROM ks d UNNEST d.tags t WHERE d.team = $team` per collection, unioned in TS |
| alert-history `$group` by `createdAt` with `$push`/`$sum` | `SELECT h.createdAt, ARRAY_AGG(h.state), SUM(h.counts) … GROUP BY h.createdAt ORDER BY h.createdAt DESC LIMIT $limit` |
| latest per (alert, group) `$sort` + `$group $first` | ``ROW_NUMBER() OVER (PARTITION BY IFMISSINGORNULL(h.`group`,"") ORDER BY h.createdAt DESC)`` subquery, `rn = 1` (EE window function) |
| `populate('createdBy','email name')` | `users.getDisplay(ids)` KV multi-get; same `{_id, email, name}` shape |
| `updateMany` / `deleteMany` | SQL++ `UPDATE` / `DELETE … WHERE team = $team AND …` (`request_plus`), inside `tx` when part of a multi-step change |
| `findOneAndUpdate(…, {upsert, $setOnInsert})` (provisioner) | claim `dashboard.provisioned` in a tx: success → insert, duplicate → update the owner |
| TTL index | collection `maxTTL` + explicit absolute expiry; every mutation of a TTL doc passes `preserveExpiry: true` |
| member delete + `insertOne` restore | one transaction (count + delete + reassign alerts) once alerts are switched (C4); until then the existing sequence |
| `new ObjectId()` / `isValidObjectId` | `newId()` / `isValidId()` |

## 4. Error handling

| Failure | Detection | Surfaced as | Recovery |
|---|---|---|---|
| Metadata config missing or malformed | `loadMetadataConfig` + common-utils `parseConnStr` (`ConnStrError`) | `MetadataConfigError`; process exits non-zero (same fast-fail as `MongoParseError` in `connectDBWithRetry` today) | fix env |
| Cluster unreachable or auth failure at startup | SDK `connect` → `UnambiguousTimeoutError` / `AuthenticationFailureError` / `RequestCanceledError` | logged with attempt + backoff; `/health` 200, `/ready` 503 `{ metadata: 'connecting' }`; counter `cbt.metadata.connection_events{event}` | capped exponential backoff (1s→30s, forever), ported from `connectDBWithRetry` with its test |
| Metadata bucket, scope, or collection missing | `BucketNotFoundError` / `ScopeNotFoundError` / `CollectionNotFoundError`, or `verifyMetadataKeyspace` reports missing items | `/ready` 503 `{ metadata: 'provisioning', missing: [...] }`; one log line per missing item | auto-provision when enabled; otherwise run the setup command. The verify loop retries every 5s, so an init container that is still running is handled |
| Stored schema newer than code (downgrade) | `assertSchemaVersion` | `SchemaVersionError`; process exits non-zero with both versions in the message | deploy the newer release |
| Indexes building or missing | `system:indexes` state ≠ `online`; query errors 12003/12004/4000-range | `IndexNotReadyError` → 503 + `Retry-After: 5`; `/ready` 503 `{ metadata: 'indexing' }` | startup waits `CBT_METADATA_INDEX_WAIT_MS` (120s), then serves KV-only routes and stays degraded until online |
| Runtime transient (timeouts, temporary failure, failover) | `TimeoutError`, `TemporaryFailureError`, `ServiceNotAvailableError` | `MetadataUnavailableError` → 503 for routes; scheduler logs and retries next tick | SDK retry strategy; no app-level retry of non-idempotent writes |
| Duplicate key | `DocumentExistsError` on lookup-doc insert | `DuplicateKeyError { kind }`; `isDuplicateKeyError` true, so the existing 409 / `UserExistsError` / webhook-name / invite messages are unchanged | none needed |
| CAS conflict | `CasMismatchError` | internal re-read + reapply (≤3), then `CasConflictError` → 409 `{ error: 'conflict' }` (internal paths only; D10) | caller retries |
| Document vanished during update | `DocumentNotFoundError` | `null` → existing 404 paths | none |
| Transaction failure | `TransactionFailedError` (rolled back) | 500 with logged cause; uniqueness causes re-mapped to `DuplicateKeyError` | SDK retries within `txTimeoutMs` |
| Transaction commit ambiguous | `TransactionCommitAmbiguousError` | logged with tx id; repo re-reads affected keys to decide | undecidable → 503; client retry is safe because every multi-doc write is idempotent by key |
| Durability impossible (replicas > nodes − 1) | `DurabilityImpossibleError` on the startup no-op tx probe | `/ready` 503 with a message naming `CBT_METADATA_REPLICAS` / `CBT_METADATA_TX_DURABILITY` | fix the bucket replicas, or set durability `none` for single-node dev only |
| Orphaned lookup doc (entity write failed after a non-tx claim) | `claimUnique` finds an owner whose entity is missing | treated as free; overwritten via CAS | self-healing |
| Schema-invalid stored doc | Zod read failure | logged with key + issues; skipped in lists, 500 for a single get | fix the code that wrote it; no stored data predates the schema (D2) |
| Session store errors | KV errors in `get` / `set` | `cb(err)` → express-session → 500 (connect-mongo parity); `touch` errors are swallowed and counted | none |
| Password hash unparseable or unknown scheme | `verifyPassword` parse failure | `false` → `AUTH_ERRORS.incorrect` (no oracle), logged once per user id | admin resets the password |
| Setup command fails partway | `SetupError` with step name; non-zero exit | init container fails, so compose `depends_on: service_completed_successfully` blocks the API | re-run: every step is idempotent |

Every SDK error is converted once in `metadata/errors.ts#fromCouchbaseError`, which reuses `common-utils/src/couchbase/errors.ts#scrubMessage` so credentials never reach logs. HTTP mapping lives in `middleware/error.ts#appErrorHandler`, extended for the new classes.

## 5. Edge cases

- **Empty or invalid input**: `isValidId` rejects non-24-hex before KV access, so callers get 400 or 404 where `isValidObjectId` / `CastError` did. The 12-character-string quirk now returns 400 (behavior change recorded in port-notes). Empty strings stay valid for "required" strings. An empty `tags` array stays distinct from missing (alerts `tags: default undefined`). Couchbase's 20 MB doc limit is above Mongo's 16 MB, and the `express.json` 32 MB limit remains the effective cap.
- **Email case and regex**: emails are lowercased on write and lookup. The plugin's unescaped `RegExp('^'+email+'$','i')` lookup becomes an exact lowercase key, which fixes regex metacharacters in emails.
- **Password edge cases**: empty password → `AUTH_ERRORS.missingPassword` (Passport rejects before verify). Over-long passwords are rejected before hashing. Unicode is normalized with NFC before hashing, so the same visible password hashes the same on every platform. The comparison is constant-time. A burst of logins is bounded by the libuv threadpool (default 4), which serializes scrypt and caps memory at 4 × 32 MiB. `UV_THREADPOOL_SIZE` is documented, not changed.
- **Null vs missing ordering**: SQL++ ASC puts MISSING before NULL, while Mongo groups them. The alerts-page index and `ORDER BY` use `IFMISSINGORNULL(displayName, NULL)`, so the null-block logic in `controllers/alertsPage.ts#applyCursor` holds. String order is raw UTF-8 bytes in both systems.
- **`group` field**: a reserved word in SQL++, so it is always quoted via `quoteIdent`. Missing and null are normalized to `""` in the index and `PARTITION BY`, matching `computeHistoryMapKey(id, history.group || '')`.
- **Concurrent edits**: last write wins for user PATCH/PUT (D10). The scheduler's `setState` / `setExecutionErrors` mutate disjoint sub-document paths, so a concurrent user edit of `threshold` survives (Mongo `$set` parity).
- **Alert scheduler concurrency** (D9): the lease is taken per tick with a TTL of 2× the tick and renewed halfway. A second runner skips the tick and logs at debug. A crashed holder frees the lease at expiry, so at most one tick is skipped. ERROR history rows use deterministic keys, so even with the lease disabled, concurrent runners cannot duplicate them.
- **TTL docs mutated later**: `upsertErrorRow`, invite updates, and lookup docs for invites pass `preserveExpiry: true`, because without it Couchbase clears the expiry (doc-verified). A contract test asserts the expiry survives an update.
- **Index lag**: everything goes through `request_plus` or KV, so create-then-list in one request is consistent and tests need no sleeps.
- **Transactions + queries**: inside a transaction, only `ctx.query` is used, never `cluster.query`, so reads see the transaction's own writes.
- **Large lists**: the IaC manifest (`routers/api/iac.ts#bounded`) and external API pagination keep their limits. `page()` uses keyset on `META().id`. `LIMIT` and `OFFSET` are named parameters.
- **Multi-entity deletes** (dashboard + its alerts, saved search + its alerts, team member + alert reassignment): a single transaction once both entities are switched. That is strictly safer than today's sequential calls, with the same visible result. During C1–C3, while one side is still Mongo, the existing sequential code stays (no cross-store transaction is attempted).
- **Single-team invariant race**: two concurrent first registrations both pass `isTeamExisting()` today. With `team.singleton`, one gets `DuplicateKeyError` → existing 409 `teamAlreadyExists`, and its user insert rolls back in the same transaction.
- **Transition window (C1–C4)**: an unswitched Mongoose model can still hold a ref to a switched entity (for example `Alert.createdBy` → a user in Couchbase), so every `populate` of a switched entity is replaced in the same phase (C1 replaces all four `populate('createdBy'|'updatedBy')` sites with `users.getDisplay`). The ESLint rule from C0 forbids `populate(` on any path whose target model was deleted. Developer databases from before a phase are simply reset (D2). `make dev-reset-metadata` drops the dev bucket.
- **Local app mode**: no auth and no users, but sources, connections, and dashboards persist, so the all-in-one-noauth image also provisions `cbt_meta`.
- **Serverless (`serverless.ts`)**: lazy `connect()` with a cached promise reset on failure. Auto-provision is forced off, and verification is cached per container.
- **Memory headroom**: the all-in-one and compose cluster data quota grows by `CBT_METADATA_RAM_MB` (256 MiB). The `scripts/ci/smoke-all-in-one.sh` memory note and docs are updated.
- **Capella**: the bucket cannot be created by `ensureMetadataKeyspace` with database credentials, so `--capella` checks for it, prints the required bucket settings and `METADATA_ROLES`, and creates scope, collections, and indexes if the supplied credentials allow it (same pattern as the ingest `capellaAccess` output).
- **Tests sharing a cluster**: int suites reset with `DELETE FROM` per collection (`request_plus`) on a per-run scope (`app_test_<slot>`), not by dropping the bucket. They run `--runInBand`, as today.
- **Rule 3**: E2E helpers (`packages/app/tests/e2e/utils/db-helpers.ts`) must not import `couchbase`. They call the Query REST service with named `$params` via `fetch`, replacing `mongosh`.

## 6. Data migration

None (D2). No Mongo installs exist, so there is no import tool, export format, verification, checkpoint/resume, session import, or hash compatibility. The three `migrations/mongo/*` scripts, `migrate-mongo`, its `changelog`, and the startup backfill are deleted in C5 (and become unreachable earlier as their entities switch). Their upstream tests (`src/__tests__/addKindMigration.test.ts`, `src/__tests__/migrations.int.test.ts`) are deleted together with the code they test. That is a removal of migration code, not of a user-facing feature, so `port/features.json` has no `dropped` entry. Port-notes record the deletion and point to D7. Future schema changes follow the policy in 2.6.

## 7. Phases

Every phase: re-verify named paths and symbols before editing (rule 2) and record corrections in `docs/port-notes.md` under `## Mongo elimination: Cx`. Finish with `yarn lint:fix`, `make ci-lint`, `make ci-unit`, plus the listed integration targets, then make one commit. Do not start the next phase while the build is red. Size: S ≤ 1 day, M 2–3 days, L 4–6 days (single engineer with agent help).

Per-slice recipe (C1–C4), the same for every entity:
1. Before deleting the Mongoose model, add any missing characterization test against it (only where the upstream suite does not already pin a behavior the port depends on, for example `updatedAt` on `$set`).
2. Add the doc/input schemas, the Couchbase repo, the memory-store implementation, and contract tests (both backends).
3. Move every non-test caller to `getMetadataStore()`; replace `populate` of the entity.
4. Port the entity's upstream tests: `jest.mock('@/models/x')` → `setMetadataStoreForTests(createMemoryStore())`; int-test seeding `X.create(...)` → `seed.x(...)` (codemod `port/codemods/models-to-store.mjs`, extended per slice). Expected outputs do not change except for documented `__v` removal.
5. Delete `models/x.ts` and its test helpers. The ESLint `no-restricted-imports` rule lists deleted models, so a stray import fails lint.

### C0: Foundation, separate bucket, ids (L) — done

- Wire-contract snapshots (`src/__tests__/metadataContracts.int.test.ts` for the internal API, `metadataContractsExternal.int.test.ts` for external API v2 + MCP, shared seed in `metadataContractsWorld.ts`): JSON snapshots, with `_id`/`id`/date normalization, of every metadata-returning route (internal API, external API v2, MCP outputs). They are captured on the current stack and used as the spec in every later phase.
- `metadata/{types,ids,errors,serialize,index,unique,lock,schemaVersion}.ts`, `couchbase/{config,cluster,keyspace,kv,query,tx,verify,store}.ts`, `testing/{memoryKv,memoryStore,contract,seed,wire}.ts`, `common-utils/src/couchbase/{metadataKeyspace,nodeMetadataIndexes,nodeMetadataProvision}.ts`, `packages/ingest/src/setup/metadata.ts` + `cli.ts` flags. (As built: `unique`, `lock`, `schemaVersion` sit in `metadata/` because they only need `MetaKv`, so the memory store runs them too.)
- `isValidId` / `newId` replace every `isValidObjectId`, `ObjectId.isValid`, `new ObjectId()`, and `randomMongoId` (Mongoose still casts the hex strings). Check the tests for reliance on 12-character ids.
- Infrastructure: `docker/couchbase/init.sh` provisions `cbt_meta` (+ quota math), `CBT_METADATA_*` in `.env.{development,test,e2e}` and compose anchors, `port/couchbase-test/init.sh`, the all-in-one entry, and CI. Mongo stays.
- API connects to both stores; `/ready` reports `metadata` alongside `mongo`.
- Tests: contract suite (memory + Couchbase), `ids` unit tests (format, monotonic within a process, timestamp prefix), `connectRetry` ported, provisioning idempotency (run twice → second creates nothing), tx probe on single-node CI, lease tests, schema-version guard.
- **Done when**: snapshots green; contract suite green on both backends; `couchbase-init` creates `cbt_meta` idempotently in compose, CI, and all-in-one; nothing switched yet, all existing suites green.

### C1: Identity, auth, sessions (L) — done

- Team, user (incl. org API keys, onboarding, virtual users), and invite repos; `auth/password.ts` (scrypt), `auth/localStrategy.ts`; `CouchbaseSessionStore` in `api-app.ts`; `utils/passport.ts`, `middleware/auth.ts` (`Express.User` becomes the `User` type), `routers/api/{root,team,orgApiKeys}.ts`, `routers/external-api/v2/team.ts`, `controllers/{team,user,orgApiKey}.ts`, `opamp/controllers/opampController.ts` (team by API key).
- Replace all four `populate('createdBy'|'updatedBy')` sites with `users.getDisplay`. `deleteTeamMember` keeps its sequential delete-then-restore shape against the Mongo `Alert` model until C4.
- Remove `connect-mongo` and `@hyperdx/passport-local-mongoose` from `package.json`, since nothing uses them after this phase.
- Tests: password unit tests (round-trip, wrong password, unknown scheme, params encoding, `needsRehash`, timing-safe path), session store unit tests (express-session store semantics: get/set/touch/destroy, expiry from `cookie.expires`) + int test (login → cookie → `/me` → logout → 401), uniqueness race tests (20 parallel registrations / invites / API keys).
- **Done when**: `routers/api/__tests__/team.int.test.ts`, `controllers/__tests__/{team,orgApiKey}.int.test.ts`, the login/register/join-team/invite suites, the external v2 team suite, and opamp auth tests are green on Couchbase; the `team`, `user`, and `teamInvite` models are deleted; C0 snapshots are green.

### C2: Connections and sources (M) — done

- Connection and source repos (discriminated union, secrets projection). `dataLayerSetup.ts` loader → `connections.getWithSecrets`. The `fixtures.ts` CI loader is rewritten without `Connection.findById`. `controllers/{connection,sources}.ts`, `utils/queryableSource.ts`, routers, external v2, MCP sources, and `setupDefaults.ts`.
- **Done when**: `routers/api/__tests__/{connections,sources}.int.test.ts`, external v2 connections/sources, `controllers/__tests__/sources.int.test.ts`, and the MCP sources suites are green on Couchbase (the deferred list in `jest.int.config.js` stays as is); the models are deleted; snapshots are green.

### C3: Content (L) — done

- Saved searches, dashboards (incl. provisioner upsert and `tasks/provisionDashboards`), favorites, pinned filters, preset dashboard filters, webhooks, and `tags` (unions the switched collections with Mongo `Alert` until C4). Callers: `controllers/{savedSearch,dashboard,favorite,pinnedFilter,presetDashboardFilters,webhook}.ts`, `routers/api/{dashboards,webhooks,iac}.ts`, external v2 dashboards/savedSearches/webhooks + `utils/dashboards.ts`, MCP dashboards/savedSearches/webhooks, and `controllers/ai*.ts` reads.
- Deleting a dashboard or saved search still removes its alerts through the Mongo `Alert` model (sequential) until C4.
- **Done when**: all content int suites (incl. `provisionDashboards.int.test.ts`, IaC export/import, favorites, pinned filters, webhooks name-uniqueness 409) are green on Couchbase; the six models are deleted; snapshots are green.

### C4: Alerts, alert history, scheduler (L) — done

- Before deleting the Mongo alert models, capture characterization tests for `setState` / `updatedAt` and ERROR-row upsert behavior (recipe step 1).
- Alert and alert-history repos, incl. the window-function history queries and the alerts-page keyset. Callers: `controllers/{alerts,alertsPage,alertHistory}.ts`, `routers/api/alerts.ts`, external v2 alerts + `utils/alertChartConfig.ts`, `utils/{alerts,iacTileAlerts,externalApi}.ts`, `tasks/checkAlerts/**`, `scripts/seed-alerts.ts`.
- Upgrade the cross-entity paths to transactions: `deleteTeamMember`, dashboard/saved-search delete + alerts, and `tags` fully on Couchbase. Add the scheduler lease (D9) in `tasks/index.ts`.
- Delete `migrations.ts#runStartupMigrations` and its call in `server.ts` (D7).
- **Done when**: `checkAlertsTask.test.ts`, `evaluators.test.ts`, `alertHistory.int.test.ts`, `alertsPagination.int.test.ts`, the external v2 and MCP alerts suites, and lease tests (two runners → one evaluation per tick; crashed holder → next tick proceeds) are green on Couchbase; no `@/models/*` import is left except `models/index.ts` (connection only); snapshots are green.

### C5: Remove Mongo (L) — done

- Code: delete `models/**` (move the remaining pure types/enums such as `AlertState`, `AlertSource`, `getAlertChannels`, `attributesToGroupValues` to `metadata/schemas/*`), `migrate-mongo-config.ts`, `migrations/mongo/**`, `src/__tests__/{addKindMigration.test.ts,migrations.int.test.ts}`, the Mongo bits of `utils/readiness.ts` / `server.ts` / `serverless.ts` / `fixtures.ts`, the `MONGO_URI` config, any Mongo instrumentation config (there is no explicit package today; the auto-instrumentation simply goes idle once no driver is loaded), and the 11000 branch in `isDuplicateKeyError`. `/ready` → `metadata` only (D11; port `health.int.test.ts`).
- Dependencies: remove `mongoose`, `mongodb`, `migrate-mongo`, and any `mongodb-memory-server`; update `yarn.lock`, `knip.json`, `eslint.config.mjs` (`allowModules`), `docs/licenses.md` (regenerate), and the `next.config.mjs` comment.
- Infrastructure: remove the `db` service and `MONGO_URI` from `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.ci.yml`, `packages/app/tests/e2e/docker-compose.yml`, and `port/golden/docker-compose.yml`. All-in-one: drop the MongoDB apt install, `MONGODB_VERSION`, and `mongod` from `docker/hyperdx/Dockerfile`, `entry.cbt.sh`, and `entry.local.base.sh`, and update the image labels and smoke memory note. Scripts: `port/couchbase-test/run.sh`, `port/stack-smoke/run.sh`, `scripts/test-e2e.sh` (Couchbase readiness instead of `mongosh`), `scripts/slots.sh` / `Makefile` / `scripts/dev-env.sh` / `scripts/dev-portal/*` (drop `*_MONGO_PORT`, `dev-migrate-db`), `.github/actions/e2e-setup/action.yml`, `packages/app/playwright.config.ts`, `packages/app/tests/e2e/global-setup-fullstack.ts` + `utils/db-helpers.ts` (Query REST), `docker/hostmetrics/config.dev.yaml` (drop the `mongodb` receiver), and `.env.*`.
- Docs: `DEPLOY.md`, `CONTRIBUTING.md`, `docs/{development,self-managed,capella}.md` (metadata bucket, user, RAM, Capella steps), `agent_docs/*`, and the `AGENTS.md` repository-layout line (D13). Port-notes; `port/features.json` unchanged (nothing dropped).
- **Done when**: every section 8 criterion passes, including `make dev` with no Mongo, `make dev-int`, `port/couchbase-test/run.sh`, `make e2e`, `make build-all-in-one` + smoke, and `port/stack-smoke/run.sh`.

## 8. Acceptance criteria

1. `rg -n "mongoose|mongodb|connect-mongo|migrate-mongo|passport-local-mongoose|mongosh|mongod\b|MONGO_URI|_MONGO_PORT"` over the repo, excluding `docs/upstream/**`, CHANGELOGs, `docs/port-notes.md`, and this plan, returns no matches. No source file imports an `ObjectId` type or class.
2. No `packages/*/package.json` or `yarn.lock` entry for `mongoose`, `mongodb`, `connect-mongo`, `migrate-mongo`, `@hyperdx/passport-local-mongoose`, `mongodb-memory-server`, or `bson`.
3. No compose file, workflow, action, or Dockerfile defines a Mongo image or service. In the all-in-one image `which mongod` fails (asserted in `smoke-all-in-one.sh`).
4. `make ci-lint` and `make ci-unit` are green. Coverage floors are unchanged or raised.
5. Every integration suite that was green at C0 is green on Couchbase, apart from the deleted migration tests (section 6). The deferred list in `jest.int.config.js` is not extended. `port/couchbase-test/run.sh` exits 0 with no Mongo container.
6. The C0 wire-contract snapshots pass unchanged, apart from the documented `__v` removal and the `/ready` key (D11).
7. `make e2e` (full-stack Couchbase) is green for the specs green at C0: login, register, join team, dashboards, saved searches, alerts, webhooks, and sources.
8. Fresh install: `docker compose up` on an empty volume yields a `cbt_meta` bucket (Magma), the `app` scope, all section 1.1 collections with their `maxTTL`, all section 3.2 indexes online, the `cbt_meta` user with exactly the D12 roles, and `meta::schema.schemaVersion = 1`. Re-running `couchbase-init` creates nothing and exits 0.
9. Isolation: the telemetry query user gets an authorization error on `SELECT * FROM cbt_meta.app.connections`, and the metadata user gets one on `otel`.
10. Auth: register → login → `/me` → logout works. A wrong password returns the same status and `Password or username is incorrect`. Stored `hash` matches `^scrypt\$1\$N=32768,r=8,p=3\$`. Sessions survive an API restart and expire per cookie expiry (doc expiry within ±1 min).
11. Uniqueness: 20 parallel duplicate creates (same email, webhook name, favorite, provisioned dashboard name, first-team registration) yield exactly one success, and the rest map to the current HTTP codes.
12. TTL: alert history and invites expire ≈ createdAt + 30d (±1 min), and the expiry is unchanged after an ERROR-row update (`lookupIn` `$document.exptime`).
13. Ids: every created entity id matches `/^[0-9a-f]{24}$/`, sorting by id within a process equals creation order, and the Terraform/IaC export round-trips.
14. Scheduler: two concurrent task runners produce one evaluation and one notification per alert per tick (lease on), and with the lease disabled the ERROR rows are still not duplicated.
15. Rule 4: a unit test scans `metadata/couchbase/**` and `packages/ingest/src/setup/metadata.ts` for statements not built with the `sqlpp` tag, and an ESLint rule forbids string-concatenated statements.
16. Rule 3: `packages/app` and its bundle graph contain no `couchbase` or `@/metadata` import (lint + `next build` bundle check).
17. `/ready` returns 503 while the metadata cluster is down and 200 within 5s of it returning. The API survives a 60s Couchbase restart without a process restart. Starting the API against a bucket with `schemaVersion` 2 exits non-zero.
18. `docs/port-notes.md` has a "Mongo elimination" section per phase, and `port/features.json` shows no feature newly `dropped`.

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Hidden reliance on Mongoose document behavior (`.save()`, getters, `toObject()`, `.id` virtual, `Map.toJSON`, default materialization) in about 45 `toJSON`/`toObject` sites | subtle wire or logic regressions | C0 snapshots; repos return plain objects matching `toJSON` output; characterization tests before each model is deleted |
| No adapter phase means each slice changes behavior and storage at once | a red slice is larger to debug | slices are small and ordered by dependency; snapshots + contract suite on both backends catch storage vs logic issues separately; a slice can be split into two commits (callers, then tests) if it runs long |
| Transition window with two stores (C1–C4) | cross-store refs, populate, multi-entity deletes | refs are hex strings Mongoose casts; populate replaced in C1; cross-store deletes keep today's sequential code until C4 |
| Test rewrite volume (~1,150 model calls in 72 files) | schedule | codemod + `testing/seed.ts`, applied per slice |
| scrypt cost under login bursts | latency / memory | 32 MiB × threadpool size bound; parameters encoded for later tuning; load check in `port/stack-smoke` |
| Transactions on single-node buckets | `DurabilityImpossibleError` in dev/CI | replicas 0 by default on single node; startup tx probe |
| Second bucket RAM on small hosts / all-in-one | init fails on quota | 256 MiB default (Magma 128 vBuckets minimum is 100 MiB); quota math in `init.sh`; documented |
| Capella restricts bucket/user creation | setup can't finish alone | `--capella` prints exact bucket settings and roles, verifies, and creates what it can |
| Query latency vs Mongo for list endpoints | UI latency | covering indexes (section 3.2); KV multi-get for populate; p95 compared in `port/stack-smoke` at C0 and C5 |

## 10. Open questions

None block C0. All earlier questions are resolved in [Decisions](#decisions) (Q1 → D1, Q2/Q4 → D2, Q3 → D3, Q5 → D9, Q6 → D5, Q7 → D10, Q8 → D11, Q9 → D12, Q10 → D13). Defaults the user may want to override, with no impact on phase order:

- Metadata bucket defaults: `cbt_meta` / scope `app` / 256 MiB / replicas 0 in single-node environments.
- Scheduler lease on by default (D9).

## 11. Phase size summary

| Phase | Scope | Size |
|---|---|---|
| C0 | Foundation: primitives, separate bucket provisioning (setup + auto), ids, memory store, contract suite, snapshots | L |
| C1 | Identity, scrypt auth, Couchbase session store, populate replacement | L |
| C2 | Connections and sources, data-layer loader | M |
| C3 | Saved searches, dashboards + provisioner, favorites, pinned/preset filters, webhooks, tags | L |
| C4 | Alerts, alert history, scheduler + lease, cross-entity transactions, delete backfill | L |
| C5 | Remove Mongo: code, deps, compose/CI/E2E/all-in-one, docs | L |

The total is roughly 4–5 weeks for one engineer (revision 1: 5–7 weeks).

### Changes from revision 1

- Removed: the Mongo import tool (old section 6 and M6), import verification/checkpoint/resume, session import, the migrate-mongo port and migration runner, the startup backfill port, passport-local-mongoose pbkdf2 compatibility and golden tests, the Mongo adapter (`metadata/mongo/*`) and the `CBT_METADATA_STORE` flag, the dual-store "green on both" requirement, the XL "move callers to the seam" phase, the `migrations` collection, `META().id` scan indexes, and the `bson` question.
- Simplified: 9 phases → 6; each entity is switched once, directly to Couchbase; provisioning is idempotent DDL plus a version marker; one setup entry point (`couchbase-init`).
- Changed: separate `cbt_meta` bucket (was a scope in `otel`); scrypt (was pbkdf2-compatible); `/ready` key renamed; scheduler lease on by default; dedicated metadata user.

## 12. Final state (C5)

All phases are complete. MongoDB is gone from the product: no driver, container, env var, or instrumentation remains, and a guard keeps it that way.

- **Guard.** `scripts/ci/check-no-mongo.sh` (run by `make ci-lint`) fails on Mongo packages in any `package.json` or `yarn.lock`, imports of `mongoose`/`mongodb`/`bson`/`migrate-mongo`/`connect-mongo`, and Mongo services, env vars, or tooling in code and config. `packages/api/eslint.config.mjs` adds `no-restricted-imports` for the same packages.
- **Intentional leftovers.** Historical mentions in this plan, `docs/port-notes.md`, `docs/upstream/**`, `docs/acceptance.md` and `port/state/**` (generated evidence), `port/rebrand/**` (rebrand inventory), and the `docs/upstream-AGENTS.md` attribution; the `mongodb` connection-string scheme in `utils/redactSecrets.ts` (it redacts credentials and is test-covered); `db.system:mongodb` span-attribute examples in the MCP dashboard prompts; the string `mongodb` as sample span data in app search tests; and the `@opentelemetry/instrumentation-mongodb` / `-mongoose` entries in `docs/licenses.md`, which ship inside `@opentelemetry/auto-instrumentations-node` and stay idle because no driver is loaded.
- **Kept on purpose.** `hydrateAlertRefs` (`controllers/alertRefs.ts`) is the replacement for Mongoose `populate` (batched, team-scoped reads), not a type conversion, so it stays. `toObjectId` is gone.
- **Acceptance results** are recorded under `## Mongo elimination: C5` in `docs/port-notes.md`.
