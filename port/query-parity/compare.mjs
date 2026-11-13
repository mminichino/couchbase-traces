#!/usr/bin/env node
/**
 * Compares Lucene matches, aggregates, and sampled metadata between the
 * ClickHouse and Couchbase copies of one seeded dataset.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../../packages/common-utils/dist');
const { CustomSchemaSQLSerializerV2, SearchQueryBuilder } = require(
  join(dist, 'queryParser.js'),
);
const { CouchbaseSearchBuilder } = require(join(dist, 'couchbase/serializer.js'));
const { parseGranularity, timeBucketExpr, timeRangePredicate } = require(
  join(dist, 'couchbase/time.js'),
);
const { quantile } = require(join(dist, 'couchbase/fn/quantile.js'));

const chUrl = process.env.CH_URL;
const cbUrl = process.env.CB_URL;
const span = JSON.parse(process.env.PARITY_WINDOW || '{}');
const from = new Date(span.from);
const to = new Date(span.to);

const LOG_COLUMNS = [
  { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
  { name: 'ServiceName', type: 'LowCardinality(String)' },
  { name: 'SeverityText', type: 'LowCardinality(String)' },
  { name: 'SeverityNumber', type: 'UInt8' },
  { name: 'Body', type: 'String' },
  { name: 'LogAttributes', type: 'Map(String, String)' },
];

function columnMetadata() {
  return {
    async getColumn({ column }) {
      return LOG_COLUMNS.find(item => item.name === column) ?? null;
    },
    async getColumns() {
      return LOG_COLUMNS;
    },
    async getMaterializedColumnsLookupTable() {
      return new Map();
    },
    async getSkipIndices() {
      return [];
    },
    async getSetting() {
      return undefined;
    },
    async getServerVersion() {
      return '24.8.1.1';
    },
    async isClickHouseCloud() {
      return false;
    },
  };
}

async function chQuery(sql) {
  const res = await fetch(`${chUrl}/?user=parity&password=parity`, {
    method: 'POST',
    body: `${sql}\nFORMAT JSONEachRow`,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

async function cbQuery(statement, parameters = {}) {
  const args = {};
  for (const [name, value] of Object.entries(parameters)) {
    args[`$${name}`] = value;
  }
  const res = await fetch(`${cbUrl}/query/service`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from('Administrator:cbt-test-admin').toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ statement, ...args }),
  });
  const body = await res.json();
  if (body.status !== 'success') {
    throw new Error(JSON.stringify(body.errors || body));
  }
  return body.results;
}

function rangeSql() {
  return `Timestamp >= toDateTime64(${span.fromSec}, 9) AND Timestamp < toDateTime64(${span.toSec}, 9)`;
}

async function couchbaseWhere(query) {
  const built = await new CouchbaseSearchBuilder(query, {
    metadata: columnMetadata(),
    tc: {
      connectionId: 'parity',
      databaseName: 'otel',
      scopeName: 'default',
      tableName: 'otel_logs',
    },
    alias: 'd',
  }).build();
  const range = prefixParams(
    timeRangePredicate('d.Timestamp', 'iso8601', from, to).statement,
    timeRangePredicate('d.Timestamp', 'iso8601', from, to).parameters,
    'r',
  );
  const statement = [built.statement, range.statement].filter(Boolean).join(' AND ');
  return { statement, parameters: { ...built.parameters, ...range.parameters } };
}

async function clickhouseWhere(query) {
  const serializer = new CustomSchemaSQLSerializerV2({
    metadata: columnMetadata(),
    databaseName: 'parity',
    tableName: 'otel_logs',
    connectionId: 'parity',
    implicitColumnExpression: 'Body',
  });
  const where = await new SearchQueryBuilder(query, serializer).build();
  return [where, rangeSql()].filter(Boolean).join(' AND ');
}

function prefixParams(statement, parameters, prefix) {
  const names = Object.keys(parameters).sort((a, b) => b.length - a.length);
  let sql = statement;
  const out = {};
  for (const name of names) {
    sql = sql.split(`$${name}`).join(`$${prefix}${name}`);
    out[`${prefix}${name}`] = parameters[name];
  }
  return { statement: sql, parameters: out };
}

function sameSet(left, right) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function fail(name, detail) {
  console.error(`[query-parity] ${name}\n${detail}`);
  process.exitCode = 1;
}

async function lucene() {
  const cases = JSON.parse(
    readFileSync(join(here, 'cases/lucene.json'), 'utf8'),
  );
  for (const query of cases) {
    const chWhere = await clickhouseWhere(query);
    const cbWhere = await couchbaseWhere(query);
    const chRows = await chQuery(
      `SELECT Body AS id FROM parity.otel_logs WHERE ${chWhere}`,
    );
    const cbRows = await cbQuery(
      `SELECT RAW d.Body FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${cbWhere.statement}`,
      cbWhere.parameters,
    );
    const chIds = chRows.map(row => String(row.id));
    const cbIds = cbRows.map(row => String(row));
    if (!sameSet(chIds, cbIds)) {
      fail(
        query,
        `clickhouse ${chIds.length} couchbase ${cbIds.length}\nCH ${chWhere}\nCB ${cbWhere.statement}`,
      );
      return;
    }
  }
  console.error(`[query-parity] ${cases.length} lucene cases matched`);
}

async function functions() {
  const cases = JSON.parse(
    readFileSync(join(here, 'cases/functions.json'), 'utf8'),
  );
  for (const item of cases) {
    if (item.kind === 'count') await compareCount(item);
    else if (item.kind === 'sum') await compareSum(item);
    else if (item.kind === 'quantile') await compareQuantile(item);
    else if (item.kind === 'bucket') await compareBuckets(item);
    else if (item.kind === 'metricSum') await compareMetricSum();
  }
}

async function compareCount(item) {
  const ch = await chQuery(
    `SELECT ${item.group} AS k, count() AS c FROM parity.otel_logs WHERE ${rangeSql()} GROUP BY k ORDER BY k`,
  );
  const cb = await cbQuery(
    `SELECT d.${item.group} AS k, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${timeRangePredicate('d.Timestamp', 'iso8601', from, to).statement} GROUP BY d.${item.group} ORDER BY k`,
    timeRangePredicate('d.Timestamp', 'iso8601', from, to).parameters,
  );
  const left = ch.map(row => `${row.k}:${row.c}`).join(',');
  const right = cb.map(row => `${row.k}:${row.c}`).join(',');
  if (left !== right) fail(item.name, `CH ${left}\nCB ${right}`);
}

async function compareSum(item) {
  const ch = await chQuery(
    `SELECT sum(${item.field}) AS s FROM parity.otel_logs WHERE ${rangeSql()}`,
  );
  const range = timeRangePredicate('d.Timestamp', 'iso8601', from, to);
  const cb = await cbQuery(
    `SELECT RAW SUM(d.${item.field}) FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}`,
    range.parameters,
  );
  if (Number(ch[0]?.s) !== Number(cb[0])) {
    fail(item.name, `CH ${ch[0]?.s} CB ${cb[0]}`);
  }
}

async function compareQuantile(item) {
  const ch = await chQuery(
    `SELECT quantile(${item.p})(${item.field}) AS q FROM parity.otel_logs WHERE ${rangeSql()}`,
  );
  const range = timeRangePredicate('d.Timestamp', 'iso8601', from, to);
  const expr = prefixParams(
    quantile(item.p, `d.${item.field}`).statement,
    quantile(item.p, `d.${item.field}`).parameters,
    'q',
  );
  const cb = await cbQuery(
    `SELECT RAW ${expr.statement} FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}`,
    { ...expr.parameters, ...range.parameters },
  );
  const a = Number(ch[0]?.q);
  const b = Number(cb[0]);
  const scale = Math.max(Math.abs(a), 1);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) / scale > 0.01) {
    fail(item.name, `CH ${a} CB ${b}`);
  }
}

async function compareBuckets(item) {
  const ch = await chQuery(
    `SELECT toUnixTimestamp(toStartOfHour(Timestamp)) * 1000 AS b, count() AS c FROM parity.otel_logs WHERE ${rangeSql()} GROUP BY b ORDER BY b`,
  );
  const bucket = prefixParams(
    timeBucketExpr('d.Timestamp', 'iso8601', parseGranularity(item.granularity))
      .statement,
    timeBucketExpr('d.Timestamp', 'iso8601', parseGranularity(item.granularity))
      .parameters,
    'b',
  );
  const range = timeRangePredicate('d.Timestamp', 'iso8601', from, to);
  const cb = await cbQuery(
    `SELECT STR_TO_MILLIS(${bucket.statement}) AS b, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement} GROUP BY STR_TO_MILLIS(${bucket.statement}) ORDER BY b`,
    { ...bucket.parameters, ...range.parameters },
  );
  if (ch.length !== cb.length) {
    fail(item.name, `buckets CH ${ch.length} CB ${cb.length}`);
    return;
  }
  for (let i = 0; i < ch.length; i++) {
    const left = ch[i];
    const right = cb[i];
    if (Number(left.c) !== Number(right.c) || Math.abs(Number(left.b) - Number(right.b)) > 1) {
      fail(item.name, `CH ${JSON.stringify(left)} CB ${JSON.stringify(right)}`);
      return;
    }
  }
}

async function compareMetricSum() {
  const ch = await chQuery(
    'SELECT sum(Value) AS s FROM parity.otel_metrics_gauge WHERE MetricName = \'parity.gauge\'',
  );
  const cb = await cbQuery(
    'SELECT RAW SUM(d.`Value`) FROM `otel`.`default`.`otel_metrics_gauge` AS d WHERE d.MetricName = \'parity.gauge\'',
  );
  if (Number(ch[0]?.s) !== Number(cb[0])) {
    fail('gauge sum', `CH ${ch[0]?.s} CB ${cb[0]}`);
  }
}

async function compareMetadata() {
  const chKeys = await chQuery(
    `SELECT DISTINCT arrayJoin(mapKeys(LogAttributes)) AS k FROM parity.otel_logs WHERE ${rangeSql()} ORDER BY k`,
  );
  const range = timeRangePredicate('d.Timestamp', 'iso8601', from, to);
  const cbKeys = await cbQuery(
    `SELECT DISTINCT RAW k FROM (SELECT d.LogAttributes AS m FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}) AS s UNNEST OBJECT_NAMES(s.m) AS k ORDER BY k`,
    range.parameters,
  );
  if (!sameSet(chKeys.map(row => row.k), cbKeys.map(String))) {
    fail('map keys', `CH ${chKeys.map(row => row.k)} CB ${cbKeys}`);
  }
  const chTop = await chQuery(
    `SELECT ServiceName AS k, count() AS c FROM parity.otel_logs WHERE ${rangeSql()} GROUP BY k ORDER BY c DESC, k`,
  );
  const cbTop = await cbQuery(
    `SELECT d.ServiceName AS k, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement} GROUP BY d.ServiceName ORDER BY c DESC, k`,
    range.parameters,
  );
  const left = chTop.map(row => `${row.k}:${row.c}`).join(',');
  const right = cbTop.map(row => `${row.k}:${row.c}`).join(',');
  if (left !== right) fail('top values', `CH ${left}\nCB ${right}`);
}

await lucene();
if (process.exitCode) process.exit(process.exitCode);
await functions();
if (process.exitCode) process.exit(process.exitCode);
await compareMetadata();
if (process.exitCode) process.exit(process.exitCode);
console.error('[query-parity] functions and metadata matched');
