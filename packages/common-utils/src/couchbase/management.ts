import { ConnStrError, parseConnStr } from './connstr';
import type { CouchbaseConnectionConfig } from './nodeCluster';

export type ManagementTarget = { url: string; ca?: string };

const PLAIN_PORT = 8091;
const TLS_PORT = 18091;

/** Bracket an IPv6 host. `parseConnStr` stores the address without brackets. */
function formatHost(host: string): string {
  if (!host.includes(':')) return host;
  return `[${host.replace(/%/g, '%25')}]`;
}

function overridePort(value: number | undefined): number | undefined {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65535
  ) {
    return value;
  }
  return undefined;
}

/**
 * Management REST origin for the first host. The connection-string port is the
 * bootstrap port and is not reused. A private-IP host is rejected by the caller,
 * the same way the connection test rejects it, before this URL is requested.
 */
export function managementBaseUrl(
  conn: CouchbaseConnectionConfig & { managementPort?: number },
): ManagementTarget {
  const parsed = parseConnStr(conn.host);
  const first = parsed.hosts[0];
  if (first == null) {
    throw new ConnStrError('Connection string must list at least one host');
  }
  const tls = parsed.scheme === 'couchbases';
  const port =
    overridePort(conn.managementPort) ?? (tls ? TLS_PORT : PLAIN_PORT);
  const target: ManagementTarget = {
    url: `${tls ? 'https' : 'http'}://${formatHost(first.host)}:${port}`,
  };
  if (tls && conn.tlsCaCertificate) target.ca = conn.tlsCaCertificate;
  return target;
}
