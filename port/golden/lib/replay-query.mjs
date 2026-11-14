#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listGoldenCaseIds, readGoldenFile, slugCaseId } from './golden-io.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const queryParity = join(root, 'port/query-parity');
const dist = join(root, 'packages/common-utils/dist');
const { CouchbaseSearchBuilder } = require(join(dist, 'couchbase/serializer.js'));
const { parseGranularity, timeBucketExpr, timeRangePredicate } = require(
  join(dist, 'couchbase/time.js'),
);
const { quantile } = require(join(dist, 'couchbase/fn/quantile.js'));

const cbUrl = process.env.CB_URL;
const goldenDir = process.env.GOLDEN_DIR;
if (!cbUrl || !goldenDir) {
  console.error('[replay-query] set CB_URL and GOLDEN_DIR');
  process.exit(1);
}

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
  if (body.status !== 'success') throw new Error(JSON.stringify(body.errors || body));
  return body.results;
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

/** @type {string[]} */
const errors = [];

const functionCases = JSON.parse(
  readFileSync(join(queryParity, 'cases/functions.json'), 'utf8'),
);
const range = timeRangePredicate('d.Timestamp', 'iso8601', from, to);

for (const caseId of listGoldenCaseIds(join(goldenDir, 'functions'))) {
  const golden = readGoldenFile(join(goldenDir, 'functions'), caseId);
  let actual;
  if (caseId === 'metadata-map-keys') {
    actual = {
      keys: (
        await cbQuery(
          `SELECT DISTINCT RAW k FROM (SELECT d.LogAttributes AS m FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}) AS s UNNEST OBJECT_NAMES(s.m) AS k ORDER BY k`,
          range.parameters,
        )
      ).map(String),
    };
  } else if (caseId === 'metadata-top-values') {
    actual = {
      rows: await cbQuery(
        `SELECT d.ServiceName AS k, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement} GROUP BY d.ServiceName ORDER BY c DESC, k`,
        range.parameters,
      ),
    };
  } else {
    const item = functionCases.find(
      f => slugCaseId(f.name) === caseId,
    );
    if (!item) continue;
    if (item.kind === 'count') {
      actual = {
        rows: await cbQuery(
          `SELECT d.${item.group} AS k, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement} GROUP BY d.${item.group} ORDER BY k`,
          range.parameters,
        ),
      };
    } else if (item.kind === 'sum') {
      actual = {
        value: Number(
          (
            await cbQuery(
              `SELECT RAW SUM(d.${item.field}) FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}`,
              range.parameters,
            )
          )[0],
        ),
      };
    } else if (item.kind === 'quantile') {
      const expr = prefixParams(
        quantile(item.p, `d.${item.field}`).statement,
        quantile(item.p, `d.${item.field}`).parameters,
        'q',
      );
      actual = {
        value: Number(
          (
            await cbQuery(
              `SELECT RAW ${expr.statement} FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}`,
              { ...expr.parameters, ...range.parameters },
            )
          )[0],
        ),
      };
    } else if (item.kind === 'bucket') {
      const bucket = prefixParams(
        timeBucketExpr('d.Timestamp', 'iso8601', parseGranularity(item.granularity))
          .statement,
        timeBucketExpr('d.Timestamp', 'iso8601', parseGranularity(item.granularity))
          .parameters,
        'b',
      );
      actual = {
        rows: await cbQuery(
          `SELECT STR_TO_MILLIS(${bucket.statement}) AS b, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement} GROUP BY STR_TO_MILLIS(${bucket.statement}) ORDER BY b`,
          { ...bucket.parameters, ...range.parameters },
        ),
      };
    } else if (item.kind === 'metricSum') {
      actual = {
        value: Number(
          (
            await cbQuery(
              "SELECT RAW SUM(d.`Value`) FROM `otel`.`default`.`otel_metrics_gauge` AS d WHERE d.MetricName = 'parity.gauge'",
            )
          )[0],
        ),
      };
    }
  }
  if (actual && JSON.stringify(golden.result) !== JSON.stringify(actual)) {
    errors.push(
      `functions ${caseId}: mismatch expected=${JSON.stringify(golden.result)} actual=${JSON.stringify(actual)}`,
    );
  }
}

const luceneQueries = JSON.parse(
  readFileSync(join(queryParity, 'cases/lucene.json'), 'utf8'),
);
for (const query of luceneQueries) {
  const caseId = slugCaseId(query);
  const path = join(goldenDir, 'lucene', `${caseId}.json`);
  if (!existsSync(path)) continue;
  const golden = JSON.parse(readFileSync(path, 'utf8'));
  const where = await couchbaseWhere(query);
  const ids = (
    await cbQuery(
      `SELECT RAW d.Body FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${where.statement}`,
      where.parameters,
    )
  )
    .map(String)
    .sort();
  if (JSON.stringify(golden.result.ids) !== JSON.stringify(ids)) {
    const missing = golden.result.ids.filter(id => !ids.includes(id));
    const extra = ids.filter(id => !golden.result.ids.includes(id));
    errors.push(
      `lucene ${caseId}: id set mismatch expected=${golden.result.ids.length} actual=${ids.length} missing=${missing.slice(0, 5).join(',')} extra=${extra.slice(0, 5).join(',')}`,
    );
  }
}

if (errors.length) {
  for (const line of errors) console.error(`[replay-query] ${line}`);
  process.exit(1);
}
console.error('[replay-query] ok');
