#!/usr/bin/env node
/**
 * Capture Couchbase-side query parity results (lucene + functions + metadata).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorTime } from './anchor.mjs';
import { defaultCompareRules, slugCaseId, writeGoldenFile } from './golden-io.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const queryParity = join(root, 'port/query-parity');
const dist = join(root, 'packages/common-utils/dist');
const { CustomSchemaSQLSerializerV2, SearchQueryBuilder } = require(
  join(dist, 'queryParser.js'),
);
const { CouchbaseSearchBuilder } = require(join(dist, 'couchbase/serializer.js'));
const { parseGranularity, timeBucketExpr, timeRangePredicate } = require(
  join(dist, 'couchbase/time.js'),
);
const { quantile } = require(join(dist, 'couchbase/fn/quantile.js'));

const cbUrl = process.env.CB_URL;
const outDir = process.env.GOLDEN_CAPTURE_DIR;
const anchorMs = Number(process.env.GOLDEN_ANCHOR_MS || anchorTime().getTime());
if (!cbUrl || !outDir) {
  console.error('[capture-query] set CB_URL and GOLDEN_CAPTURE_DIR');
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
  if (body.status !== 'success') {
    throw new Error(JSON.stringify(body.errors || body));
  }
  return body.results;
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

function writeSuiteGolden(suite, caseId, result, compare = defaultCompareRules()) {
  writeGoldenFile(
    join(outDir, suite),
    {
      schemaVersion: 1,
      suite,
      caseId,
      datasetSeed: 0,
      anchorSensitive: false,
      compare,
      result,
    },
    anchorMs,
  );
}

const luceneCases = JSON.parse(
  readFileSync(join(queryParity, 'cases/lucene.json'), 'utf8'),
);
for (const query of luceneCases) {
  const where = await couchbaseWhere(query);
  const rows = await cbQuery(
    `SELECT RAW d.Body FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${where.statement}`,
    where.parameters,
  );
  const ids = rows.map(String).sort();
  const caseId = slugCaseId(query) || 'lucene-query';
  writeSuiteGolden('lucene', caseId, { ids });
  console.error(`[capture-query] lucene ${caseId} (${ids.length} ids)`);
}

const functionCases = JSON.parse(
  readFileSync(join(queryParity, 'cases/functions.json'), 'utf8'),
);
for (const item of functionCases) {
  let result;
  const range = timeRangePredicate('d.Timestamp', 'iso8601', from, to);
  if (item.kind === 'count') {
    const rows = await cbQuery(
      `SELECT d.${item.group} AS k, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement} GROUP BY d.${item.group} ORDER BY k`,
      range.parameters,
    );
    result = { rows };
  } else if (item.kind === 'sum') {
    const value = await cbQuery(
      `SELECT RAW SUM(d.${item.field}) FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}`,
      range.parameters,
    );
    result = { value: Number(value[0]) };
  } else if (item.kind === 'quantile') {
    const expr = prefixParams(
      quantile(item.p, `d.${item.field}`).statement,
      quantile(item.p, `d.${item.field}`).parameters,
      'q',
    );
    const value = await cbQuery(
      `SELECT RAW ${expr.statement} FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}`,
      { ...expr.parameters, ...range.parameters },
    );
    result = { value: Number(value[0]) };
  } else if (item.kind === 'bucket') {
    const bucket = prefixParams(
      timeBucketExpr('d.Timestamp', 'iso8601', parseGranularity(item.granularity))
        .statement,
      timeBucketExpr('d.Timestamp', 'iso8601', parseGranularity(item.granularity))
        .parameters,
      'b',
    );
    const rows = await cbQuery(
      `SELECT STR_TO_MILLIS(${bucket.statement}) AS b, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement} GROUP BY STR_TO_MILLIS(${bucket.statement}) ORDER BY b`,
      { ...bucket.parameters, ...range.parameters },
    );
    result = { rows };
  } else if (item.kind === 'metricSum') {
    const value = await cbQuery(
      "SELECT RAW SUM(d.`Value`) FROM `otel`.`default`.`otel_metrics_gauge` AS d WHERE d.MetricName = 'parity.gauge'",
    );
    result = { value: Number(value[0]) };
  } else {
    continue;
  }
  const caseId = slugCaseId(item.name);
  writeSuiteGolden('functions', caseId, result, {
    ordered: item.kind === 'count' || item.kind === 'bucket',
    numericTolerance: item.kind === 'quantile' ? 0.01 : 1e-9,
    ignoreColumns: [],
  });
  console.error(`[capture-query] functions ${caseId}`);
}

const range = timeRangePredicate('d.Timestamp', 'iso8601', from, to);
const mapKeys = await cbQuery(
  `SELECT DISTINCT RAW k FROM (SELECT d.LogAttributes AS m FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement}) AS s UNNEST OBJECT_NAMES(s.m) AS k ORDER BY k`,
  range.parameters,
);
writeSuiteGolden('functions', 'metadata-map-keys', {
  keys: mapKeys.map(String),
});

const topRows = await cbQuery(
  `SELECT d.ServiceName AS k, COUNT(*) AS c FROM \`otel\`.\`default\`.\`otel_logs\` AS d WHERE ${range.statement} GROUP BY d.ServiceName ORDER BY c DESC, k`,
  range.parameters,
);
writeSuiteGolden('functions', 'metadata-top-values', { rows: topRows }, {
  ordered: true,
  numericTolerance: 1e-9,
  ignoreColumns: [],
});

console.error('[capture-query] done');
