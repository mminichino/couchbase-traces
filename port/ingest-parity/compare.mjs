#!/usr/bin/env node
/**
 * Compare ClickHouse exporter rows with Couchbase documents for one batch.
 * Columns the exporter creates and Couchbase does not store (its own
 * __otel_materialized_* fields, and EventName on the sessions table) are
 * skipped. Couchbase-only materialized fields are skipped the other way.
 */
const tables = [
  'otel_logs',
  'hyperdx_sessions',
  'otel_traces',
  'otel_metrics_gauge',
  'otel_metrics_sum',
  'otel_metrics_histogram',
  'otel_metrics_exponential_histogram',
  'otel_metrics_summary',
];

const chUrl = process.env.CH_URL || 'http://127.0.0.1:8123';
const cbUrl = process.env.CB_URL || 'http://127.0.0.1:8093';
const cbUser = process.env.CB_USER || 'Administrator';
const cbPassword = process.env.CB_PASSWORD || 'cbt-test-admin';
const chUser = process.env.CH_USER || 'parity';
const chPassword = process.env.CH_PASSWORD || 'parity';

const mismatches = [];

function padTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z)?$/.exec(value);
  if (!match) return value;
  const frac = (match[3] || '').padEnd(9, '0').slice(0, 9);
  return `${match[1]}T${match[2]}.${frac}Z`;
}

function canon(value) {
  if (typeof value === 'string') return padTime(value);
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canon(value[key]);
    return out;
  }
  return value;
}

function nest(row) {
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
    const arrays = Object.values(children).map(value => (Array.isArray(value) ? value.length : 0));
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

function same(left, right) {
  const a = empty(left, right);
  const b = empty(right, left);
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

function empty(value, other) {
  if (value != null) return value;
  if (Array.isArray(other)) return [];
  if (other && typeof other === 'object') return {};
  return value;
}

function keyOf(table, row) {
  if (table === 'otel_traces') return `${row.TraceId ?? ''}|${row.SpanId ?? ''}`;
  if (table === 'otel_logs' || table === 'hyperdx_sessions') {
    return `${row.Timestamp}|${row.Body}`;
  }
  return `${row.MetricName}|${row.TimeUnix}|${JSON.stringify(canon(row.Attributes ?? {}))}`;
}

function skip(table, field, couchbase) {
  if (field.startsWith('__')) return true;
  if (table === 'hyperdx_sessions' && field === 'EventName' && !(field in couchbase)) {
    return true;
  }
  return false;
}

async function clickhouse(table) {
  const params = new URLSearchParams({
    user: chUser,
    password: chPassword,
    database: 'parity',
    date_time_output_format: 'iso',
    output_format_json_quote_64bit_integers: '0',
  });
  const response = await fetch(`${chUrl}/?${params}`, {
    method: 'POST',
    body: `SELECT * FROM parity.\`${table}\` FORMAT JSONEachRow`,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ClickHouse ${table}: ${text}`);
  return text
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => nest(JSON.parse(line)));
}

async function couchbase(table) {
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

for (const table of tables) {
  const [chRows, cbRows] = await Promise.all([clickhouse(table), couchbase(table)]);
  if (chRows.length !== cbRows.length) {
    mismatches.push(`${table} count clickhouse=${chRows.length} couchbase=${cbRows.length}`);
  }
  const byKey = new Map(cbRows.map(row => [keyOf(table, row), row]));
  for (const row of chRows) {
    const key = keyOf(table, row);
    const other = byKey.get(key);
    if (!other) {
      mismatches.push(`${table} key ${key} missing from couchbase`);
      continue;
    }
    for (const field of Object.keys(row)) {
      if (skip(table, field, other)) continue;
      if (!(field in other)) {
        mismatches.push(`${table} key ${key} field ${field} missing from couchbase value=${JSON.stringify(row[field])}`);
        continue;
      }
      if (!same(row[field], other[field])) {
        mismatches.push(
          `${table} key ${key} field ${field} clickhouse=${JSON.stringify(canon(row[field]))} couchbase=${JSON.stringify(canon(other[field]))}`,
        );
      }
    }
  }
}

if (mismatches.length > 0) {
  for (const line of mismatches) console.error(line);
  process.exit(1);
}
console.log('parity ok');
