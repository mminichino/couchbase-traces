export type ParsedConnStr = {
  scheme: 'couchbase' | 'couchbases';
  hosts: { host: string; port: number | null }[];
  params: Record<string, string>;
};

export class ConnStrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnStrError';
  }
}

const MAX_HOSTS = 32;
const SCHEME_RE = /^(couchbases?):\/\/(.*)$/i;
const HOSTNAME_LABEL_RE = /^[A-Za-z0-9-]{1,63}$/;
const IPV6_ADDRESS_RE = /^[0-9A-Fa-f:.]+$/;
const IPV6_ZONE_RE = /^[A-Za-z0-9_.-]+$/;

function isIpv6(host: string): boolean {
  const [address = '', zone, ...rest] = host.split('%');
  return (
    rest.length === 0 &&
    address.includes(':') &&
    IPV6_ADDRESS_RE.test(address) &&
    (zone === undefined || IPV6_ZONE_RE.test(zone))
  );
}

function isHostname(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  const labels = (host.endsWith('.') ? host.slice(0, -1) : host).split('.');
  return labels.every(
    label =>
      HOSTNAME_LABEL_RE.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  );
}

function parsePort(raw: string): number {
  if (!/^\d{1,5}$/.test(raw)) {
    throw new ConnStrError(`Invalid port: ${raw}`);
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new ConnStrError(`Invalid port: ${raw}`);
  }
  return port;
}

function parseHost(entry: string): { host: string; port: number | null } {
  if (entry.startsWith('[')) {
    const end = entry.indexOf(']');
    if (end < 0) {
      throw new ConnStrError('Unterminated IPv6 address');
    }
    const host = entry.slice(1, end);
    if (!isIpv6(host)) {
      throw new ConnStrError(`Invalid IPv6 address: ${host}`);
    }
    const rest = entry.slice(end + 1);
    if (rest === '') return { host, port: null };
    if (!rest.startsWith(':')) {
      throw new ConnStrError(`Invalid host: ${entry}`);
    }
    return { host, port: parsePort(rest.slice(1)) };
  }
  const parts = entry.split(':');
  if (parts.length > 2) {
    throw new ConnStrError(
      `Invalid host: ${entry} (IPv6 addresses must be in brackets)`,
    );
  }
  const [host, port] = parts;
  if (!isHostname(host)) {
    throw new ConnStrError(`Invalid host: ${host}`);
  }
  return { host, port: port === undefined ? null : parsePort(port) };
}

export function parseConnStr(s: string): ParsedConnStr {
  if (typeof s !== 'string') {
    throw new ConnStrError('Connection string must be a string');
  }
  const m = SCHEME_RE.exec(s.trim());
  if (!m) {
    throw new ConnStrError(
      'Connection string must start with couchbase:// or couchbases://',
    );
  }
  const scheme: ParsedConnStr['scheme'] =
    m[1].toLowerCase() === 'couchbases' ? 'couchbases' : 'couchbase';
  let rest = m[2];

  let query = '';
  const q = rest.indexOf('?');
  if (q >= 0) {
    query = rest.slice(q + 1);
    rest = rest.slice(0, q);
  }

  const slash = rest.indexOf('/');
  if (slash >= 0) {
    if (rest.slice(slash) !== '/') {
      throw new ConnStrError('Connection string must not contain a path');
    }
    rest = rest.slice(0, slash);
  }

  if (rest.includes('@')) {
    throw new ConnStrError(
      'Connection string must not contain credentials; use the username and password fields',
    );
  }

  const entries = rest.split(',').map(h => h.trim());
  if (rest.trim() === '' || entries.some(e => e === '')) {
    throw new ConnStrError('Connection string must list at least one host');
  }
  if (entries.length > MAX_HOSTS) {
    throw new ConnStrError(
      `Connection string lists more than ${MAX_HOSTS} hosts`,
    );
  }
  const hosts = entries.map(parseHost);

  const paramPairs: [string, string][] = [];
  if (query !== '') {
    for (const pair of query.split('&')) {
      if (pair === '') continue;
      const eq = pair.indexOf('=');
      if (eq <= 0) {
        throw new ConnStrError(`Invalid connection string parameter: ${pair}`);
      }
      try {
        paramPairs.push([
          decodeURIComponent(pair.slice(0, eq)),
          decodeURIComponent(pair.slice(eq + 1)),
        ]);
      } catch {
        throw new ConnStrError(`Invalid connection string parameter: ${pair}`);
      }
    }
  }

  return { scheme, hosts, params: Object.fromEntries(paramPairs) };
}

export function isValidCouchbaseConnStr(s: string): boolean {
  try {
    parseConnStr(s);
    return true;
  } catch {
    return false;
  }
}

export function defaultWanProfile(p: ParsedConnStr): boolean {
  return p.scheme === 'couchbases';
}

export function isCapellaHost(p: ParsedConnStr): boolean {
  return p.hosts.some(h =>
    h.host.toLowerCase().replace(/\.$/, '').endsWith('.cloud.couchbase.com'),
  );
}

/** Resolves `wanProfile` for a connection: explicit value, else from the scheme. */
export function resolveWanProfile(
  host: string,
  wanProfile: boolean | undefined | null,
): boolean {
  if (typeof wanProfile === 'boolean') return wanProfile;
  try {
    return defaultWanProfile(parseConnStr(host));
  } catch {
    return false;
  }
}
