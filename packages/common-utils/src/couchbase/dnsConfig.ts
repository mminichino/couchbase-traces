// Server only: the result is passed to the Couchbase SDK's connect().

/**
 * DNS SRV budget for a single-hostname connection string (D18). The SDK
 * looks up `_couchbase._tcp.<host>` before every such connect, with a 500 ms
 * default split evenly between UDP and a TCP retry. A lookup that misses it
 * fails the whole connect with UnambiguousTimeoutError, about 500 ms in,
 * instead of falling back to the host as it does on NXDOMAIN.
 */
export const DEFAULT_DNS_SRV_TIMEOUT_MS = 2000;

/**
 * SDK `dnsConfig` for every connect. Only the timeout is set; the SDK keeps
 * the nameserver and port it reads from the system resolver configuration.
 * Read at call time, like the other CBT_COUCHBASE_* limits.
 */
export function dnsConfig(env: NodeJS.ProcessEnv = process.env): {
  dnsSrvTimeout: number;
} {
  const raw = env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS;
  const n = raw != null && raw !== '' ? Number(raw) : NaN;
  return {
    dnsSrvTimeout:
      Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_DNS_SRV_TIMEOUT_MS,
  };
}
