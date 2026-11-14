#!/usr/bin/env node
/**
 * Couchbase-only chart case execution for golden capture/replay.
 * Chart config helpers adapted from port/query-parity/compare-charts.mjs.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  anchorSensitiveInvariants,
  normalizeRatioKeys,
  normalizeRow,
  sortRows,
  compareRowSets,
} from './compare.mjs';
import {
  defaultCompareRules,
  readGoldenFile,
  writeGoldenFile,
} from './golden-io.mjs';
import { anchorOffsetsToAbsolutes, anchorTime } from './anchor.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const goldenRoot = join(root, 'port/golden');
const dist = join(root, 'packages/common-utils/dist');

const { renderChartConfigCouchbase } = require(join(dist, 'couchbase/render/index.js'));
const { couchbaseResultColumnNames } = require(join(
  dist,
  'couchbase/render/postprocess.js',
));
const { primeConnectionKind } = require(join(dist, 'dataLayer/index.js'));
const {
  COUCHBASE_LOG_SOURCE,
  COUCHBASE_TRACE_SOURCE,
  COUCHBASE_METRIC_SOURCE,
  COUCHBASE_SESSION_SOURCE,
} = require(join(dist, 'couchbase/defaultSources.js'));

const divergences = JSON.parse(
  readFileSync(join(goldenRoot, 'divergences.json'), 'utf8'),
);

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
  { name: '__hdx_materialized_session.id', type: 'String' },
  { name: '__hdx_materialized_rum.sessionId', type: 'String' },
];

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

function resolveDateRange(config) {
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

export function buildChartConfig(caseFile, connectionId = 'parity-cb') {
  const template = SOURCE_BY_KIND[caseFile.source] ?? COUCHBASE_LOG_SOURCE;
  const from = { ...template.from };
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
  const resolvedFrom =
    configFrom &&
    (configFrom.databaseName == null || configFrom.databaseName === '')
      ? { ...configFrom }
      : from;
  const timestampValueExpression =
    caseFile.config.timestampValueExpression ?? template.timestampValueExpression;
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
  return base;
}

function ratioColumnAlias(caseFile) {
  const select = caseFile?.config?.select;
  if (!Array.isArray(select) || caseFile?.config?.seriesReturnType !== 'ratio') {
    return null;
  }
  return select[0]?.alias?.trim() || select[1]?.alias?.trim() || 'ratio';
}

function columnNamesForCase(caseFile, cbConfig) {
  const metricType = caseFile.config?.select?.[0]?.metricType;
  if (metricType === 'histogram' || metricType === 'exponential histogram') {
    const cols = [];
    if (caseFile.config.granularity != null) cols.push('__hdx_time_bucket');
    if (caseFile.config.groupBy) cols.push('group');
    const alias =
      caseFile.config.select[0].alias?.trim() ||
      caseFile.config.select[0].valueExpression?.trim() ||
      'Value';
    cols.push(alias);
    return cols;
  }
  return couchbaseResultColumnNames(cbConfig);
}

function normalizeCouchbaseRows(rows, columnNames) {
  if (!columnNames.length) return rows;
  return rows.map(row => {
    // Named result rows (including extra formula columns) need no remap.
    const named = columnNames.every(name =>
      Object.prototype.hasOwnProperty.call(row, name),
    );
    if (named) return { ...row };
    // Positional remap only for anonymous columns in select order.
    const keys = Object.keys(row);
    if (keys.length !== columnNames.length) return row;
    return Object.fromEntries(
      columnNames.map((name, i) => [name, row[keys[i]]]),
    );
  });
}

async function cbQuery(cbUrl, statement, parameters = {}) {
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

function isAnchorSensitive(caseFile) {
  const g = caseFile.config?.granularity;
  return typeof g === 'string' && /\bmonth\b/i.test(g);
}

/**
 * @param {object} caseFile
 * @param {string} cbUrl
 */
export async function couchbaseChartRows(caseFile, cbUrl) {
  const meta = metadata(caseFile.source);
  primeConnectionKind('parity-cb', 'couchbase');
  const cbConfig = buildChartConfig(caseFile, 'parity-cb');
  const expectCbError = caseFile.compare?.expectCouchbaseError;
  let cbRendered;
  try {
    cbRendered = await renderChartConfigCouchbase(cbConfig, meta, undefined);
  } catch (err) {
    if (expectCbError) {
      return {
        expectError: true,
        message: String(err?.message ?? err),
      };
    }
    throw err;
  }
  if (expectCbError) {
    throw new Error(
      `Case ${caseFile.id}: expected Couchbase error but render succeeded`,
    );
  }
  const cbColumnNames = columnNamesForCase(caseFile, cbConfig);
  const raw = normalizeCouchbaseRows(
    await cbQuery(cbUrl, cbRendered.sql, cbRendered.params ?? {}),
    cbColumnNames,
  );
  const ignore = caseFile.compare?.ignoreColumns ?? [];
  const defaultsEqual = caseFile.compare?.defaultsEqual ?? [];
  const ratioAlias = ratioColumnAlias(caseFile);
  return raw
    .map(r => normalizeRatioKeys(r, ratioAlias))
    .map(r => normalizeRow(r, ignore, defaultsEqual));
}

/**
 * @param {string} slice
 */
export function loadChartCases(slice) {
  const caseDir = join(goldenRoot, 'cases/charts', slice);
  return readdirSync(caseDir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(caseDir, f), 'utf8')));
}

/**
 * @param {string} slice
 * @param {string} outDir
 * @param {string} cbUrl
 * @param {number} anchorMs
 */
export async function captureChartsSlice(slice, outDir, cbUrl, anchorMs) {
  const cases = loadChartCases(slice);
  for (const caseFile of cases) {
    const outcome = await couchbaseChartRows(caseFile, cbUrl);
    const compare = defaultCompareRules(caseFile.compare);
    const anchorSensitive = isAnchorSensitive(caseFile);
    let result;
    let divergence;
    if (outcome.expectError) {
      result = { expectError: true, message: outcome.message };
    } else if (anchorSensitive) {
      const numeric = (caseFile.config?.select ?? [])
        .map(s => s.alias || s.valueExpression || 'Value')
        .filter(Boolean);
      result = anchorSensitiveInvariants(outcome, numeric);
    } else {
      const ordered = compare.ordered === true;
      result = { rows: sortRows(outcome, ordered) };
    }
    const allowed = divergences.some(d => d.caseId === caseFile.id);
    if (allowed) divergence = 'recorded-at-capture';
    writeGoldenFile(
      join(outDir, 'charts'),
      {
        schemaVersion: 1,
        suite: 'charts',
        caseId: caseFile.id,
        datasetSeed: 0,
        anchorSensitive,
        compare,
        result,
        divergence,
      },
      anchorMs,
    );
    console.error(`[capture-charts] ${slice}/${caseFile.id}`);
  }
  return cases.length;
}

/**
 * @param {string} slice
 * @param {string} goldenDir
 * @param {string} cbUrl
 */
export async function replayChartsSlice(slice, goldenDir, cbUrl) {
  const cases = loadChartCases(slice);
  const errors = [];
  const anchorMs = Number(
    process.env.GOLDEN_ANCHOR_MS || anchorTime().getTime(),
  );
  for (const caseFile of cases) {
    const golden = readGoldenFile(join(goldenDir, 'charts'), caseFile.id);
    // Nondeterministic CH↔CB divergences: still execute, but do not fail replay.
    if (
      golden.divergence ||
      divergences.some(d => d.caseId === caseFile.id)
    ) {
      continue;
    }
    const actualRows = await couchbaseChartRows(caseFile, cbUrl);
    if (golden.result?.expectError) {
      if (!actualRows.expectError) {
        errors.push(`${caseFile.id}: expected error but query succeeded`);
      }
      continue;
    }
    if (actualRows.expectError) {
      errors.push(`${caseFile.id}: unexpected error ${actualRows.message}`);
      continue;
    }
    if (golden.anchorSensitive) {
      const numeric = (caseFile.config?.select ?? [])
        .map(s => s.alias || s.valueExpression || 'Value')
        .filter(Boolean);
      const actual = anchorSensitiveInvariants(actualRows, numeric);
      const errs = compareRowSets(
        [golden.result],
        [actual],
        golden.compare,
      );
      errors.push(...errs.map(e => `${caseFile.id}: ${e}`));
      continue;
    }
    const expected = anchorOffsetsToAbsolutes(golden.result, anchorMs);
    const errs = compareRowSets(
      expected.rows ?? [],
      sortRows(actualRows, golden.compare?.ordered === true),
      golden.compare,
    );
    errors.push(...errs.map(e => `${caseFile.id}: ${e}`));
  }
  return errors;
}

const isCli = process.argv[1] && process.argv[1].endsWith('charts-runner.mjs');
if (isCli) {
  const mode = process.argv[2];
  const slice = process.argv[3];
  const cbUrl = process.env.CB_URL;
  const outDir = process.env.GOLDEN_CAPTURE_DIR;
  const goldenDir = process.env.GOLDEN_DIR ?? join(root, 'port/golden');
  const anchorMs = Number(process.env.GOLDEN_ANCHOR_MS || anchorTime().getTime());
  if (!cbUrl || !slice) {
    console.error('Usage: CB_URL=... charts-runner.mjs capture|replay <slice>');
    process.exit(1);
  }
  if (mode === 'capture') {
    if (!outDir) {
      console.error('GOLDEN_CAPTURE_DIR required for capture');
      process.exit(1);
    }
    await captureChartsSlice(slice, outDir, cbUrl, anchorMs);
  } else if (mode === 'replay') {
    const errors = await replayChartsSlice(slice, goldenDir, cbUrl);
    if (errors.length) {
      for (const line of errors) console.error(`[replay-charts] ${line}`);
      process.exit(1);
    }
    console.error(`[replay-charts] ${slice} ok (${loadChartCases(slice).length} cases)`);
  } else {
    console.error('mode must be capture or replay');
    process.exit(1);
  }
}
