# MongoDB elimination plan

Status: proposal, not started. Owner decisions needed: see [Open questions](#open-questions).

Goal: store all Couchbase Traces app metadata (teams, users, sessions, connections, sources, saved searches, dashboards, alerts, alert history, webhooks, favorites, pinned filters, preset dashboard filters, invites, migration state) in Couchbase Server Enterprise 8.x / Capella. After this plan, no Mongo containers, Mongo drivers, or Mongo env vars are left. Every feature keeps working, and ids, URLs, and API/MCP/CLI wire shapes stay the same.

This plan follows `AGENTS.md`. Work one phase at a time. Each phase ends with `make ci-lint` and `make ci-unit` green, plus the integration suites named in that phase, and then one commit. Build the Couchbase metadata layer next to Mongoose and switch through a seam (rule 5 pattern). The upstream tests are the specification (rule 6). Mongo code is deleted last. Anything dropped needs written sign-off recorded via `port/features.json` and then `port/inventory.sh render` (`docs/parity.md` is generated, so do not edit it by hand).

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
| No unique GSI | (GSI has no unique constraint) | Lookup documents |

Enterprise-only items we use: window functions (`ROW_NUMBER() OVER`), index replicas, and transactions on Capella and EE.

## Key design decisions

1. **Repository seam, not a Mongoose look-alike.** Each entity gets a typed repository interface. Two implementations of the interfaces exist during the switch-over: a Mongo one that wraps the existing models unchanged, and a Couchbase one. A single env flag, `CBT_METADATA_STORE=mongo|couchbase`, selects the implementation per process, and every caller is migrated to the interfaces first. We do not try to emulate the Mongo query language.
2. **Ids are preserved.** New ids remain 24-hex ObjectId-format strings, generated with the `bson` package's `ObjectId` (pure JS, no native code, no network driver; pinned directly; `bson@4.7.2` is already in the root `node_modules`). The id is the KV document key, so `GET /dashboards/:id` becomes a KV `get`. The wire shape keeps `_id` and `id` as identical strings. Migrated documents keep their original hex. Time-ordered ids keep `_id` sort and cursor semantics.
3. **Metadata bootstrap comes from env, never from a stored connection.** `CBT_METADATA_*` variables define the metadata cluster connection. They default to the telemetry `CBT_COUCHBASE_*` connstr, which removes the chicken-and-egg problem: user-defined Connection documents are data, and the metadata cluster connection is configuration.
4. **Uniqueness via lookup documents written in the same transaction.** Unique keys (email, accessKey, (team,service,name), …) become `uniq::<kind>::<hash>` documents written in the same transaction as the entity, or written with a KV `insert` first when no transaction is needed. Insert failing with `DocumentExistsError` maps to the existing `DuplicateKeyError` path (formerly code 11000).
5. **TTL becomes per-document expiry.** AlertHistory and TeamInvite get a 30-day collection `maxTTL`, plus an explicit expiry computed from `createdAt`. Sessions use per-document expiry equal to the cookie maxAge, refreshed by `touch`.
6. **Read-your-writes.** Every SQL++ metadata query defaults to `request_plus`. Single-document reads use KV (always consistent). `not_bounded` is an explicit opt-in, only for the scheduler's history prefetch where staleness is tolerated by design, and only after measurement.
7. **CAS optimistic locking** on every read-modify-write. A bounded retry (3 attempts) handles internal merges. User-facing edit conflicts keep the current last-write-wins semantics, because the API has no version field today. Adding ETags or `If-Match` is out of scope and listed as an open question.
8. **Passwords stay compatible.** A local strategy replacement re-implements the `passport-local-mongoose` pbkdf2 scheme exactly (sha256, 25,000 iterations, keylen 512, 32-byte hex salt, hex hash, `scmp`-equivalent `crypto.timingSafeEqual`) and keeps the same error messages, which `handleAuthError` string-matches. Existing hashes verify unchanged.
9. **Mongo export/import tool** (`cbt-metadata migrate-from-mongo`) for existing deployments. It is idempotent (keys are the ObjectId hex), has `--dry-run` and `--verify`, and is the only module after Phase M8 that may import `mongodb`. It ships as a separate optional script so the API image carries no Mongo dependency (depends on open question Q2).

## 1. File and module structure

All new modules are server-only and live under `packages/api/src/metadata/`. Nothing here is reachable from `packages/app` (rule 3). ESLint `no-restricted-imports` already blocks `couchbase` in app. Extend it to block `@/metadata/**` imports from any `common-utils` browser entry.

```
packages/api/src/metadata/
  index.ts                 # getMetadataStore(): MetadataStore; selects mongo|couchbase by CBT_METADATA_STORE
  types.ts                 # MetadataStore, Repository<T>, Page<T>, ListOptions, WriteOptions, error classes
  ids.ts                   # newId(), isId(), toIdString(); bson ObjectId hex
  errors.ts                # DuplicateKeyError, NotFoundError, CasConflictError, MetadataUnavailableError,
                           # IndexNotReadyError, TransactionFailedError; fromCouchbaseError()
  schemas/                 # Zod schemas per entity document (persisted shape), reusing common-utils types
    team.ts user.ts teamInvite.ts connection.ts source.ts savedSearch.ts dashboard.ts
    alert.ts alertHistory.ts webhook.ts favorite.ts pinnedFilter.ts presetDashboardFilter.ts
    session.ts migration.ts
  serialize.ts             # toWire(doc): adds _id/id, ISO dates; select:false field stripping
  mongo/                   # Phase M1 adapter: wraps existing models, deleted in M8
    index.ts  <entity>Repo.ts ...
  couchbase/
    config.ts              # reads CBT_METADATA_* env; MetadataClusterConfig
    cluster.ts             # connect/lease using common-utils clusterCache; health; close
    keyspace.ts            # metaKeyspace(collection): uses common-utils keyspace()/quoteIdent()
    kv.ts                  # typed get/insert/replace/upsert/remove/mutateIn with CAS + expiry
    query.ts               # runQuery(sqlpp: SqlPP, opts): uses common-utils sqlpp`` tag (named params)
    tx.ts                  # withTransaction(fn), retries + error mapping
    unique.ts              # claimUnique/releaseUnique lookup documents
    provision/
      collections.ts       # ensureMetadataScope(): scope + collections + maxTTL
      indexes.ts           # METADATA_INDEXES list; ensureIndexes(); waitForIndexesOnline()
      users.ts             # metadata RBAC user (self-managed only; Capella prints instructions)
    repos/
      teamRepo.ts userRepo.ts teamInviteRepo.ts connectionRepo.ts sourceRepo.ts
      savedSearchRepo.ts dashboardRepo.ts alertRepo.ts alertHistoryRepo.ts webhookRepo.ts
      favoriteRepo.ts pinnedFilterRepo.ts presetDashboardFilterRepo.ts
    sessionStore.ts        # express-session Store implementation
    lock.ts                # lease documents for the alert scheduler / provisioner
  auth/
    pbkdf2.ts              # hashPassword/verifyPassword compatible with passport-local-mongoose
    localStrategy.ts       # passport-local Strategy using UserRepository
  migrate/
    runner.ts              # metadata migration runner (replaces migrate-mongo)
    registry.ts            # ordered list of MetadataMigration
    migrations/            # 0001_…ts (ported from migrations/mongo + startup backfill)
  testing/
    memoryStore.ts         # in-memory MetadataStore for unit tests (replaces Mongo stand-ins)
    contract.ts            # shared repository contract suite run against memory + couchbase
packages/api/scripts/
  metadata-setup.ts        # CLI: provision scope/collections/indexes/user (used by init containers)
  migrate-from-mongo.ts    # one-time export/import tool (optional `mongodb` dependency)
```

Changed files (grouped by phase in section 7):

- `packages/api/src/config.ts`: adds `METADATA_STORE` and the `CBT_METADATA_*` variables; `MONGO_URI` is removed in M8.
- `server.ts`, `serverless.ts`, `api-app.ts`, `utils/readiness.ts`, `routers/api/root.ts`, `utils/passport.ts`, `middleware/auth.ts`, `dataLayerSetup.ts`, `fixtures.ts`, `migrations.ts`.
- Every caller in section 0.1/0.2 (40 non-test files), changed from `Model.x()` to `store.<entity>.y()`.
- `utils/zod.ts#objectIdSchema` and the `mcp/utils/errors.ts`, `routers/api/webhooks.ts`, and `routers/external-api/v2/search.ts` validators move to `metadata/ids.ts#isId` (strict 24-hex, which also fixes the 12-character-string quirk of `ObjectId.isValid`; the behavior change is recorded in port-notes).
- `utils/errors.ts#isDuplicateKeyError` recognizes `DuplicateKeyError`. `routers/external-api/v2/team.ts` stops checking `code === 11000`.
- `packages/ingest/src/setup/*`: the existing `ensureBucket`/`ensureCollections`/`ensureUsers` patterns are reused by `provision/*`. Code is extracted into shared helpers only if duplication exceeds the jscpd threshold.
- Infrastructure files in section 0.4 (Phase M7).

Module relations:

```
routers / controllers / mcp / opamp / tasks / scripts
          │  (only through)
          ▼
  metadata/index.ts ── getMetadataStore() ──► MetadataStore (types.ts)
          │                                     ├─ mongo/*      (M1–M7, removed M8)
          │                                     ├─ couchbase/*  ──► common-utils couchbase/node (clusterCache, sqlpp, keyspace)
          │                                     └─ testing/memoryStore (unit tests)
  auth/localStrategy ──► store.users        sessionStore ──► couchbase/kv
  dataLayerSetup ──► store.connections.getWithSecrets()  (telemetry Connection docs; metadata cluster from env)
```

### 1.1 Metadata keyspace layout

The default layout is bucket `CBT_METADATA_BUCKET` (default: the telemetry bucket `otel`), scope `CBT_METADATA_SCOPE` (default `cbt_meta`). Q1 asks whether to use a separate bucket instead. All names go through `keyspace({bucket, scope, collection})` / `quoteIdent` in `packages/common-utils/src/couchbase/sqlpp.ts`, which rejects backticks, NUL, newlines, and names longer than 251 characters (rule 4).

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
| `locks` | scheduler/provisioner leases | 0 (per-doc expiry) |
| `migrations` | applied-migration records + schema version doc | 0 |
| `txn_meta` | custom transactions metadata collection (ATRs) | 0 |

With a dedicated `txn_meta` collection, transactions never need the `_default` collection, and RBAC can be scoped to `cbt_meta`.

## 2. Interfaces and function signatures

### 2.1 Core types (`metadata/types.ts`)

```ts
export type Id = string; // 24 lowercase hex
export type TeamId = Id;

export type WriteOptions = { cas?: Cas; tx?: TxContext };
export type Consistency = 'request_plus' | 'not_bounded';
export type ListOptions<S extends string> = {
  sort?: { field: S; dir: 'asc' | 'desc' }[];
  limit?: number;          // hard cap 1000 unless noted
  after?: string;          // opaque keyset cursor
  consistency?: Consistency; // default 'request_plus'
};
export type Page<T> = { items: T[]; next?: string };
export type Versioned<T> = { doc: T; cas: Cas };

export interface TeamScopedRepository<T, In, Patch, S extends string = 'id'> {
  create(teamId: TeamId, input: In, opts?: WriteOptions): Promise<T>;
  get(teamId: TeamId, id: Id): Promise<T | null>;           // KV, verifies doc.team === teamId
  getVersioned(teamId: TeamId, id: Id): Promise<Versioned<T> | null>;
  list(teamId: TeamId, opts?: ListOptions<S>): Promise<T[]>;
  page(teamId: TeamId, opts: ListOptions<S>): Promise<Page<T>>;
  count(teamId: TeamId): Promise<number>;
  update(teamId: TeamId, id: Id, patch: Patch, opts?: WriteOptions): Promise<T | null>; // CAS retry loop
  delete(teamId: TeamId, id: Id, opts?: WriteOptions): Promise<boolean>;
}

export interface MetadataStore {
  teams: TeamRepository;
  users: UserRepository;
  teamInvites: TeamInviteRepository;
  connections: ConnectionRepository;
  sources: SourceRepository;
  savedSearches: SavedSearchRepository;
  dashboards: DashboardRepository;
  alerts: AlertRepository;
  alertHistory: AlertHistoryRepository;
  webhooks: WebhookRepository;
  favorites: FavoriteRepository;
  pinnedFilters: PinnedFilterRepository;
  presetDashboardFilters: PresetDashboardFilterRepository;
  sessions: SessionStoreFactory;
  locks: LockService;
  tags: { distinct(teamId: TeamId, type?: TagResourceType): Promise<string[]> };
  withTransaction<R>(fn: (tx: TxContext) => Promise<R>): Promise<R>;
  connect(opts?: { retry?: ConnectRetryOptions }): Promise<void>;
  isReady(): MetadataReadiness; // { ready: boolean; state: 'connecting'|'ready'|'degraded'|'closed' }
  close(): Promise<void>;
}

export function getMetadataStore(): MetadataStore;
export function setMetadataStoreForTests(store: MetadataStore): void;
```

### 2.2 Entity-specific methods (beyond the generic interface)

Each method replaces the call sites named in section 0.2.

```ts
interface TeamRepository {
  exists(): Promise<boolean>;                         // isTeamExisting
  createFirst(input: TeamInput): Promise<Team>;       // claims uniq::team::singleton
  getOnly(): Promise<Team | null>;                    // getTeam() == findOne({})
  getById(id: Id): Promise<Team | null>;
  getByApiKey(apiKey: string): Promise<Team | null>;  // uniq lookup doc → KV
  listAll(fields?: (keyof Team)[]): Promise<Team[]>;
  rotateApiKey(id: Id): Promise<Team>;
  setName(id: Id, name: string): Promise<Team>;
  updateQuerySettings(id: Id, s: TeamQuerySettingsUpdate): Promise<Team>; // null → unset
}

interface UserRepository {
  register(input: { email: string; name?: string; team?: Id }, password: string): Promise<User>; // DuplicateKeyError → 'UserExistsError'
  getById(id: Id): Promise<User | null>;
  getByEmail(email: string): Promise<UserWithSecrets | null>;  // lowercased, uniq lookup
  getByAccessKey(key: string, now?: Date): Promise<User | null>; // handles hdx_org_ hashing
  listByTeam(teamId: Id): Promise<User[]>;                     // NOT_VIRTUAL, createdAt asc
  createVirtual(input: VirtualUserInput): Promise<User>;
  rotateAccessKey(id: Id): Promise<User>;
  setPassword(id: Id, password: string): Promise<void>;
  addOnboardingTask(id: Id, task: OnboardingTaskId): Promise<User | null>;   // subdoc arrayAddUnique
  setOnboardingDismissed(id: Id, v: boolean): Promise<User | null>;
  touchLastUsed(id: Id, at: Date): Promise<void>;              // fire-and-forget
  revokeOrgKey(teamId: Id, id: Id, at: Date): Promise<User | null>;
  listOrgKeys(teamId: Id): Promise<User[]>;
  deleteTeamMember(teamId: Id, targetId: Id, requesterId: Id): Promise<'deleted'|'not_found'|'last_member'>; // one transaction
  getDisplay(ids: Id[]): Promise<Map<Id, { _id: Id; email: string; name: string }>>; // populate() replacement
}

interface AlertRepository extends TeamScopedRepository<Alert, AlertInput, AlertPatch, 'displayName'|'id'> {
  listAll(): Promise<Alert[]>;                               // scheduler: Alert.find({})
  pageForAlertsPage(teamId: Id, f: AlertsPageFilter, cursor?: AlertsPageCursor, limit: number): Promise<Page<Alert>>;
  countForAlertsPage(teamId: Id, f: AlertsFilterParams): Promise<number>;
  findBySavedSearch(teamId: Id, savedSearchId: Id): Promise<Alert[]>;
  findByDashboard(teamId: Id, dashboardId: Id, tileIds?: string[]): Promise<Alert[]>;
  deleteBySavedSearch(teamId: Id, savedSearchId: Id): Promise<number>;
  deleteByDashboardTiles(teamId: Id, dashboardId: Id, tileIdsToKeep?: string[]): Promise<number>;
  setState(id: Id, state: AlertState, errors: IAlertError[]): Promise<void>; // subdoc, no updatedAt bump (parity)
  setExecutionErrors(id: Id, errors: IAlertError[]): Promise<void>;
  reassignCreatedBy(teamId: Id, from: Id, to: Id, tx?: TxContext): Promise<number>;
  backfillDisplayFields(batch: number): Promise<{ scanned: number; updated: number }>;
}

interface AlertHistoryRepository {
  createMany(rows: AlertHistoryInput[]): Promise<PromiseSettledResult<void>[]>;
  upsertErrorRow(alertId: Id, windowStart: Date, errors: IAlertError[], analytics?: IAlertHistoryAnalytics): Promise<void>; // deterministic key
  deleteErrorRows(alertId: Id, range: { gt?: Date; lte: Date } | Date): Promise<number>;
  latestPerGroup(alertId: Id, now: Date, lookback: Date): Promise<AggregatedAlertHistory[]>;   // getPreviousAlertHistories
  rangeExcludingErrors(alertId: Id, gte: Date, lt: Date): Promise<AggregatedAlertHistory[]>;    // getConsecutiveWindowHistories
  groupedByWindow(alertId: Id, createdAt: DateRange, limit: number): Promise<GroupedAlertHistory[]>;
  structuredWindows(alertId: Id, createdAt: DateRange, limit: number): Promise<StructuredWindow[]>;
  transitionWindows(alertId: Id, gte: Date, lte: Date): Promise<{ createdAt: Date; states: string[]; bucketStarts: Date[][] }[]>;
  deleteByAlert(alertId: Id): Promise<number>;
}

interface ConnectionRepository extends TeamScopedRepository<Connection, ConnectionInput, ConnectionPatch> {
  getWithSecrets(id: Id, teamId?: Id): Promise<ConnectionWithSecrets | null>; // replaces select('+password +tlsCaCertificate')
}

interface SourceRepository extends TeamScopedRepository<Source, SourceInput, SourcePatch> {
  listByConnection(teamId: Id, connectionId: Id): Promise<Source[]>;
}

interface DashboardRepository extends TeamScopedRepository<Dashboard, DashboardInput, DashboardPatch> {
  search(teamId: Id, q: { nameContains?: string; tagsAll?: string[]; limit: number }): Promise<Dashboard[]>; // MCP searchDashboards
  upsertProvisioned(teamId: Id, name: string, insert: DashboardInput, update?: DashboardPatch): Promise<{ created: boolean; doc: Dashboard }>;
  deleteProvisionedNotIn(teamId: Id, names: string[]): Promise<number>;
}

interface WebhookRepository extends TeamScopedRepository<Webhook, WebhookInput, WebhookPatch> {
  listByService(teamId: Id, service?: WebhookService): Promise<Webhook[]>;
  getMany(teamId: Id, ids: Id[]): Promise<Map<Id, Webhook>>;   // scheduler getWebhooks
}

interface FavoriteRepository { list(teamId: Id, userId: Id): Promise<Favorite[]>; add(…): Promise<Favorite>; remove(…): Promise<boolean>; removeForResource(teamId: Id, type: FavoriteType, resourceId: string): Promise<number>; }
interface PinnedFilterRepository { get(teamId: Id, sourceId: Id): Promise<PinnedFilter | null>; put(teamId: Id, sourceId: Id, v: PinnedFilterInput): Promise<PinnedFilter>; } // key = deterministic
interface TeamInviteRepository { create(teamId: Id, input: { email: string; name?: string }): Promise<TeamInvite>; getByToken(token: string): Promise<TeamInvite | null>; list(teamId: Id): Promise<TeamInvite[]>; delete(teamId: Id, id: Id): Promise<boolean>; consume(token: string, tx?: TxContext): Promise<TeamInvite | null>; }
interface PresetDashboardFilterRepository extends TeamScopedRepository<PresetDashboardFilter, PresetDashboardFilterInput, PresetDashboardFilterPatch> { listForSource(teamId: Id, sourceId: Id, preset: PresetDashboard): Promise<PresetDashboardFilter[]>; }
```

Exact method lists are finalized per entity in M2–M5, by reading each caller. The rule is one repository method per distinct query shape. No method accepts a free-form filter object.

### 2.3 Couchbase primitives (`metadata/couchbase/*`)

```ts
// config.ts
export type MetadataClusterConfig = {
  connstr: string; username: string; password: string;
  bucket: string; scope: string; wanProfile?: boolean; caCertPath?: string;
  kvTimeoutMs: number; queryTimeoutMs: number; txTimeoutMs: number; txDurability: 'majority'|'none';
};
export function loadMetadataConfig(env?: NodeJS.ProcessEnv): MetadataClusterConfig; // throws MetadataConfigError (non-retryable)

// cluster.ts
export function connectMetadataCluster(cfg: MetadataClusterConfig, retry?: ConnectRetryOptions): Promise<Cluster>;
export function metaCollection(name: MetaCollection): Collection;
export function closeMetadataCluster(): Promise<void>;

// keyspace.ts
export type MetaCollection = 'teams'|'users'|…|'txn_meta';
export function metaKeyspace(c: MetaCollection): string; // keyspace({bucket, scope, collection: c})

// kv.ts
export function getDoc<T>(c: MetaCollection, key: string, schema: z.ZodType<T>): Promise<Versioned<T> | null>;
export function insertDoc<T>(c: MetaCollection, key: string, doc: T, o?: { expiry?: number; tx?: TxContext }): Promise<Cas>; // DocumentExists → DuplicateKeyError
export function replaceDoc<T>(c: MetaCollection, key: string, doc: T, o: { cas: Cas; expiry?: number; preserveExpiry?: boolean; tx?: TxContext }): Promise<Cas>; // CasMismatch → CasConflictError
export function mutateDoc<T>(c: MetaCollection, key: string, fn: (cur: T) => T | null, o?: { maxRetries?: number }): Promise<T | null>; // get→fn→replace(CAS) loop
export function removeDoc(c: MetaCollection, key: string, o?: { cas?: Cas; tx?: TxContext }): Promise<boolean>;
export function subdoc(c: MetaCollection, key: string, specs: MutateInSpec[], o?: { cas?: Cas; preserveExpiry?: boolean }): Promise<Cas>;

// query.ts
export function runQuery<T>(q: SqlPP, schema: z.ZodType<T>, o?: { consistency?: Consistency; tx?: TxContext; timeoutMs?: number }): Promise<T[]>;
// q is built with common-utils `sqlpp` tag; values ONLY as {Param}; identifiers ONLY via metaKeyspace/quoteIdent.

// tx.ts
export function withTransaction<R>(fn: (tx: TxContext) => Promise<R>, o?: { timeoutMs?: number }): Promise<R>;
// wraps cluster.transactions().run; metadataCollection = txn_meta; maps TransactionFailedError/CommitAmbiguous.

// unique.ts
export function uniqueKey(kind: UniqueKind, ...parts: string[]): string; // 'uniq::'+kind+'::'+sha256(JSON.stringify(parts))
export function claimUnique(kind: UniqueKind, parts: string[], ownerId: Id, tx?: TxContext): Promise<void>; // DuplicateKeyError(kind)
export function releaseUnique(kind: UniqueKind, parts: string[], ownerId: Id, tx?: TxContext): Promise<void>; // only if owner matches
export function resolveUnique(kind: UniqueKind, parts: string[]): Promise<Id | null>;

// lock.ts
export interface LockService {
  acquire(name: string, ttlMs: number, owner: string): Promise<Lease | null>; // KV insert w/ expiry; null if held
  renew(lease: Lease, ttlMs: number): Promise<boolean>;                         // CAS replace
  release(lease: Lease): Promise<void>;                                          // CAS remove
}
```

### 2.4 Session store (`metadata/couchbase/sessionStore.ts`)

```ts
export class CouchbaseSessionStore extends session.Store {
  constructor(o: { collection?: 'sessions'; ttlSeconds?: number /* default cookie maxAge 30d */; prefix?: 'sess::' });
  get(sid: string, cb: (err: unknown, s?: SessionData | null) => void): void;    // KV get; expired → null
  set(sid: string, s: SessionData, cb?: (err?: unknown) => void): void;          // KV upsert, expiry = cookie.expires || ttl
  touch(sid: string, s: SessionData, cb?: () => void): void;                     // collection.touch(key, expiry) — rolling:true
  destroy(sid: string, cb?: (err?: unknown) => void): void;                      // KV remove; DocumentNotFound ignored
  clear?(cb?): void;  length?(cb?): void;  all?(cb?): void;                      // SQL++ over sessions (tests/admin only)
}
```

Keys are `sess::<sid>` and the document stores the serialized `SessionData` (`{ cookie, passport: { user: Id }, messages? }`). `passport.serializeUser` keeps storing the user id string, so sessions stay compatible once ids are strings.

### 2.5 Password auth (`metadata/auth/*`)

```ts
export const PBKDF2 = { iterations: 25000, keylen: 512, digest: 'sha256', saltlen: 32, encoding: 'hex' } as const;
export function hashPassword(password: string): Promise<{ salt: string; hash: string }>;
export function verifyPassword(password: string, salt: string, hash: string): Promise<boolean>; // timingSafeEqual; false on length mismatch
export const AUTH_ERRORS = {
  incorrect: 'Password or username is incorrect',
  missingPassword: 'No password was given',
  missingUsername: 'No username was given',
  noSalt: 'Authentication not possible. No salt value stored',
  userExists: 'A user with the given username is already registered',
} as const;
export function createLocalStrategy(users: UserRepository): passport.Strategy; // usernameField 'email', lowercases
```

The behavior matches `@hyperdx/passport-local-mongoose@9.0.1` (`index.js`, `lib/authenticate.js`, `lib/pbkdf2.js`, verified in `node_modules`): `limitAttempts` is unset, so there is no lockout. The username is matched case-insensitively, which in practice means lowercased, because `usernameLowerCase` lowercases on save. Virtual users are rejected before verification, as today in `utils/passport.ts`.

### 2.6 Migration runner (`metadata/migrate/*`)

```ts
export type MetadataMigration = {
  id: string;                       // '0001_add_access_key' — sortable, immutable
  description: string;
  up(ctx: MigrationContext): Promise<void>;   // MUST be idempotent
  down?(ctx: MigrationContext): Promise<void>;
};
export type MigrationContext = { store: MetadataStore; query: typeof runQuery; kv: typeof import('../couchbase/kv'); log: Logger };
export function runPendingMigrations(o?: { dryRun?: boolean; to?: string }): Promise<{ applied: string[]; skipped: string[] }>;
export function migrationStatus(): Promise<{ id: string; appliedAt?: string; checksum: string }[]>;
```

A run takes a `locks` lease named `migrations` (TTL 5 min, renewed). Each migration then writes `migrations::<id>` `{ appliedAt, checksum, durationMs }` after `up` succeeds. A migration whose record exists is skipped. A checksum mismatch logs a warning and does not re-run the migration.

### 2.7 Provisioning (`metadata/couchbase/provision/*`, `scripts/metadata-setup.ts`)

```ts
export function ensureMetadataScope(cluster: Cluster, cfg: MetadataClusterConfig, log): Promise<void>; // scope + METADATA_COLLECTIONS w/ maxTTL
export const METADATA_INDEXES: { name: string; collection: MetaCollection; keys: string[]; where?: string }[];
export function ensureMetadataIndexes(cluster: Cluster, cfg, log, o?: { deferBuild?: boolean; numReplica?: number }): Promise<void>;
export function waitForMetadataIndexesOnline(cluster: Cluster, cfg, timeoutMs: number): Promise<void>; // system:indexes state='online'
export function ensureMetadataUser(cluster: Cluster, cfg, env, log): Promise<void>;                    // self-managed only
```

The CLI is `yarn workspace @couchbase-traces/api metadata-setup [--capella] [--create-bucket]`, with exit codes matching `packages/ingest/src/setup/errors.ts` (`SetupError`). The API calls `ensureMetadataScope` and `ensureMetadataIndexes` at startup only when `CBT_METADATA_AUTO_PROVISION=true` (the default in dev, CI, and all-in-one). Production and Capella run the CLI from an init container, so the API user needs no `query_manage_index` or `scope_admin`.

Index creation uses `CREATE INDEX IF NOT EXISTS … WITH {"defer_build": true}` followed by one `BUILD INDEX` per collection. On EE, `num_replica` comes from `CBT_METADATA_INDEX_REPLICAS` (default 0).

## 3. Data models

### 3.1 Conventions for every metadata document

- **Key**: the 24-hex id (for example `65f0c3…`). The body does not repeat `_id`. Repositories read the id from the key (or `META().id`) and add both `_id` and `id` in `serialize.ts#toWire`. Exceptions with deterministic keys: `uniq::…`, `sess::…`, `lock::…`, `migrations::…`, alert-history ERROR rows (see AlertHistory), and pinned filters (see PinnedFilter).
- **References** (`team`, `source`, `connection`, `createdBy`, …) are stored as 24-hex strings, not objects.
- **Dates** are stored as ISO-8601 UTC strings with millisecond precision (`Date#toISOString()`, always 24 characters), so lexicographic order equals chronological order for range scans and `ORDER BY`. Repositories convert them to `Date` on read, so callers that compare `Date`s keep working. JSON output is unchanged, because `Date` serializes to the same ISO string.
- **Timestamps**: `createdAt`/`updatedAt` are set by repositories. A `{ touchUpdatedAt: false }` option covers the `timestamps:false` backfill, and the scheduler's `setState` has the same behavior: Mongo `updateOne` with `$set` does bump `updatedAt` under `timestamps: true`. That is verified in an M5 contract test, and whichever behavior Mongo exhibits is kept.
- **Optional fields**: an absent value is *missing*, never `null`, unless the Mongo model persisted `null` explicitly. Defaults Mongoose applied on read (`state: OK`, `source: saved_search`, `kind: clickhouse`, `disabled: false`, `provisioned: false`, `isVirtual: false`, `onboardingData` default) are applied by the Zod read schema (`.default()`), so old and imported documents behave as before. Filters that rely on "missing equals default" (`inOrMissing` in `controllers/alertsPage.ts`) use `IFMISSINGORNULL(field, <default>)` in SQL++ and in the index key expression.
- **`__v`** is not stored and not emitted. Two server paths already strip it, and a contract snapshot confirms that no client reads it. The `Spotlights.test.tsx` fixture field is test data only.
- **Validation**: each collection has a Zod `XxxDocSchema` (persisted shape) and `XxxInputSchema` (create/patch). Both reuse `common-utils` schemas (`DashboardSchema`, `SavedSearchSchema`, `LogSourceSchema`…`PromqlSourceSchema`, `Team`, `WebhookService`, `AlertThresholdType`, `AlertErrorType`, `ONBOARDING_TASK_IDS`, `MetricsDataType`, `PresetDashboard`, `zAlertChannel(s)`). Mongoose validators are ported one-to-one: `scheduleOffsetMinutes` in `[0,1439]` and less than the interval in minutes, `numConsecutiveWindows ≥ 1`, `querySettings` length ≤ 10 with `setting`/`value` minlength 1, `queryMaxParallelism` 1–64, enums, `minAutoGranularity '' → undefined`, required fields (and "empty string satisfies required", per `models/index.ts` `checkRequired(v => v != null)`). Reads parse leniently (`.passthrough()` for Mixed fields such as `tiles`, `chartConfig`, `channel`, `filters`), and writes parse strictly.
- **Immutability**: `team` on every entity, and `createdBy` on Dashboard and SavedSearch, are dropped from patches before they reach the repository (`Patch` types omit them). That matches Mongoose `immutable: true`.
- **Secrets** (`select:false`): `Connection.password`, `tlsCaCertificate`, `monitorPassword`, and `User.hash`, `salt` are stored in the same document. The default `get`/`list` strips them, and only `getWithSecrets`/`getByEmail` (used by auth) return them. List queries project an explicit column list that excludes them.
- **Multi-tenancy**: one team per deployment today, but every team-scoped query filters on `team = $team`, and every KV `get(teamId, id)` checks `doc.team === teamId`. A cross-team id behaves exactly like a missing document (404), which preserves the current `findOne({_id, team})` semantics. Every index leads with `team`.
- **Local app mode**: `LOCAL_APP_TEAM` uses the stable hex `5f6c6f63616c5f7465616d5f`, the ObjectId Mongoose derived from `'_local_team_'`. `alert.team` in `providers/default.ts` then needs no cast, and documents created in local mode stay addressable. Synthetic user `_local_user_` stays non-persistable (`isPersistableUserId` is unchanged).

### 3.2 Per-entity documents

Fields not listed are carried over verbatim from section 0.1.

| Collection / key | Document shape (persisted) | Uniqueness (lookup doc kind → parts) | GSI indexes (`ix_<coll>_<purpose>`) |
|---|---|---|---|
| `teams` / id | `{ name, allowedAuthMethods?, hookId, apiKey, collectorAuthenticationEnforced, isMetricsSeriesTableEnabled, metadataMaxRowsToRead?, searchRowLimit?, queryTimeout?, fieldMetadataDisabled?, parallelizeWhenPossible?, filterKeysFetchLimit?, queryScanConsistency?, queryMaxParallelism?, createdAt, updatedAt }` | `team.singleton → []` (enforces single team); `team.apiKey → [apiKey]`; `team.hookId → [hookId]` | `ix_teams_created (createdAt)` (for `getOnly`/`listAll`) |
| `users` / id | `{ email (lowercase), name?, team?, accessKey, isVirtual, expiresAt?, lastUsedAt?, revokedAt?, createdBy?, onboardingData, hash?, salt?, createdAt, updatedAt }` | `user.email → [email]`; `user.accessKey → [accessKey]` | `ix_users_team (team, isVirtual, createdAt)`; `ix_users_orgkeys (team, createdBy) WHERE isVirtual = true` |
| `team_invites` / id | `{ teamId, name?, email, token, createdAt, updatedAt }`; expiry = createdAt + 30d | `invite.member → [teamId, email]`; `invite.token → [token]` (same expiry) | `ix_invites_team (teamId, createdAt)` |
| `connections` / id | as §0.1 incl. secrets, `kind` default `clickhouse` on read | none | `ix_connections_team (team)` |
| `sources` / id | discriminated union on `kind`; `{ team, connection, name, … kind-specific }`; `metricTables`/`metadataMaterializedViews` with no `_id` | none | `ix_sources_team (team, kind)`; `ix_sources_connection (team, connection)` |
| `saved_searches` / id | `{ team, name?, select?, where?, whereLanguage?, orderBy?, source, tags?, filters?, createdBy?, updatedBy?, createdAt, updatedAt }` | none | `ix_saved_searches_team (team)`; `ix_saved_searches_tags (team, DISTINCT ARRAY t FOR t IN tags END)` |
| `dashboards` / id | `{ name, tiles, team, tags (default []), filters (default []), savedQuery?, savedQueryLanguage?, savedFilterValues?, savedDateRange?, containers?, createdBy?, updatedBy?, provisioned (default false), createdAt, updatedAt }` | `dashboard.provisioned → [team, name]`, only when `provisioned: true` (partial-unique parity) | `ix_dashboards_team (team)`; `ix_dashboards_tags (team, DISTINCT ARRAY t FOR t IN tags END)`; `ix_dashboards_provisioned (team, name) WHERE provisioned = true` |
| `alerts` / id | as §0.1; `channels` absent unless set; `tags` absent unless set | none | `ix_alerts_team (team)`; `ix_alerts_page (team, IFMISSINGORNULL(displayName, NULL), META().id)`; `ix_alerts_tags (team, DISTINCT ARRAY t FOR t IN tags END)`; `ix_alerts_saved_search (team, savedSearch)`; `ix_alerts_dashboard (team, dashboard, tileId)`; `ix_alerts_created_by (team, createdBy)` |
| `alert_history` / id, or `err::<alertId>::<createdAtMs>` for ERROR rows | `{ alert, counts, createdAt, state, lastValues[], group?, fired?, groupValues?, errors?, analytics? }`; expiry = createdAt + 30d | ERROR row identity is the deterministic key (replaces the upsert filter `{alert, createdAt, state: ERROR}`) | `ix_alert_history_alert (alert, createdAt DESC, state)`; `ix_alert_history_group (alert, IFMISSINGORNULL(\`group\`, ""), createdAt DESC, state)` |
| `webhooks` / id | `{ team, service, name, url?, description?, titleEmoji?, queryParams?: Record<string,string>, headers?: Record<string,string>, body?, createdAt, updatedAt }` (Mongoose `Map` becomes a plain object, which `toJSON({flattenMaps:true})` already produced) | `webhook.name → [team, service, name]` | `ix_webhooks_team (team, service)` |
| `favorites` / id | `{ user, team, resourceType, resourceId, createdAt, updatedAt }` | `favorite → [team, user, resourceType, resourceId]` | `ix_favorites_user (team, user)`; `ix_favorites_resource (team, resourceType, resourceId)` |
| `pinned_filters` / id | `{ team, source, fields (default []), filters (default {}), createdAt, updatedAt }` | `pinned.source → [team, source]` | `ix_pinned_filters_team (team)` |
| `preset_dashboard_filters` / id | as §0.1 | none | `ix_preset_filters (team, presetDashboard, source)` |
| `unique_keys` / `uniq::<kind>::<sha256>` | `{ kind, owner: Id, parts: string[], createdAt }` | (is the constraint) | none (KV only) |
| `sessions` / `sess::<sid>` | `{ session: SessionData, expiresAt }`; doc expiry | n/a | none |
| `locks` / `lock::<name>` | `{ owner, acquiredAt, expiresAt }`; doc expiry | n/a | none |
| `migrations` / `migrations::<id>` | `{ appliedAt, checksum, durationMs }` | n/a | `ix_migrations_all (META().id)` |

Every collection also gets `ix_<coll>_ids (META().id)` for admin, backfill, and import verification scans. Primary indexes are created only in test setups (the `port/couchbase-test` pattern) and never in production.

Hashing `parts` with sha256 keeps lookup keys under the 250-byte key limit and keeps user-controlled text (names, emails) out of keys. The original parts are stored in the body for diagnostics.

### 3.3 Mongo operation to Couchbase mapping

| Mongo construct | Couchbase replacement |
|---|---|
| `findById`, `findOne({_id, team})` | KV `get` + team check |
| `findOne({email})`, `findOne({accessKey})`, `findOne({apiKey})`, `findOne({token})` | KV `get` on `uniq::` doc, then KV `get` on the entity. No query on hot auth paths, so bearer and `/login` lookups stay fast. |
| `find({team, …}).sort({_id:1})` | `SELECT … FROM ks AS d WHERE d.team = $team … ORDER BY META(d).id`, `request_plus` |
| `$set` / `$unset` partial update | sub-doc `mutateIn` (`upsert` / `remove`) for scheduler hot paths; `mutateDoc` CAS loop elsewhere |
| `$addToSet` | `MutateInSpec.arrayAddUnique(path, v, {createPath:true})`; `PathExistsError` → no-op |
| `$in`, `$ne`, `$exists`, `$or`, ranges | SQL++ `IN $arr` (array form, see port-notes Phase 11), `!=`, `IS NOT MISSING`/`IS VALUED`, `OR`, `>=`/`<` |
| `$regex` (escaped, `i`) | `CONTAINS(LOWER(d.displayName), LOWER($q))` (same literal-substring semantics; no regex needed) |
| `tags: {$all: arr}` | `EVERY t IN $tags SATISFIES t IN d.tags END` |
| `$unwind` + `$group` distinct tags | `SELECT DISTINCT RAW t FROM ks d UNNEST d.tags t WHERE d.team = $team` per collection, unioned in TS |
| alert-history `$group` by `createdAt` with `$push`/`$sum` | `SELECT h.createdAt, ARRAY_AGG(h.state) …, SUM(h.counts) … GROUP BY h.createdAt ORDER BY h.createdAt DESC LIMIT $limit` |
| latest per (alert, group) `$sort` + `$group $first` | `SELECT … FROM (SELECT h.*, ROW_NUMBER() OVER (PARTITION BY IFMISSINGORNULL(h.\`group\`,"") ORDER BY h.createdAt DESC) rn FROM ks h WHERE h.alert = $alert AND h.createdAt BETWEEN $lb AND $now AND h.state != "ERROR") x WHERE x.rn = 1` (EE window function) |
| `populate('createdBy','email name')` | `users.getDisplay(ids)` multi-get (KV), merged in the repo; output shape `{_id, email, name}` |
| `updateMany` / `deleteMany` | SQL++ `UPDATE`/`DELETE … WHERE team = $team AND …` (`request_plus`); inside `tx` when part of a multi-step change |
| `findOneAndUpdate(..., {upsert, $setOnInsert})` (provisioner) | claim `dashboard.provisioned` lookup in a transaction; on success insert, on duplicate apply update |
| `bulkWrite` backfill | batched CAS `mutateDoc` per document (500 per batch); the "inputs unchanged" filter becomes a CAS + field re-check |
| TTL index | collection `maxTTL` + explicit absolute expiry; every mutation of a TTL document passes `preserveExpiry: true` |
| `insertOne` restore (member delete) | not needed: `deleteTeamMember` runs in one transaction (count + delete + reassign alerts) |
| ObjectId generation / validation | `ids.ts#newId()` (bson) / `isId()` |

## 4. Error handling

| Failure | Detection | Surfaced as | Recovery |
|---|---|---|---|
| Metadata config missing or malformed (`CBT_METADATA_CONNSTR` unparsable, bucket name empty) | `loadMetadataConfig` + `common-utils` `parseConnStr` (`ConnStrError`) | `MetadataConfigError`; process exits non-zero (parity with `MongoParseError` fast-fail in `connectDBWithRetry`) | fix env |
| Cluster unreachable or auth failure at startup | SDK `connect` throws `UnambiguousTimeoutError` / `AuthenticationFailureError` / `RequestCanceledError` | logged with attempt + backoff; `/health` 200, `/ready` 503 `{ metadata: 'connecting' }`; counter `cbt.metadata.connection_events{event=initial_connect_retry}` | capped exponential backoff (1s→30s, forever), same as `connectDBWithRetry` |
| Bucket, scope, or collection missing | `BucketNotFoundError`, `ScopeNotFoundError`, `CollectionNotFoundError` on the first `waitUntilReady` / KV op | retryable while an init container may still be provisioning (logged as `metadata keyspace not provisioned`); with `AUTO_PROVISION=true`, provisioning is attempted | provision, then the retry loop continues |
| Indexes building or missing | `system:indexes` state ≠ `online`, or query error 12003/12004 (no index / index not found), or 4000-range plan errors | `IndexNotReadyError` → HTTP 503 with `Retry-After: 5`; `/ready` 503 `{ metadata: 'indexing' }` until `waitForMetadataIndexesOnline` passes | startup waits up to `CBT_METADATA_INDEX_WAIT_MS` (default 120s), then keeps serving KV-only routes and reports degraded |
| Runtime transient (KV/query timeout, temporary failure, node failover) | `TimeoutError`, `TemporaryFailureError`, `ServiceNotAvailableError` | `MetadataUnavailableError` → 503 (routes) / logged + retried next tick (scheduler) | SDK built-in retry strategy; no extra app-level retry on non-idempotent writes |
| Duplicate key | `DocumentExistsError` on lookup-doc insert | `DuplicateKeyError { kind, parts }`; `utils/errors.ts#isDuplicateKeyError` returns true, so existing 409 / `UserExistsError` / webhook-name messages are unchanged | none needed |
| CAS conflict | `CasMismatchError` | internal: re-read + reapply patch (≤3 tries); then `CasConflictError` → 409 `{ error: 'conflict' }` | caller retries |
| Document vanished during update | `DocumentNotFoundError` | `null` from repo → existing 404 paths | none |
| Transaction failure | `TransactionFailedError` (rolled back) | `TransactionFailedError` → 500 with logged cause; uniqueness causes are re-mapped to `DuplicateKeyError` | the SDK retries internally until `txTimeoutMs` |
| Transaction commit ambiguous | `TransactionCommitAmbiguousError` | logged at error with tx id; the repo re-reads the affected keys to decide success | idempotent re-read; on undecidable → 503 |
| Durability impossible (single-node bucket with replicas ≥ 1) | `DurabilityImpossibleError` on first transaction | startup self-check (`withTransaction` no-op probe) fails readiness with a clear message | set bucket replicas 0 on single-node dev, or set `CBT_METADATA_TX_DURABILITY=none` (dev only; logged as warning) |
| Orphaned lookup doc (entity write failed after non-tx claim) | `claimUnique` finds `owner` whose entity is missing | treated as free: the claim is overwritten via CAS | self-healing; a migration `0xxx_verify_unique_keys` also sweeps |
| Schema-invalid stored doc | Zod read parse failure | logged with key + issues; item skipped in lists (as Mongoose cast errors effectively did), 500 for a single get | data fix via migration |
| Partial migration (runner) | missing `migrations::<id>` record after crash | next start re-runs `up` (idempotent by contract) | lease expiry (5 min) frees the lock |
| Partial import (Mongo → Couchbase tool) | checkpoint doc `migrations::import-from-mongo` with per-collection offsets | tool exits non-zero and prints a resume command | re-run: upserts are idempotent; `--verify` reports diffs |
| Session store errors | KV errors in `get`/`set` | `get` errors → passed to express-session `cb(err)` → 500 (connect-mongo parity); `touch` errors swallowed + counted | none |

Every SDK error is converted once in `metadata/errors.ts#fromCouchbaseError`, which reuses `common-utils/src/couchbase/errors.ts#scrubMessage` so credentials never reach logs. HTTP mapping lives in the existing `middleware/error.ts#appErrorHandler`, extended for the new error classes.

## 5. Edge cases

- **Empty or invalid input**: `isId` rejects non-24-hex before KV access, so callers get 400 or 404 exactly where `ObjectId.isValid`/`CastError` did. The 12-character-string case that Mongoose accepted now returns 400 (recorded as a behavior change). Empty strings stay valid for "required" string fields. An empty `tags` array is kept distinct from missing (alerts `tags: default undefined`). Max document size is 20 MB on Couchbase vs 16 MB on Mongo, so no new limit is introduced. The `express.json` 32 MB limit stays the effective cap.
- **Email case**: emails are lowercased on write and lookup. The plugin's unescaped `RegExp('^'+email+'$','i')` lookup is replaced by an exact lowercase key, which fixes regex metacharacters in emails. The import tool reports emails that collide after lowercasing.
- **Null vs missing ordering**: Mongo sorts null and missing together, while SQL++ ASC puts MISSING before NULL. The alerts-page index and `ORDER BY` use `IFMISSINGORNULL(displayName, NULL)` so the cursor's "null block" logic in `controllers/alertsPage.ts#applyCursor` stays correct. String order is raw UTF-8 bytes in both systems, so it is unchanged.
- **`group` field**: `group` is a SQL++ reserved word, so it is always backtick-quoted via `quoteIdent`. Missing and null group are normalized to `""` in the history index and `PARTITION BY`, matching `computeHistoryMapKey(id, history.group || '')`.
- **Concurrent edits**: last write wins for user PATCH/PUT, the same as today. Internal read-modify-write uses CAS. The scheduler's `setState`/`setExecutionErrors` use sub-document mutations on disjoint paths, so a concurrent user edit of `threshold` is not clobbered by the scheduler (Mongo `$set` parity) and vice versa.
- **Alert scheduler concurrency**: there is no distributed lock today; one task process is assumed. The plan adds an optional lease `lock::check-alerts` (TTL = 2× tick, renewed). With `CBT_ALERT_SCHEDULER_LEASE=true` (default false for parity), a second runner skips the tick. History ERROR rows use deterministic keys, so concurrent runners cannot duplicate them.
- **Duplicate history rows**: normal history rows keep random ids. `AlertHistory.create` failures are tolerated individually (`Promise.allSettled`), as today.
- **TTL documents mutated later**: `upsertErrorRow` and invite updates pass `preserveExpiry: true`. Without it Couchbase would clear the expiry and the document would live forever (doc-verified). A contract test asserts the expiry survives an update.
- **Expiry vs `createdAt` in the past** (imported history): expiry = `createdAt + 30d`. If that is already past, the importer skips the document and counts it as `expired`.
- **Index lag**: everything goes through `request_plus` or KV. Create-then-list in one request (for example create dashboard, then the list page) is consistent. Unit/int tests that seed then query need no sleeps.
- **Transactions + `request_plus`**: inside a transaction, `ctx.query` reads its own writes. Repositories never mix `cluster.query` inside a transaction callback.
- **Large lists**: the IaC manifest (`routers/api/iac.ts#bounded`) and external API pagination keep their limits. `page()` uses keyset on `META().id`. `LIMIT`/`OFFSET` are named parameters.
- **Partial failure in multi-entity deletes** (delete a dashboard together with its alerts, or a saved search together with its alerts): wrap in `withTransaction`. Today these are sequential non-atomic Mongo calls, so this is strictly safer, and the visible result is the same.
- **Single-team invariant race**: two concurrent `/register/password` requests on an empty install both pass `isTeamExisting()` today. With the `team.singleton` lookup doc, one gets `DuplicateKeyError` → 409 `teamAlreadyExists`, and the other request's orphan user is rolled back in the same transaction.
- **Last team member**: `deleteTeamMember` in a single transaction (count non-virtual members, delete target, reassign `Alert.createdBy`) removes the restore-after-delete race and keeps the `'last_member'` result.
- **Local app mode**: no auth and no users, but sources, connections, and dashboards still persist. The all-in-one-noauth image still needs the metadata scope (Couchbase is already in the image).
- **Serverless (`serverless.ts`)**: lazy `connect()` on first invocation, with a cached promise reset on failure (same as now). A cold start must not run provisioning (`AUTO_PROVISION` is forced false).
- **Sessions after cutover**: the cookie name and secret are unchanged. If sessions are not imported, every user is signed out once (Q4).
- **Tests sharing a cluster**: integration suites reset with `DELETE FROM <coll>` on the test scope (`request_plus`), not by dropping the scope. They run `--runInBand`, as today (`main.yml` comment).
- **Rule 3**: E2E helpers in `packages/app/tests/e2e/utils/db-helpers.ts` must not import `couchbase`. They call the Query REST service (`POST :8093/query/service` with named `$params`) via `fetch`, or shell out to `cbq` in the container, replacing `mongosh`.

## 6. Data migration from existing Mongo deployments

The tool is `packages/api/scripts/migrate-from-mongo.ts` (Q2 decides whether it ships).

```ts
type ImportOptions = {
  mongoUri?: string;            // read directly (needs optional `mongodb` dep) …
  fromExport?: string;          // … or a directory of `mongoexport --jsonFormat=canonical` NDJSON files (no Mongo dep)
  collections?: MongoCollection[]; // default all 14 incl. sessions
  dryRun?: boolean; verify?: boolean; includeSessions?: boolean; batchSize?: number; // default 500
};
export function importFromMongo(o: ImportOptions): Promise<ImportReport>;
type ImportReport = Record<MongoCollection, { read: number; written: number; skipped: number; expired: number; invalid: { id: string; issues: string[] }[]; uniqueCollisions: string[] }>;
```

How it works:

- **Preconditions**: the source Mongo `changelog` must have all three `migrations/mongo` entries applied (the tool checks and refuses otherwise). The target scope must be provisioned and empty, or the run must pass `--resume`.
- **Mapping**: `$oid` becomes hex and `$date` becomes ISO. Mongoose discriminator `kind` is kept. `Map` fields become objects. `__v` is dropped. Each document is parsed with the M1 `DocSchema` (strict). Invalid documents are reported and skipped, and `--allow-invalid` imports them raw with a flag.
- **Write order**: teams → users → invites → connections → sources → saved searches → dashboards → webhooks → alerts → alert history → favorites → pinned filters → preset filters → sessions. Each document is an `upsert` keyed by the original id, followed by its lookup docs (`upsert` with the same owner). Re-running is idempotent. A lookup doc owned by a *different* id is a collision: it is reported and not overwritten.
- **Sessions**: connect-mongo stores `{ _id: sid, expires, session: <JSON string> }`. The importer parses that to `sess::<sid>` with expiry = `expires`, and skips expired sessions.
- **Verification (`--verify`)**: per-collection counts (Mongo vs `SELECT COUNT(*) … request_plus`), a per-document canonical-JSON sha256 comparison of `toWire()` output from the Mongo adapter vs the Couchbase repo, uniqueness lookup-doc count = entity count per unique kind, and a sample login with a known test user in CI. A non-zero diff exits with code 3.
- **Checkpointing**: `migrations::import-from-mongo` stores the last id per collection. `--resume` continues from it.
- After a successful import, the tool writes `migrations::<id>` records for the ported migration set, so the runner does not re-apply them.

## 7. Phases

Every phase: verify the named paths and symbols again before editing (rule 2) and record corrections in `docs/port-notes.md` under `## Mongo elimination: Mx`. Finish with `yarn lint:fix`, `make ci-lint`, `make ci-unit`, plus the listed integration targets, then make one commit. Do not start the next phase while the build is red. Size: S ≤ 1 day, M 2–3 days, L 4–6 days, XL > 1 week (single engineer with agent help).

### M0: Baseline and wire contracts (S)

- Add `packages/api/src/__tests__/metadataContracts.int.test.ts`. It records JSON snapshots, with `_id`/`id`/date normalization, for every metadata-returning route: internal API, external API v2, and MCP tool outputs for dashboards, saved searches, alerts, webhooks, sources, connections, team, me, favorites, pinned filters, and alert history/evaluations. Snapshots are captured against the current Mongo stack and are the cutover spec.
- Inventory script `port/inventory.sh` gains a `mongo` scan category (import counts) for progress tracking.
- **Done when**: the snapshots are committed and green on Mongo; the counts are recorded in port-notes.

### M1: Seam, ids, schemas, Mongo adapter (L)

- Add `metadata/types.ts`, `ids.ts`, `errors.ts`, `schemas/*`, `serialize.ts`, `mongo/*` (adapters delegating to the existing models), `testing/memoryStore.ts`, `testing/contract.ts`, and `index.ts` with `CBT_METADATA_STORE` (default `mongo`).
- Replace `objectIdSchema`/`ObjectId.isValid` uses with `isId`, and `randomMongoId` with `newId`.
- **Done when**: the contract suite passes on memory + mongo; no behavior change; M0 snapshots green.

### M2: Move callers to the seam (XL; split into commits M2a–M2e, each green)

- M2a: identity (`controllers/team.ts`, `controllers/user.ts`, `controllers/orgApiKey.ts`, `routers/api/{root,team,orgApiKeys}.ts`, `routers/external-api/v2/team.ts`, `middleware/auth.ts`, `utils/passport.ts`, `opamp/controllers/opampController.ts`).
- M2b: connections/sources (`controllers/{connection,sources}.ts`, `dataLayerSetup.ts`, `utils/queryableSource.ts`, routers, MCP sources).
- M2c: content (`controllers/{savedSearch,dashboard,favorite,pinnedFilter,presetDashboardFilters,webhook}.ts`, `routers/api/{dashboards,webhooks,iac}.ts`, external v2 dashboards/savedSearches/webhooks + `utils/dashboards.ts`, MCP dashboards/savedSearches/webhooks, `tasks/provisionDashboards`).
- M2d: alerts (`controllers/{alerts,alertsPage,alertHistory}.ts`, `routers/api/alerts.ts`, external v2 alerts + `utils/alertChartConfig.ts`, `utils/{alerts,iacTileAlerts,externalApi}.ts`, `tasks/checkAlerts/**`, `migrations.ts`, `scripts/seed-alerts.ts`).
- M2e: AI controllers (`controllers/ai*.ts`) and the remaining stragglers. Add an ESLint `no-restricted-imports` rule: `@/models/*` may be imported only from `metadata/mongo/**` and `scripts/migrate-from-mongo.ts`.
- Tests: unit tests that `jest.mock('@/models/…')` switch to `setMetadataStoreForTests(memoryStore())`. Int tests seed through `getMetadataStore()` (a mechanical rewrite of about 1,150 call sites; a codemod in `port/codemods/models-to-store.mjs`).
- **Done when**: no `@/models` import exists outside the allowlist, all int suites are green on Mongo, and the M0 snapshots are green.

### M3: Couchbase foundation + identity and auth (L)

- Add `couchbase/{config,cluster,keyspace,kv,query,tx,unique,lock}.ts`, `provision/*`, and `scripts/metadata-setup.ts`.
- Add the team, user, and invite repositories, `auth/pbkdf2.ts`, `auth/localStrategy.ts`, and `sessionStore.ts`.
- `api-app.ts` picks `CouchbaseSessionStore` when `CBT_METADATA_STORE=couchbase`. `utils/passport.ts` uses `createLocalStrategy`. `/ready` reports `metadata` (and keeps `mongo` while the flag is `mongo`).
- Add `CBT_METADATA_*` to `.env.test`. Add provisioning to `docker-compose.ci.yml` `couchbase-init` and to `port/couchbase-test/init.sh`.
- Tests: the contract suite runs on Couchbase (`*.couchbase.int.test.ts`). A pbkdf2 golden test hashes with the real plugin and verifies with the new module, and the reverse. Session-store tests use express-session's store compliance cases. A transaction probe test runs on the single-node CI cluster (replicas 0).
- **Done when**: `routers/api/__tests__/team.int.test.ts`, `controllers/__tests__/{team,orgApiKey}.int.test.ts`, and the login/register/join-team suites are green with `CBT_METADATA_STORE=couchbase`, and still green on Mongo.

### M4: Connections and sources (M)

- Add the connection and source repositories (discriminated union, secrets projection).
- `dataLayerSetup.ts` loader → `store.connections.getWithSecrets`. The `fixtures.ts` CI loader is rewritten without `Connection.findById`.
- **Done when**: the connections/sources int suites (`routers/api/__tests__/{connections,sources}.int.test.ts`, external v2 connections/sources, `controllers/__tests__/sources.int.test.ts`, MCP sources) are green on both stores (the deferred CH-shaped ones stay deferred as listed in `jest.int.config.js`), and the M0 snapshots are green on Couchbase.

### M5: Content and alerts (L)

- Add the saved-search, dashboard, favorite, pinned-filter, preset-filter, webhook, tags, alert, and alert-history repositories, including the window-function history queries, alerts-page keyset, the provisioner upsert, and the startup backfill.
- Contract tests pin the subtle parity points: null/missing ordering, `$addToSet`, `preserveExpiry`, ERROR-row upsert, `updatedAt` bump behavior, and populate shape.
- **Done when**: all remaining non-deferred int suites are green on both stores; `checkAlertsTask.test.ts`, `evaluators.test.ts`, `alertHistory.int.test.ts`, `alertsPagination.int.test.ts`, and `provisionDashboards.int.test.ts` are green on Couchbase; the M0 snapshots are green on Couchbase.

### M6: Migration runner + import tool (M)

- Add `migrate/runner.ts`, `registry.ts`, and migrations `0001_add_access_key`, `0002_add_kind_to_connections`, `0003_disable_legacy_connections`, `0004_backfill_alert_display_fields` (moved from `migrations.ts#runStartupMigrations`).
- Port `src/__tests__/addKindMigration.test.ts` and `migrations.int.test.ts` to the runner (same inputs, same expected documents).
- Add `scripts/migrate-from-mongo.ts` + `--verify`, an int test that seeds Mongo via the M1 adapter, imports, and verifies, and docs `docs/metadata-migration.md`.
- **Done when**: the runner is idempotent (two runs → second applies 0); the import round-trip diff is 0; resume works after a killed run (test kills mid-collection).

### M7: Cutover: default to Couchbase, infrastructure, E2E (L)

- `CBT_METADATA_STORE` defaults to `couchbase`.
- Remove the `db` service and `MONGO_URI` from `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.ci.yml`, `packages/app/tests/e2e/docker-compose.yml`, and `port/golden/docker-compose.yml`. Add `metadata-setup` to each `couchbase-init`.
- All-in-one: drop the MongoDB apt install, `MONGODB_VERSION`, and `mongod` from `docker/hyperdx/Dockerfile`, `entry.cbt.sh`, and `entry.local.base.sh`, and update the image labels and the `scripts/ci/smoke-all-in-one.sh` memory note.
- Scripts: `port/couchbase-test/run.sh` (no Mongo container), `port/stack-smoke/run.sh`, `scripts/test-e2e.sh` (Couchbase readiness instead of mongosh), `scripts/slots.sh` / `Makefile` / `scripts/dev-env.sh` / `scripts/dev-portal/*` (drop the `*_MONGO_PORT` variables and `dev-migrate-db` → `dev-metadata-migrate`), `.github/actions/e2e-setup/action.yml`, `packages/app/playwright.config.ts`, `packages/app/tests/e2e/global-setup-fullstack.ts` + `utils/db-helpers.ts` (Query REST helpers), `docker/hostmetrics/config.dev.yaml` (drop the `mongodb` receiver), and `.env.{development,test,e2e}`.
- **Done when**: `make dev` starts with no Mongo, `make dev-int`, `port/couchbase-test/run.sh`, `make e2e` (full-stack Couchbase), `make build-all-in-one` + smoke, and `port/stack-smoke/run.sh` are all green.

### M8: Delete Mongo (M)

- Delete `packages/api/src/models/**` (keep pure types/enums such as `AlertState`, `AlertSource`, `getAlertChannels`, `attributesToGroupValues` by moving them to `metadata/schemas/*` or common-utils), `metadata/mongo/**`, `migrate-mongo-config.ts`, `migrations/mongo/**`, `models/__tests__/connectRetry.test.ts` (ported as `metadata/couchbase/__tests__/connectRetry.test.ts` in M3), `utils/readiness.ts` Mongo bits, `fixtures.ts` Mongo helpers, and the `MONGO_URI` config.
- Remove the dependencies `mongoose`, `mongodb`, `connect-mongo`, `@hyperdx/passport-local-mongoose`, `migrate-mongo`, and update `yarn.lock`, `knip.json`, the `eslint.config.mjs` (`allowModules`) entries, `docs/licenses.md` (regenerate), and the `next.config.mjs` comment.
- If Q2 chooses the standalone importer, move it to `tools/metadata-import/` with its own `package.json` outside the workspaces that ship images.
- Docs: update `DEPLOY.md`, `CONTRIBUTING.md`, `docs/{development,self-managed,capella}.md`, `agent_docs/*`, and the `AGENTS.md` repository-layout line ("MongoDB for metadata" → "Couchbase for metadata"; requires user OK since AGENTS.md is project policy). Record in port-notes and update `port/features.json` (no feature dropped).
- **Done when**: the section 8 acceptance criteria all pass.

## 8. Acceptance criteria

1. `rg -n "mongoose|mongodb|connect-mongo|migrate-mongo|passport-local-mongoose|mongosh|mongod\b|MONGO_URI|_MONGO_PORT"` over the repo, excluding `docs/upstream/**`, CHANGELOGs, `docs/port-notes.md`, this plan, and the optional `tools/metadata-import/**`, returns no matches.
2. `packages/*/package.json` and `yarn.lock` list none of `mongoose`, `mongodb`, `connect-mongo`, `migrate-mongo`, `@hyperdx/passport-local-mongoose`, `mongodb-memory-server`.
3. No compose file (`docker-compose*.yml`, `packages/app/tests/e2e/docker-compose.yml`, `port/**/docker-compose.yml`), workflow, action, or Dockerfile defines a Mongo image or service. The all-in-one image contains no `mongod` binary (`docker run … which mongod` fails in `smoke-all-in-one.sh`).
4. `make ci-lint` and `make ci-unit` are green. Coverage floors are unchanged or raised.
5. Every integration suite that was green on Mongo at M0 is green on Couchbase. The deferred list in `jest.int.config.js` is not extended. `port/couchbase-test/run.sh` exits 0 without a Mongo container.
6. The M0 wire-contract snapshots pass unchanged against Couchbase, apart from the documented `__v` removal and the `/ready` key rename.
7. Playwright: `make e2e` (full-stack Couchbase) is green for the specs green at M0. Login, register, join-team, dashboards, saved searches, alerts, webhooks, and sources pass.
8. A user created on Mongo, imported with the tool, signs in with the original password. An existing session cookie stays valid after import with `--include-sessions`.
9. The import tool on the int fixture dataset reports `--verify` diff 0. A second run writes 0 changes (idempotent), and `--resume` after a forced kill completes.
10. Uniqueness: concurrent duplicate creates (20 parallel, same webhook name / same email / same favorite) yield exactly one success and the rest `DuplicateKeyError`, mapped to the current HTTP codes.
11. TTL: alert history and invites have expiry ≈ createdAt + 30d (±1 min), and the expiry is unchanged after an ERROR-row update (`lookupIn` `$document.exptime`).
12. Rule 4 check: a unit test scans `metadata/couchbase/**` for template literals passed to `runQuery` / `cluster.query`. Every statement is built with the `sqlpp` tag, and an ESLint rule forbids string-concatenated statements.
13. Rule 3 check: `packages/app` and its bundle graph contain no `couchbase` or `@/metadata` import (existing lint rule + `next build` bundle analysis).
14. `/ready` returns 503 while the metadata cluster is down and 200 within 5s of it returning. The API survives a 60s Couchbase restart without a process restart.
15. `docs/port-notes.md` has a "Mongo elimination" section per phase, and `port/features.json` shows no feature newly `dropped`.

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Hidden reliance on Mongoose document behavior (`.save()`, getters, `toObject()`, `.id` virtual, `Map.toJSON`, default materialization) in about 45 `toJSON`/`toObject` sites | subtle wire or logic regressions | M0 snapshots + M1 adapter returns the *same* plain objects the Couchbase repo will return, so regressions show up on Mongo before cutover |
| Test rewrite volume (~1,150 model calls in 72 files) | schedule | codemod + seed helpers on `getMetadataStore()`; M2 split into five commits |
| Transactions on single-node dev buckets (`DurabilityImpossibleError`) | dev/CI failures | metadata collections in a bucket with replicas 0 on single node (the ingest setup already creates `numReplicas: 0`); startup probe |
| Index build time on large Capella clusters | slow first start | `defer_build` + init-container provisioning; KV-only hot paths |
| Query service latency vs Mongo for list endpoints | UI latency | covering indexes per §3.2; KV multi-get for populate; measure p95 in `port/stack-smoke` before/after |
| Same bucket as telemetry (if Q1 = same) shares RAM quota and bucket-level `maxTTL` | metadata eviction/expiry | collections set `maxTTL: -1` where 0 is intended (doc-verified override); recommend separate bucket |
| The bucket the user configures for metadata is on Capella with restricted management | provisioning fails | `metadata-setup --capella` prints the required collections, indexes, and roles, like the ingest setup's `capellaAccess` |
| ObjectId validator tightening (12-char strings) | some existing client passing odd ids gets 400 | logged as a behavior change; only the local-mode synthetic ids were affected, and they are handled |
| `bson` package considered "a Mongo dependency" | acceptance dispute | Q6; fallback is a 20-line in-repo generator with the same layout (4-byte seconds + 5 random + 3 counter) |

## 10. Open questions

- **Q1. Bucket placement**: (a) a separate metadata bucket (`cbt_meta`, recommended: independent RAM quota, no telemetry TTL interaction, separate RBAC and backup), or (b) a `cbt_meta` scope in the telemetry bucket `otel` (fewer resources: no second bucket RAM quota on small dev/all-in-one installs). Defaults in this plan follow (b) for dev/all-in-one and allow (a) via env. Which is the product default?
- **Q2. Migration tool**: ship the Mongo→Couchbase importer? If yes: (a) read live Mongo (needs `mongodb` as an isolated dependency in `tools/metadata-import`), or (b) read `mongoexport` canonical EJSON only (zero Mongo dependency; the user runs `mongoexport`). Recommended: (b), with (a) only if you want one-command migration.
- **Q3. Session store**: (a) the custom Couchbase KV store in this plan (recommended), (b) a signed stateless cookie session (no server store; changes logout/revocation semantics), or (c) an external store such as Redis (adds a dependency).
- **Q4. Session continuity at cutover**: import sessions (users stay signed in) or accept a one-time sign-out?
- **Q5. Scheduler lease**: enable the `lock::check-alerts` lease by default (safe for multiple task replicas, slight behavior change) or keep it off for parity?
- **Q6. Id generator**: keep the `bson` package for `ObjectId` hex, or use an in-repo generator so no package of Mongo origin remains?
- **Q7. Conflict semantics**: keep last-write-wins for user edits (parity, the default here), or add ETag/`If-Match` → 409 on dashboards/alerts (new feature, out of parity scope)?
- **Q8. `/ready` payload**: rename `mongo` to `metadata` (breaking for anyone scraping the key) or keep the `mongo` key name with the Couchbase state for one release?
- **Q9. Metadata credentials**: reuse `CBT_COUCHBASE_QUERY_USER` with added write roles, or a dedicated `CBT_METADATA_USER` (recommended: least privilege; the query user stays read-only for telemetry)?
- **Q10. `AGENTS.md` edit**: OK to update the repository-layout line ("MongoDB for metadata") in M8?

## 11. Phase size summary

| Phase | Scope | Size |
|---|---|---|
| M0 | Wire-contract snapshots, inventory counts | S |
| M1 | Seam, ids, Zod doc schemas, Mongo adapter, memory store, contract suite | L |
| M2 | Move ~167 call sites + ~1,150 test call sites to the seam (M2a–M2e) | XL |
| M3 | Couchbase foundation, provisioning, identity repos, pbkdf2 auth, session store | L |
| M4 | Connections and sources repos, data-layer loader | M |
| M5 | Content + alerts + alert-history repos, scheduler queries | L |
| M6 | Migration runner, ported migrations, Mongo import tool + verify | M |
| M7 | Default to Couchbase; compose, CI, E2E, all-in-one, scripts | L |
| M8 | Delete Mongo code, dependencies, docs | M |

Total is roughly 5–7 weeks for one engineer.

