import { readFileSync } from 'node:fs';

/** Hostnames that always fail I2 regardless of allowlist. */
export const BLOCKED_DNS_SUFFIXES = [
  'hyperdx.io',
  'clickhouse.com',
  'clickhouse.cloud',
  'reo.dev',
  'greenhouse.io',
  'deploysentinel.com',
];

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isBlockedDnsName(name) {
  const n = name.replace(/\.$/, '').toLowerCase();
  if (n.includes('clickstack')) return true;
  return BLOCKED_DNS_SUFFIXES.some(
    s => n === s || n.endsWith(`.${s}`),
  );
}

/**
 * Parse CoreDNS query log lines into hostnames.
 * Supports common formats:
 *   [INFO] 172.18.0.2:54321 - 12345 "A IN example.com. udp ..."
 *   172.18.0.2:54321 - [INFO] example.com. A
 * @param {string} text
 * @returns {string[]}
 */
export function parseCoreDnsLog(text) {
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Prefer quoted QNAME form from log plugin.
    let m = line.match(/"([A-Z]+)\s+IN\s+([^\s"]+)\s+/i);
    if (m) {
      names.push(m[2].replace(/\.$/, ''));
      continue;
    }
    m = line.match(/\b(?:A|AAAA|CNAME|PTR|SRV|TXT|MX|NS)\s+IN\s+([^\s]+)/i);
    if (m) {
      names.push(m[1].replace(/\.$/, ''));
      continue;
    }
    m = line.match(/\b([a-z0-9_.-]+\.[a-z0-9_.-]+)\.\s+(?:A|AAAA|CNAME)\b/i);
    if (m) {
      names.push(m[1].replace(/\.$/, ''));
    }
  }
  return names;
}

/**
 * @param {string} name
 * @param {{ names?: string[], services?: string[] }} allowlist
 * @param {string[]} [composeServices]
 * @returns {boolean}
 */
export function isAllowedDnsName(name, allowlist, composeServices = []) {
  const n = name.replace(/\.$/, '').toLowerCase();
  // Reverse lookups
  if (n.endsWith('.in-addr.arpa') || n.endsWith('.ip6.arpa')) return true;
  // Numeric CoreDNS noise / empty labels
  if (/^\d+(\.\d+)*$/.test(n)) return true;
  const services = composeServices.map(s => s.toLowerCase());
  // Compose service names (single label or service.network)
  const short = n.split('.').filter(Boolean).pop();
  if (short && services.includes(short)) return true;
  if (services.includes(n)) return true;
  // SDK SRV lookups like _couchbase._tcp.couchbase
  if (services.some(s => n === s || n.endsWith(`.${s}`))) return true;
  const allowed = (allowlist.names ?? []).map(x => x.toLowerCase());
  if (allowed.includes(n)) return true;
  return false;
}

/**
 * Evaluate DNS queries against allowlist and blocked list.
 * @param {string[]} queriedNames
 * @param {{ names?: string[], entries?: { name: string, service: string, reason: string }[] }} allowlist
 * @param {string[]} composeServices
 * @returns {{ ok: boolean, blocked: string[], unexpected: string[] }}
 */
export function evaluateDnsQueries(queriedNames, allowlist, composeServices) {
  const namesFromEntries = (allowlist.entries ?? []).map(e => e.name);
  const merged = {
    names: [...(allowlist.names ?? []), ...namesFromEntries],
  };
  /** @type {string[]} */
  const blocked = [];
  /** @type {string[]} */
  const unexpected = [];
  const seen = new Set();
  for (const raw of queriedNames) {
    const n = raw.replace(/\.$/, '').toLowerCase();
    if (seen.has(n)) continue;
    seen.add(n);
    if (isBlockedDnsName(n)) {
      blocked.push(n);
      continue;
    }
    if (!isAllowedDnsName(n, merged, composeServices)) {
      unexpected.push(n);
    }
  }
  return {
    ok: blocked.length === 0 && unexpected.length === 0,
    blocked,
    unexpected,
  };
}

/**
 * @param {string} path
 * @returns {string[]}
 */
export function readDnsLogFile(path) {
  try {
    return parseCoreDnsLog(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}
