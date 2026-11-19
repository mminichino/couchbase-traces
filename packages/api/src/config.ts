import crypto from 'crypto';

const env = process.env;

// DEFAULTS
const DEFAULT_APP_TYPE = 'api';
const DEFAULT_FRONTEND_URL = env.CBT_APP_PORT
  ? `http://localhost:${env.CBT_APP_PORT}`
  : '';

export const NODE_ENV = env.NODE_ENV as string;

export const APP_TYPE = (env.APP_TYPE || DEFAULT_APP_TYPE) as
  | 'api'
  | 'scheduled-task';
export const CODE_VERSION = env.CODE_VERSION ?? '';
// Only for single container local deployments, disable authentication
export const IS_LOCAL_APP_MODE =
  env.IS_LOCAL_APP_MODE === 'DANGEROUSLY_is_local_app_mode💀';
const LEGACY_PUBLIC_SESSION_SECRET = 'hyperdx is cool 👋';
// Authenticated deployments never use the public demo secret. Without a safe
// configured value, generate one per process (sessions end on restart).
export const IS_EXPRESS_SESSION_SECRET_GENERATED =
  !env.EXPRESS_SESSION_SECRET ||
  (!IS_LOCAL_APP_MODE &&
    env.EXPRESS_SESSION_SECRET === LEGACY_PUBLIC_SESSION_SECRET);
export const EXPRESS_SESSION_SECRET =
  !IS_EXPRESS_SESSION_SECRET_GENERATED && env.EXPRESS_SESSION_SECRET
    ? env.EXPRESS_SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');
export const FRONTEND_URL = (env.FRONTEND_URL ||
  DEFAULT_FRONTEND_URL) as string;
const CBT_IMAGE = env.CBT_IMAGE;
export const IS_APP_IMAGE = CBT_IMAGE === 'hyperdx';
export const IS_ALL_IN_ONE_IMAGE = CBT_IMAGE === 'all-in-one-auth';
export const IS_LOCAL_IMAGE = CBT_IMAGE === 'all-in-one-noauth';
// On Vercel preview deployments the API is inlined into the Next.js app and
// shares its origin, so we emit relative redirects (FRONTEND_URL there points
// at the production host). Everywhere else the API and app run on separate
// hosts, so absolute URLs anchored at FRONTEND_URL are required.
export const IS_INLINE_API = env.CBT_PREVIEW_INLINE_API === 'true';
export const FRONTEND_REDIRECT_BASE = IS_INLINE_API ? '' : FRONTEND_URL;
export const INGESTION_API_KEY = env.INGESTION_API_KEY ?? '';
// Opt-in: emit the contrib `datadogreceiver` on the collector so a
// Datadog Agent can ship APM traces (DD trace API -> OTLP -> legacy store).
// Off by default because the receiver has no per-team bearer-token auth like
// `otlp/hyperdx`, so enabling it opens an unauthenticated ingest port (:8126).
export const ENABLE_DATADOG_RECEIVER = env.ENABLE_DATADOG_RECEIVER === 'true';
export const CBT_API_KEY = env.CBT_API_KEY as string;
export const CBT_LOG_LEVEL = env.CBT_LOG_LEVEL as string;
export const IS_CI = NODE_ENV === 'test';
export const IS_DEV = NODE_ENV === 'development';
export const IS_PROD = NODE_ENV === 'production';
export const MONGO_URI = env.MONGO_URI;
export const OTEL_SERVICE_NAME = env.OTEL_SERVICE_NAME as string;
export const PORT = Number.parseInt(env.PORT as string);
export const OPAMP_PORT = Number.parseInt(env.OPAMP_PORT as string);
export const WEBHOOK_HOSTNAME_ALLOWLIST = env.WEBHOOK_HOSTNAME_ALLOWLIST ?? '';
export const RUN_SCHEDULED_TASKS_EXTERNALLY =
  env.RUN_SCHEDULED_TASKS_EXTERNALLY === 'true';

// Alert scheduler lease (D9): on unless explicitly disabled. The tick is the
// interval between scheduled runs; the lease TTL is twice that.
export const ALERT_SCHEDULER_LEASE = env.CBT_ALERT_SCHEDULER_LEASE !== 'false';
export const ALERT_TICK_MS = Number.parseInt(env.CBT_ALERT_TICK_MS ?? '60000');

// 32-byte key (base64 or hex). Setting it is what turns on encryption of
// stored third-party tokens; unset means they are stored in plain text. See
// utils/tokenEncryption.ts.
export const TOKEN_ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY;

// Only used to bootstrap empty instances
export const DEFAULT_CONNECTIONS = env.DEFAULT_CONNECTIONS;
export const DEFAULT_SOURCES = env.DEFAULT_SOURCES;
/** When `couchbase`, seeds log/trace/metric/session sources from the preset. */
export const DEFAULT_SOURCES_PRESET = env.CBT_DEFAULT_SOURCES_PRESET;

/** PromQL was dropped (Phase 5a). Code is deleted in Phase 10. */
export const IS_PROMQL_ENABLED = false;

export const COUCHBASE_BUCKET = env.CBT_COUCHBASE_BUCKET ?? 'otel';
export const COUCHBASE_SCOPE = env.CBT_COUCHBASE_SCOPE ?? 'default';

export const EXTERNAL_API_RATE_LIMIT_MAX = (() => {
  const parsed = Number(env.EXTERNAL_API_RATE_LIMIT_MAX);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 100;
})();

export const EXTERNAL_API_SEARCH_DEFAULT_MAX_RESULTS = 100;

export const EXTERNAL_API_SEARCH_MAX_RESULTS = (() => {
  const parsed = Number(env.EXTERNAL_API_SEARCH_MAX_RESULTS);
  // A cap below the default would make requests without maxResults invalid.
  return Number.isSafeInteger(parsed) &&
    parsed >= EXTERNAL_API_SEARCH_DEFAULT_MAX_RESULTS
    ? parsed
    : 2000;
})();

const positiveIntEnv = (name: string, fallback: number) => {
  const parsed = Number(Reflect.get(env, name));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// Couchbase SDK limits. common-utils reads the same variables at call time.
export const COUCHBASE_DEFAULT_TIMEOUT_MS = positiveIntEnv(
  'CBT_COUCHBASE_DEFAULT_TIMEOUT_MS',
  60000,
);
export const COUCHBASE_MAX_TIMEOUT_MS = positiveIntEnv(
  'CBT_COUCHBASE_MAX_TIMEOUT_MS',
  600000,
);
export const COUCHBASE_CONNECT_TIMEOUT_MS = positiveIntEnv(
  'CBT_COUCHBASE_CONNECT_TIMEOUT_MS',
  10000,
);
export const COUCHBASE_CLUSTER_IDLE_MS = positiveIntEnv(
  'CBT_COUCHBASE_CLUSTER_IDLE_MS',
  600000,
);
export const COUCHBASE_MAX_CLUSTERS = positiveIntEnv(
  'CBT_COUCHBASE_MAX_CLUSTERS',
  50,
);
export const COUCHBASE_MAX_BUFFERED_BYTES = positiveIntEnv(
  'CBT_COUCHBASE_MAX_BUFFERED_BYTES',
  268435456,
);
export const COUCHBASE_FRAME_ROWS = positiveIntEnv(
  'CBT_COUCHBASE_FRAME_ROWS',
  500,
);

// FOR CI ONLY
export const CLICKHOUSE_HOST = env.CLICKHOUSE_HOST as string;
export const CLICKHOUSE_USER = env.CLICKHOUSE_USER as string;
export const CLICKHOUSE_PASSWORD = env.CLICKHOUSE_PASSWORD as string;

// AI Assistant
// Provider-agnostic configuration (preferred)
export const AI_PROVIDER = env.AI_PROVIDER as string; // 'anthropic' | 'openai'
export const AI_API_KEY = env.AI_API_KEY as string;
export const AI_BASE_URL = env.AI_BASE_URL as string;
export const AI_MODEL_NAME = env.AI_MODEL_NAME as string;
export const AI_REQUEST_HEADERS = env.AI_REQUEST_HEADERS as string;

// Legacy Anthropic-specific configuration (backward compatibility)
export const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY as string;
