// Server only: the Couchbase SDK is a native addon.
import type { QueryMetaData, QueryOptions } from 'couchbase';
import { QueryScanConsistency } from 'couchbase';

import type { TeamClickHouseSettings } from '@/types';

import { normalizeParameters } from './browser';
import { CouchbaseQueryError, fromSdkError, serialize } from './errors';
import { inferMeta, widenType } from './inferMeta';
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
import { resolveQueryOptions } from './settings';
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
  team: TeamClickHouseSettings | null,
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

export async function* executeQuery(args: {
  conn: CouchbaseConnectionConfig;
  inputs: CouchbaseQueryInputs<any>;
  team: TeamClickHouseSettings | null;
  signal?: AbortSignal;
  frameRows: number;
  /** Tests only; never set by the API route or clients */
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
    events = queryEvents(() => cluster.query(statement, options), signal);

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
        batch.push(toRow(ev.row));
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
    yield { type: 'error', error: serialize(err) };
  } finally {
    events?.dispose();
    lease?.release();
  }
}

// ---------------------------------------------------------------------------
