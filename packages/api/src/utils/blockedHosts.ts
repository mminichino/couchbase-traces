import {
  ConnStrError,
  parseConnStr,
} from '@couchbase-traces/common-utils/dist/couchbase/connstr';

/**
 * `host:port` pairs a webhook must never target: the deployment's own data
 * stores and telemetry endpoints. Webhooks run server-side, so one pointed at
 * the metadata or telemetry cluster would reach Couchbase REST from inside the
 * network. Allowlisting a hostname (WEBHOOK_HOSTNAME_ALLOWLIST) does not lift
 * these blocks.
 *
 * A connection string names nodes, not the HTTP ports a webhook could hit, so
 * each node is expanded to the Couchbase Server service ports below plus any
 * port written in the string. Other ports on the same host stay open, so a
 * developer can still allowlist `localhost` and run a webhook receiver next to
 * a local cluster. Private and loopback addresses are blocked separately.
 */
export type BlockedHosts = Map<string, string>;

/** Settings that hold Couchbase connection strings. */
export const CONNSTR_ENV_KEYS = [
  'CBT_METADATA_CONNSTR',
  'CBT_COUCHBASE_CONNSTR',
] as const;

/** Settings that hold http(s) URLs of internal services. */
export const URL_ENV_KEYS = ['OTEL_EXPORTER_OTLP_ENDPOINT'] as const;

/**
 * Couchbase Server 8.0 client-to-node ports (8091-8097, 9123 Prometheus, 9140
 * eventing debugger, 11210, 11280; TLS 11207, 18091-18097) plus the indexer
 * HTTP ports (9102, 19102), which are HTTP even though only nodes use them.
 * https://docs.couchbase.com/server/8.0/install/install-ports.html
 */
export const COUCHBASE_SERVICE_PORTS: readonly number[] = [
  8091, 8092, 8093, 8094, 8095, 8096, 8097, 9102, 9123, 9140, 11207, 11210,
  11280, 18091, 18092, 18093, 18094, 18095, 18096, 18097, 19102,
];

export const normalizeHostname = (hostname: string): string =>
  hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '')
    .toLowerCase();

const hostKey = (host: string, port: number | string): string =>
  `${normalizeHostname(host)}:${port}`;

/** `host:port` keys for every node in a connection string; [] if invalid. */
const connStrKeys = (connstr: string): string[] => {
  let hosts;
  try {
    hosts = parseConnStr(connstr).hosts;
  } catch (e) {
    // The service that owns the setting reports invalid configuration.
    if (e instanceof ConnStrError) return [];
    throw e;
  }
  return hosts.flatMap(({ host, port }) => {
    const ports = new Set<number>(COUCHBASE_SERVICE_PORTS);
    if (port != null) ports.add(port);
    return [...ports].map(p => hostKey(host, p));
  });
};

/** Hosts in `DEFAULT_CONNECTIONS`, a JSON array of `{ host }` objects. */
const defaultConnectionKeys = (raw: string | undefined): string[] => {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap(c =>
    c != null && typeof c === 'object' && typeof c.host === 'string'
      ? connStrKeys(c.host)
      : [],
  );
};

export function buildBlockedHosts(
  env: Record<string, string | undefined>,
): BlockedHosts {
  const blocked: BlockedHosts = new Map();
  const add = (key: string, source: string) => {
    if (!blocked.has(key)) blocked.set(key, source);
  };

  for (const name of CONNSTR_ENV_KEYS) {
    const value = env[name];
    if (value) connStrKeys(value).forEach(k => add(k, name));
  }
  defaultConnectionKeys(env.DEFAULT_CONNECTIONS).forEach(k =>
    add(k, 'DEFAULT_CONNECTIONS'),
  );
  for (const name of URL_ENV_KEYS) {
    const value = env[name];
    if (!value) continue;
    try {
      const url = new URL(value);
      add(hostKey(url.hostname, url.port), name);
    } catch {
      // Invalid service configuration is handled by the service that owns it.
    }
  }
  return blocked;
}

/** The setting that blocks `url`, or `undefined` when it is allowed. */
export function blockedBy(blocked: BlockedHosts, url: URL): string | undefined {
  return blocked.get(hostKey(url.hostname, url.port));
}
