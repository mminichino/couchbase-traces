#!/usr/bin/env node
/**
 * Compares chart query results between ClickHouse and Couchbase parity sources.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const dist = join(root, 'packages/common-utils/dist');

const { parameterizedQueryToSql } = require(join(dist, 'clickhouse/index.js'));
const { renderChartConfigCouchbase } = require(join(dist, 'couchbase/render/index.js'));
const { couchbaseResultColumnNames } = require(join(
  dist,
  'couchbase/render/postprocess.js',
));
const { renderChartConfig: renderClickhouseChart } = require(
  join(dist, 'core/renderChartConfig.js'),
);
const { primeConnectionKind } = require(join(dist, 'dataLayer/kind.js'));
const {
  COUCHBASE_LOG_SOURCE,
  COUCHBASE_TRACE_SOURCE,
  COUCHBASE_METRIC_SOURCE,
  COUCHBASE_SESSION_SOURCE,
} = require(join(dist, 'couchbase/defaultSources.js'));

const renderOnly = process.argv.includes('--render-only');
const divergences = JSON.parse(
  readFileSync(join(here, 'divergences.json'), 'utf8'),
);
const chUrl = process.env.CH_URL;
const cbUrl = process.env.CB_URL ?? process.env.COUCHBASE_URL;
if (!renderOnly && (!chUrl || !cbUrl)) {
  console.error(
    '[compare-charts] set CH_URL and CB_URL (or use --render-only)',
  );
  process.exit(1);
}
const positional = process.argv
  .slice(2)
  .filter(a => a !== '--render-only');
const slice = process.env.PARITY_SLICE ?? positional[0] ?? 'search';
const caseDir = join(here, 'cases/charts', slice);

const LOG_COLUMNS = [
  { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
  { name: 'ServiceName', type: 'LowCardinality(String)' },
  { name: 'SeverityText', type: 'LowCardinality(String)' },
  { name: 'SeverityNumber', type: 'UInt8' },
  { name: 'Body', type: 'String' },
  { name: 'LogAttributes', type: 'Map(String, String)' },
  { name: 'ResourceAttributes', type: 'Map(String, String)' },
  { name: 'TraceId', type: 'String' },
  { name: 'SpanId', type: 'String' },
];

const TRACE_COLUMNS = [
  { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
  { name: 'ServiceName', type: 'LowCardinality(String)' },
  { name: 'SpanName', type: 'LowCardinality(String)' },
  { name: 'StatusCode', type: 'LowCardinality(String)' },
  { name: 'Duration', type: 'UInt64' },
  { name: 'TraceId', type: 'String' },
  { name: 'SpanId', type: 'String' },
  { name: 'ParentSpanId', type: 'String' },
  { name: 'SpanAttributes', type: 'Map(String, String)' },
  { name: 'ResourceAttributes', type: 'Map(String, String)' },
];

const METRIC_COLUMNS = [
  { name: 'TimeUnix', type: "DateTime64(9, 'UTC')" },
  { name: 'MetricName', type: 'LowCardinality(String)' },
  { name: 'Value', type: 'Float64' },
  { name: 'ServiceName', type: 'LowCardinality(String)' },
  { name: 'Attributes', type: 'Map(String, String)' },
  { name: 'ResourceAttributes', type: 'Map(String, String)' },
];

const SESSION_COLUMNS = [
  { name: 'TimestampTime', type: "DateTime64(9, 'UTC')" },
  { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
  { name: 'ServiceName', type: 'LowCardinality(String)' },
  { name: 'Body', type: 'String' },
  { name: 'LogAttributes', type: 'Map(String, String)' },
  { name: 'ResourceAttributes', type: 'Map(String, String)' },
  {
    name: '__hdx_materialized_session.id',
    type: 'String',
  },
  {
    name: '__hdx_materialized_rum.sessionId',
    type: 'String',
  },
];

function metadata(sourceKind = 'logs') {
  const columns =
    sourceKind === 'traces'
      ? TRACE_COLUMNS
      : sourceKind?.startsWith('metrics_')
        ? METRIC_COLUMNS
        : sourceKind === 'sessions'
          ? SESSION_COLUMNS
          : LOG_COLUMNS;
  return {
    async getTableMetadata() {
      return { columns, engine: 'MergeTree' };
    },
    async getColumn({ column }) {
      return columns.find(item => item.name === column) ?? null;
    },
    async getColumns() {
      return columns;
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

const SOURCE_BY_KIND = {
  logs: COUCHBASE_LOG_SOURCE,
  traces: COUCHBASE_TRACE_SOURCE,
  metrics_gauge: COUCHBASE_METRIC_SOURCE,
  metrics_sum: COUCHBASE_METRIC_SOURCE,
  metrics_histogram: COUCHBASE_METRIC_SOURCE,
  metrics_exponential_histogram: COUCHBASE_METRIC_SOURCE,
  metrics_summary: COUCHBASE_METRIC_SOURCE,
  sessions: COUCHBASE_SESSION_SOURCE,
};

function resolveDateRange(config) {
  // Only apply a time window when the case asks for one. CTE outer queries that
  // select from a WITH alias must not inherit PARITY_WINDOW Timestamp filters.
  if (!config.dateRange) return undefined;
  if (process.env.PARITY_WINDOW) {
    const win = JSON.parse(process.env.PARITY_WINDOW);
    if (win.fromSec != null && win.toSec != null) {
      return [new Date(win.fromSec * 1000), new Date(win.toSec * 1000)];
    }
  }
  const now = Date.now();
  const { fromMinutesAgo = 60, toMinutesAgo = 0 } = config.dateRange;
  return [
    new Date(now - fromMinutesAgo * 60_000),
    new Date(now - toMinutesAgo * 60_000),
  ];
}

function buildChartConfig(caseFile, connectionId) {
  const template = SOURCE_BY_KIND[caseFile.source] ?? COUCHBASE_LOG_SOURCE;
  const from = { ...template.from };
  if (connectionId === 'parity-ch') {
    from.databaseName = 'parity';
    delete from.scopeName;
  }
  if (caseFile.source?.startsWith('metrics_') && template.metricTables) {
    const kind = caseFile.source.slice('metrics_'.length).replace(/_/g, ' ');
    from.tableName =
      template.metricTables[kind] ??
      template.metricTables.gauge ??
      from.tableName;
  }
  if (template.metricTables && !from.tableName) {
    from.tableName = template.metricTables.gauge;
  }
  const { dateRange: _dr, from: configFrom, ...rest } = caseFile.config;
  // CTE outer queries may select from a CTE name (empty databaseName).
  const resolvedFrom =
    configFrom &&
    (configFrom.databaseName == null || configFrom.databaseName === '')
      ? { ...configFrom }
      : from;
  // Parity ClickHouse hyperdx_sessions (compat schema) only has Timestamp;
  // Couchbase session docs keep TimestampTime as in defaultSources.
  const timestampValueExpression =
    caseFile.config.timestampValueExpression ??
    (caseFile.source === 'sessions' && connectionId === 'parity-ch'
      ? 'Timestamp'
      : template.timestampValueExpression);
  const base = {
    ...rest,
    connection: connectionId,
    from: resolvedFrom,
    timestampValueExpression,
    timestampFormat: template.timestampFormat,
    implicitColumnExpression: template.implicitColumnExpression,
    bodyExpression: template.bodyExpression,
    searchIndexName: template.searchIndexName,
    dateRange: resolveDateRange(caseFile.config),
    source: caseFile.source === 'traces' ? 'trace' : 'log',
  };
  if (Array.isArray(base.with)) {
    base.with = base.with.map(clause => {
      if (!clause?.chartConfig) return clause;
      const nested = buildChartConfig(
        { ...caseFile, config: clause.chartConfig },
        connectionId,
      );
      // CteChartConfigSchema requires where/whereLanguage; strip parity-only fields.
      const {
        searchIndexName: _s,
        timestampFormat: _tf,
        implicitColumnExpression: _i,
        bodyExpression: _b,
        source: _src,
        ...cteConfig
      } = nested;
      if (cteConfig.where == null) cteConfig.where = '';
      if (cteConfig.whereLanguage == null) cteConfig.whereLanguage = 'sql';
      return { ...clause, chartConfig: cteConfig };
    });
  }
  if (rest.configType === 'sql') {
    // Raw SQL charts still need from for $__sourceTable expansion.
    return base;
  }
  return base;
}

let cases = [];
try {
  cases = readdirSync(caseDir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(caseDir, f), 'utf8')));
} catch (err) {
  console.error(`[compare-charts] no cases in ${caseDir}: ${err}`);
  process.exit(1);
}

if (cases.length === 0) {
  console.error(`[compare-charts] zero cases for slice ${slice}`);
  process.exit(1);
}

function dropIgnored(row, ignore = []) {
  const copy = { ...row };
  for (const col of ignore) delete copy[col];
  return copy;
}

function toEpochMs(value) {
  if (value == null) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const parsed = Date.parse(value.replace(' ', 'T') + (value.includes('Z') || value.includes('+') ? '' : 'Z'));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return value;
}

function normalizeCell(key, value, defaultsEqual = []) {
  if (value === '' && defaultsEqual.includes(key)) return null;
  if (value === 0 && defaultsEqual.includes(key)) return null;
  if (key === '__hdx_time_bucket' || /time|timestamp|date/i.test(key)) {
    return toEpochMs(value);
  }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

function ratioColumnAlias(caseFile) {
  const select = caseFile?.config?.select;
  if (!Array.isArray(select) || caseFile?.config?.seriesReturnType !== 'ratio') {
    return null;
  }
  return select[0]?.alias?.trim() || select[1]?.alias?.trim() || 'ratio';
}

function normalizeRatioKeys(row, ratioAlias) {
  if (!ratioAlias) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('divide(')) {
      out[ratioAlias] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function normalizeRow(row, ignore, defaultsEqual) {
  const out = {};
  for (const [key, value] of Object.entries(dropIgnored(row, ignore))) {
    if (key.startsWith('__hdx_materialized_') || key === '__cbt_id') continue;
    out[key] = normalizeCell(key, value, defaultsEqual);
  }
  return out;
}

function rowsEqual(a, b, tolerance = 1e-9) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (left == null && right == null) continue;
    if (typeof left === 'number' && typeof right === 'number') {
      if (left === right) continue;
      const denom = Math.max(Math.abs(left), Math.abs(right), 1);
      if (Math.abs(left - right) / denom <= tolerance) continue;
      return false;
    }
    if (left !== right) return false;
  }
  return true;
}

async function chQuery(sql, params = {}) {
  if (!chUrl) throw new Error('CH_URL not set');
  const query =
    Object.keys(params).length > 0
      ? parameterizedQueryToSql({ sql, params })
      : sql;
  const res = await fetch(`${chUrl}/?user=parity&password=parity`, {
    method: 'POST',
    body: `${query}\nFORMAT JSONEachRow`,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function normalizeCouchbaseRows(rows, columnNames) {
  if (!columnNames.length) return rows;
  return rows.map(row => {
    const keys = Object.keys(row);
    if (keys.length !== columnNames.length) return row;
    return Object.fromEntries(
      columnNames.map((name, i) => [name, row[keys[i]]]),
    );
  });
}

async function cbQuery(statement, parameters = {}) {
  if (!cbUrl) throw new Error('CB_URL not set');
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

async function runCase(caseFile) {
  const meta = metadata(caseFile.source);
  primeConnectionKind('parity-cb', 'couchbase');
  const cbConfig = buildChartConfig(caseFile, 'parity-cb');
  const expectCbError = caseFile.compare?.expectCouchbaseError;
  let cbRendered;
  try {
    cbRendered = await renderChartConfigCouchbase(
      cbConfig,
      meta,
      undefined,
    );
  } catch (err) {
    if (
      expectCbError &&
      String(err?.message ?? err).includes(String(expectCbError))
    ) {
      return {
        id: caseFile.id,
        mode: renderOnly ? 'render-only' : 'expect-error',
        ok: true,
        expectedError: true,
      };
    }
    throw err;
  }
  if (expectCbError) {
    throw new Error(
      `Case ${caseFile.id}: expected Couchbase error matching "${expectCbError}" but render succeeded`,
    );
  }

  if (renderOnly) {
    const sql = cbRendered.sql ?? '';
    if (!sql.includes('SELECT') || !sql.includes('FROM')) {
      throw new Error(`Case ${caseFile.id}: invalid SQL++ shape`);
    }
    return { id: caseFile.id, mode: 'render-only', ok: true };
  }

  primeConnectionKind('parity-ch', 'clickhouse');
  const chConfig = buildChartConfig(caseFile, 'parity-ch');
  // ClickHouse parity tables live under the `parity` database without a scope.
  // Keep empty databaseName for CTE aliases (FROM base_counts, not parity.base_counts).
  if (chConfig.from?.databaseName) {
    chConfig.from = {
      databaseName: 'parity',
      tableName: chConfig.from.tableName,
    };
  }
  const chRendered = await renderClickhouseChart(chConfig, meta, undefined);

  const ignore = caseFile.compare?.ignoreColumns ?? [];
  const defaultsEqual = caseFile.compare?.defaultsEqual ?? [];
  const tolerance = caseFile.compare?.numericTolerance ?? 1e-9;
  const chRows = await chQuery(chRendered.sql, chRendered.params ?? {});
  const cbColumnNames = couchbaseResultColumnNames(cbConfig);
  const cbRows = normalizeCouchbaseRows(
    await cbQuery(cbRendered.sql, cbRendered.params ?? {}),
    cbColumnNames,
  );
  const allowed = divergences.some(d => d.caseId === caseFile.id);
  if (chRows.length !== cbRows.length) {
    if (allowed) {
      return { id: caseFile.id, ok: true, divergence: 'row_count' };
    }
    throw new Error(
      `Case ${caseFile.id}: row count ${chRows.length} vs ${cbRows.length}`,
    );
  }
  const ordered = caseFile.compare?.ordered === true;
  const sortKeys = (a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b));
  const ratioAlias = ratioColumnAlias(caseFile);
  const chNorm = chRows
    .map(r => normalizeRatioKeys(r, ratioAlias))
    .map(r => normalizeRow(r, ignore, defaultsEqual));
  const cbNorm = cbRows.map(r => normalizeRow(r, ignore, defaultsEqual));
  if (!ordered) {
    chNorm.sort(sortKeys);
    cbNorm.sort(sortKeys);
  }
  for (let i = 0; i < chNorm.length; i++) {
    if (!rowsEqual(chNorm[i], cbNorm[i], tolerance)) {
      if (allowed) return { id: caseFile.id, ok: true, divergence: 'values' };
      throw new Error(
        `Case ${caseFile.id}: row ${i} differs ch=${JSON.stringify(chNorm[i])} cb=${JSON.stringify(cbNorm[i])}`,
      );
    }
  }
  return { id: caseFile.id, ok: true };
}

const results = [];
for (const caseFile of cases) {
  console.error(`[compare-charts] case ${caseFile.id}`);
  try {
    results.push(await runCase(caseFile));
  } catch (err) {
    console.error(`[compare-charts] FAILED ${caseFile.id}: ${err.message}`);
    throw err;
  }
}

console.log(JSON.stringify({ slice, cases: cases.length, results, ok: true }));
process.exit(0);
