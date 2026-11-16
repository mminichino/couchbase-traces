/**
 * Document canonicalization for ingest goldens. From port/ingest-parity/compare.mjs.
 */

export const INGEST_TABLES = [
  'otel_logs',
  'otel_sessions',
  'otel_traces',
  'otel_metrics_gauge',
  'otel_metrics_sum',
  'otel_metrics_histogram',
  'otel_metrics_exponential_histogram',
  'otel_metrics_summary',
];

export function padTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z)?$/.exec(
    value,
  );
  if (!match) return value;
  const frac = (match[3] || '').padEnd(9, '0').slice(0, 9);
  return `${match[1]}T${match[2]}.${frac}Z`;
}

export function canon(value) {
  if (typeof value === 'string') return padTime(value);
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canon(value[key]);
    return out;
  }
  return value;
}

export function nest(row) {
  const out = {};
  const groups = new Map();
  for (const [key, value] of Object.entries(row)) {
    const dot = key.indexOf('.');
    if (dot === -1 || key.startsWith('__')) {
      out[key] = value;
      continue;
    }
    const parent = key.slice(0, dot);
    const child = key.slice(dot + 1);
    if (!groups.has(parent)) groups.set(parent, {});
    groups.get(parent)[child] = value;
  }
  for (const [parent, children] of groups) {
    const arrays = Object.values(children).map(value =>
      Array.isArray(value) ? value.length : 0,
    );
    const length = arrays.length === 0 ? 0 : Math.max(...arrays);
    const items = [];
    for (let i = 0; i < length; i++) {
      const item = {};
      for (const [child, value] of Object.entries(children)) {
        item[child] = Array.isArray(value) ? value[i] : value;
      }
      items.push(item);
    }
    out[parent] = items;
  }
  return out;
}

export function keyOf(table, row) {
  if (table === 'otel_traces') return `${row.TraceId ?? ''}|${row.SpanId ?? ''}`;
  if (table === 'otel_logs' || table === 'otel_sessions') {
    return `${row.Timestamp}|${row.Body}`;
  }
  return `${row.MetricName}|${row.TimeUnix}|${JSON.stringify(canon(row.Attributes ?? {}))}`;
}

export function skipIngestField(table, field) {
  if (field.startsWith('__')) return true;
  if (table === 'otel_sessions' && field === 'EventName') return true;
  return false;
}

/**
 * @param {string} cbUrl
 * @param {string} table
 */
export async function fetchCouchbaseTable(cbUrl, table) {
  const cbUser = process.env.CB_USER || 'Administrator';
  const cbPassword = process.env.CB_PASSWORD || 'cbt-test-admin';
  const response = await fetch(`${cbUrl}/query/service`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${cbUser}:${cbPassword}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      statement: `SELECT d.* FROM \`otel\`.\`default\`.\`${table}\` AS d`,
    }),
  });
  const body = await response.json();
  if (body.status !== 'success') {
    throw new Error(`Couchbase ${table}: ${JSON.stringify(body.errors)}`);
  }
  return body.results;
}

/**
 * Normalized ingest summary: per-table count and stable row keys.
 * @param {string} cbUrl
 */
export async function captureIngestSummary(cbUrl) {
  /** @type {Record<string, { count: number; keys: string[] }>} */
  const tables = {};
  for (const table of INGEST_TABLES) {
    const rows = await fetchCouchbaseTable(cbUrl, table);
    const keys = rows
      .map(row => keyOf(table, row))
      .sort((a, b) => a.localeCompare(b));
    tables[table] = { count: rows.length, keys };
  }
  return { tables };
}
