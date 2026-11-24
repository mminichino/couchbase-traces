// Server only: the Couchbase SDK is a native addon.
import type { QueryMetaData, QueryOptions } from 'couchbase';
import { QueryScanConsistency } from 'couchbase';

import { mergeQueryAttribution } from '@/query/attribution';
import type { TeamQuerySettings } from '@/types';

import { normalizeParameters } from './browser';
import {
  CouchbaseQueryError,
  describeSdkError,
  fromSdkError,
  serialize,
} from './errors';
import { inferMeta, widenType } from './inferMeta';
import { getCurrentQueryAttribution } from './nodeAttribution';
import {
  type CouchbaseConnectionConfig,
  getCouchbaseLogger,
  getCouchbaseRuntimeConfig,
  type Logger,
  secretsOf,
} from './nodeCluster';
import {
  type ClusterCache,
  clusterCache,
  type ClusterLease,
} from './nodeClusterCache';
import { resolveQueryOptions, withAttributionComment } from './settings';
import { assertAllowedStatement } from './statement';
import type { ColumnMeta, CouchbaseQueryInputs, Frame } from './types';

// Query execution
// ---------------------------------------------------------------------------

type QueryEvent =
  | { kind: 'row'; row: unknown }
  | { kind: 'meta'; meta: QueryMetaData }
  | { kind: 'error'; error: unknown }
  | { kind: 'end' }
  | { kind: 'abort' };

/** Bridges the SDK's row events to a pull-based queue. */
function queryEvents(
  run: () => NodeJS.EventEmitter,
  signal: AbortSignal | undefined,
) {
  const queue: QueryEvent[] = [];
  let wake: (() => void) | null = null;
  const push = (e: QueryEvent) => {
    queue.push(e);
    wake?.();
    wake = null;
  };
  const onAbort = () => push({ kind: 'abort' });
  signal?.addEventListener('abort', onAbort, { once: true });
  const emitter = run();
  emitter.on('row', row => push({ kind: 'row', row }));
  emitter.on('meta', meta => push({ kind: 'meta', meta }));
  emitter.on('error', error => push({ kind: 'error', error }));
  emitter.on('end', () => push({ kind: 'end' }));
  return {
    async next(): Promise<QueryEvent> {
      while (queue.length === 0) {
        await new Promise<void>(resolve => {
          wake = resolve;
        });
      }
      return queue.shift()!;
    },
    dispose() {
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function toRow(row: unknown): Record<string, unknown> {
  return isRecord(row) ? row : { value: row };
}

const AUTO_RESULT_NAME = /^\$\d+$/;

/**
 * SQL++ names unaliased select items `$1`, `$2`, …. Chart postprocess hints
 * expect upstream-shaped names (`count()`, group expressions, …). Rename
 * auto keys onto unused hint names by position so meta/rows agree.
 */
export function remapCouchbaseAutoResultNames(
  row: Record<string, unknown>,
  hintedColumns: string[] | undefined,
): Record<string, unknown> {
  if (hintedColumns == null || hintedColumns.length === 0) return row;
  const autoKeys = Object.keys(row)
    .filter(k => AUTO_RESULT_NAME.test(k))
    .sort(
      (a, b) =>
        Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10),
    );

  let remapped = row;
  if (autoKeys.length > 0) {
    const present = new Set(
      Object.keys(row).filter(k => !AUTO_RESULT_NAME.test(k)),
    );
    const targets = hintedColumns.filter(name => !present.has(name));
    if (targets.length > 0) {
      const out: Record<string, unknown> = { ...row };
      for (let i = 0; i < autoKeys.length && i < targets.length; i++) {
        const from = autoKeys[i];
        const to = targets[i];
        out[to] = out[from];
        delete out[from];
      }
      remapped = out;
    }
  }

  // DBTableChart orders columns via Object.keys(firstRow). Couchbase JSON may
  // not preserve select-list order, so rebuild the row in hint order.
  return orderRowByHintedColumns(remapped, hintedColumns);
}

/** Rebuild `row` so Object.keys follow `hintedColumns`, then any extras. */
export function orderRowByHintedColumns(
  row: Record<string, unknown>,
  hintedColumns: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const name of hintedColumns) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      out[name] = row[name];
      seen.add(name);
    }
  }
  for (const [key, value] of Object.entries(row)) {
    if (!seen.has(key)) out[key] = value;
  }
  return out;
}

/** Widens `current` with `batch`; null when nothing changed. */
function mergeMeta(
  current: ColumnMeta[],
  batch: ColumnMeta[],
): ColumnMeta[] | null {
  let changed = false;
  const merged = current.map(c => ({ ...c }));
  const byName = new Map(merged.map(c => [c.name, c]));
  for (const b of batch) {
    const existing = byName.get(b.name);
    if (existing == null) {
      const added = { ...b };
      byName.set(b.name, added);
      merged.push(added);
      changed = true;
      continue;
    }
    const widened = widenType(existing.type, b.type);
    if (widened !== existing.type) {
      existing.type = widened;
      changed = true;
    }
  }
  return changed ? merged : null;
}

function buildSdkOptions(
  inputs: CouchbaseQueryInputs<any>,
  team: TeamQuerySettings | null,
  logger: Logger,
): QueryOptions {
  const cfg = getCouchbaseRuntimeConfig();
  const resolved = resolveQueryOptions({
    inputs,
    team,
    config: {
      defaultTimeoutMs: cfg.defaultTimeoutMs,
      maxTimeoutMs: cfg.maxTimeoutMs,
    },
    logger,
  });
  const params = normalizeParameters(inputs.query_params);
  for (const [k, v] of Object.entries(inputs.query_params ?? {})) {
    if (typeof v === 'bigint') {
      logger.debug(
        { parameter: k },
        'Sending bigint query parameter as a decimal string',
      );
    }
  }
  const options: QueryOptions = {
    parameters: params ?? {},
    readOnly: resolved.readOnly,
    timeout: resolved.timeoutMs,
    scanConsistency:
      resolved.scanConsistency === 'request_plus'
        ? QueryScanConsistency.RequestPlus
        : QueryScanConsistency.NotBounded,
    clientContextId: resolved.clientContextId,
    metrics: true,
    adhoc: true,
  };
  if (resolved.maxParallelism != null) {
    options.maxParallelism = resolved.maxParallelism;
  }
  if (resolved.scanCap != null) options.scanCap = resolved.scanCap;
  if (resolved.pipelineBatch != null) {
    options.pipelineBatch = resolved.pipelineBatch;
  }
  if (resolved.pipelineCap != null) options.pipelineCap = resolved.pipelineCap;
  if (resolved.queryContext != null) {
    options.queryContext = resolved.queryContext;
  }
  return options;
}

export function executeQuery(args: {
  conn: CouchbaseConnectionConfig;
  inputs: CouchbaseQueryInputs<any>;
  team: TeamQuerySettings | null;
  signal?: AbortSignal;
  frameRows: number;
  /** Tests only; never set by the API route or clients */
  skipStatementCheck?: boolean;
  logger?: Logger;
  cache?: ClusterCache;
}): AsyncGenerator<Frame> {
  // Read the request scope now, not when the generator first runs: a caller
  // may pull frames from outside the scope that issued the query.
  const attribution = mergeQueryAttribution(
    getCurrentQueryAttribution(),
    args.inputs.attribution,
  );
  return runQuery({ ...args, inputs: { ...args.inputs, attribution } });
}

async function* runQuery(args: {
  conn: CouchbaseConnectionConfig;
  inputs: CouchbaseQueryInputs<any>;
  team: TeamQuerySettings | null;
  signal?: AbortSignal;
  frameRows: number;
  skipStatementCheck?: boolean;
  logger?: Logger;
  cache?: ClusterCache;
}): AsyncGenerator<Frame> {
  const { conn, inputs, team, signal, skipStatementCheck } = args;
  const logger = args.logger ?? getCouchbaseLogger();
  const statement = inputs.query;
  const frameRows = Math.max(1, args.frameRows);
  const hints = { columns: inputs.columns, columnTypes: inputs.columnTypes };
  const canceled = () =>
    new CouchbaseQueryError('CANCELED', 'Query was canceled', statement);

  let lease: ClusterLease | null = null;
  let events: ReturnType<typeof queryEvents> | null = null;
  let connecting = false;
  let firstFrameSent = false;
  try {
    if (!skipStatementCheck) assertAllowedStatement(statement);
    const options = buildSdkOptions(inputs, team, logger);
    if (signal?.aborted) throw canceled();

    connecting = true;
    lease = await (args.cache ?? clusterCache).lease(conn);
    connecting = false;
    if (signal?.aborted) throw canceled();

    const cluster = lease.cluster;
    events = queryEvents(
      () =>
        cluster.query(
          withAttributionComment(statement, inputs.attribution),
          options,
        ),
      signal,
    );

    let meta: ColumnMeta[] | null = null;
    let batch: Record<string, unknown>[] = [];
    let total = 0;
    let sdkMeta: QueryMetaData | undefined;

    const flush = function* (): Generator<Frame> {
      if (meta == null) {
        meta = inferMeta(batch, hints);
        yield { type: 'meta', meta };
      } else if (batch.length > 0) {
        const widened = mergeMeta(
          meta,
          inferMeta(batch, { columnTypes: inputs.columnTypes }),
        );
        if (widened) {
          meta = widened;
          yield { type: 'meta', meta };
        }
      }
      if (batch.length > 0) {
        yield { type: 'rows', rows: batch };
      }
      batch = [];
    };

    for (;;) {
      const ev = await events.next();
      if (ev.kind === 'abort') throw canceled();
      if (ev.kind === 'row') {
        batch.push(
          remapCouchbaseAutoResultNames(toRow(ev.row), inputs.columns),
        );
        total++;
        if (batch.length >= frameRows) {
          for (const f of flush()) {
            firstFrameSent = true;
            yield f;
          }
        }
      } else if (ev.kind === 'meta') {
        sdkMeta = ev.meta;
      } else if (ev.kind === 'error') {
        throw ev.error;
      } else {
        break;
      }
    }
    if (signal?.aborted) throw canceled();
    for (const f of flush()) {
      firstFrameSent = true;
      yield f;
    }
    const metrics = sdkMeta?.metrics;
    yield {
      type: 'end',
      rows: total,
      statistics: {
        elapsed: metrics ? metrics.elapsedTime / 1000 : 0,
        rows_read: metrics?.resultCount ?? total,
        bytes_read: metrics?.resultSize ?? 0,
      },
    };
  } catch (e) {
    if (signal?.aborted) throw canceled();
    const err = fromSdkError(e, statement, {
      connecting,
      secrets: secretsOf(conn),
    });
    logger.debug(
      { code: err.code, sqlppCode: err.sqlppCode, firstFrameSent },
      'Couchbase query failed',
    );
    if (err.code === 'TIMEOUT') {
      // The serialized frame keeps only code and message; the SDK context
      // (node, retries, timings) says why it timed out (D18).
      logger.warn(
        { sdk: describeSdkError(e, secretsOf(conn)), connecting },
        'Couchbase query timed out',
      );
    }
    yield { type: 'error', error: serialize(err) };
  } finally {
    events?.dispose();
    lease?.release();
  }
}

// ---------------------------------------------------------------------------
