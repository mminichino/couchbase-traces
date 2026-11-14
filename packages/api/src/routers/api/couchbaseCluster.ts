import {
  type ActiveRequestRow,
  activeRequestsQuery,
  bucketWidthMs,
  COMPLETED_REQUESTS_NOTE,
  type CompletedBucket,
  completedOverTimeQuery,
  indexesQuery,
  type IndexRow,
  mapActiveRequest,
  mapCompletedBucket,
  mapIndex,
  mapRecentRequest,
  mapTopStatement,
  type RecentRequestRow,
  recentRequestsQuery,
  type TopStatementRow,
  topStatementsQuery,
} from '@couchbase-traces/common-utils/dist/couchbase/cluster';
import { managementBaseUrl } from '@couchbase-traces/common-utils/dist/couchbase/management';
import { executeQuery } from '@couchbase-traces/common-utils/dist/couchbase/node';
import type { SqlPP } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import type { TeamQuerySettings } from '@couchbase-traces/common-utils/dist/types';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';

import {
  getConnectionById,
  toCouchbaseConnectionConfig,
} from '@/controllers/connection';
import { getTeam } from '@/controllers/team';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import type { IConnection } from '@/models/connection';
import {
  managementCall,
  managementHostProblem,
  type ManagementResult,
  type SectionDetail,
} from '@/utils/couchbaseManagement';
import {
  type BucketStatus,
  type ClusterSummary,
  MEASURES,
  type MetricSeries,
  type NodeStatus,
  parseBuckets,
  parseCluster,
  parseStatsRange,
  parseTasks,
  seriesHasPoints,
  statsRangeBody,
  statsWindow,
  type TaskStatus,
} from '@/utils/couchbaseStats';
import { objectIdSchema } from '@/utils/zod';

const router = express.Router();

const STATUS_CACHE_MS = 10_000;

export type Section<T> =
  | { available: true; data: T; fetchedAt: string }
  | {
      available: false;
      reason: 'not_configured' | 'restricted';
      detail: SectionDetail;
    };

type StatusResponse = {
  cluster: Section<ClusterSummary>;
  nodes: Section<NodeStatus[]>;
  buckets: Section<BucketStatus[]>;
  tasks: Section<TaskStatus[]>;
};

type MeasureData = {
  measure: string;
  unit: string;
  series: MetricSeries[];
};

type QueriesResponse = {
  note: string;
  active: Section<ActiveRequestRow[]>;
  completedOverTime: Section<CompletedBucket[]>;
  topStatements: Section<TopStatementRow[]>;
  recent: Section<RecentRequestRow[]>;
  indexes: Section<IndexRow[]>;
};

const statusCache = new Map<
  string,
  { expires: number; body: StatusResponse }
>();

export function clearClusterStatusCache(): void {
  statusCache.clear();
}

const rangeSchema = z
  .object({
    from: z.coerce.number().int(),
    to: z.coerce.number().int(),
  })
  .refine(range => range.to > range.from, { message: 'to must be after from' });

function publicMessage(message: string): string {
  const cleaned = message
    .replace(/couchbases?:\/\/\S+/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .trim();
  return cleaned === '' ? 'Request failed' : cleaned.slice(0, 400);
}

function available<T>(data: T): Section<T> {
  return { available: true, data, fetchedAt: new Date().toISOString() };
}

function restricted<T>(detail: SectionDetail): Section<T> {
  return {
    available: false,
    reason: 'restricted',
    detail: { ...detail, message: publicMessage(detail.message) },
  };
}

function notConfigured<T>(): Section<T> {
  return {
    available: false,
    reason: 'not_configured',
    detail: {
      code: 'not_configured',
      message: 'Monitoring credentials are not set',
    },
  };
}

function hasMonitor(connection: IConnection): boolean {
  return Boolean(connection.monitorUsername && connection.monitorPassword);
}

function one(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

async function teamSettings(teamId: string): Promise<TeamQuerySettings | null> {
  const team = await getTeam(teamId, [
    'queryTimeout',
    'metadataMaxRowsToRead',
    'searchRowLimit',
    'fieldMetadataDisabled',
    'parallelizeWhenPossible',
    'filterKeysFetchLimit',
    'queryScanConsistency',
    'queryMaxParallelism',
  ]);
  if (team == null) return null;
  return {
    queryTimeout: team.queryTimeout ?? undefined,
    metadataMaxRowsToRead: team.metadataMaxRowsToRead ?? undefined,
    searchRowLimit: team.searchRowLimit ?? undefined,
    fieldMetadataDisabled: team.fieldMetadataDisabled ?? undefined,
    parallelizeWhenPossible: team.parallelizeWhenPossible ?? undefined,
    filterKeysFetchLimit: team.filterKeysFetchLimit ?? undefined,
    queryScanConsistency: team.queryScanConsistency ?? undefined,
    queryMaxParallelism: team.queryMaxParallelism ?? undefined,
  };
}

async function loadConnection(
  req: Request,
  res: Response,
): Promise<{ teamId: string; connection: IConnection } | null> {
  const { teamId } = getNonNullUserWithTeam(req);
  const connectionId =
    typeof req.params.connectionId === 'string' ? req.params.connectionId : '';
  if (!objectIdSchema.safeParse(connectionId).success) {
    res.status(404).send();
    return null;
  }
  const connection = await getConnectionById(
    teamId.toString(),
    connectionId,
    true,
  );
  if (!connection) {
    res.status(404).send();
    return null;
  }
  if ((connection.kind ?? 'clickhouse') !== 'couchbase') {
    res.status(409).send();
    return null;
  }
  return { teamId: teamId.toString(), connection };
}

type Origin = { url: string; ca?: string };

function originOf(connection: IConnection): Origin | SectionDetail {
  try {
    const config = toCouchbaseConnectionConfig(connection);
    return managementBaseUrl({
      ...config,
      managementPort:
        typeof connection.managementPort === 'number'
          ? connection.managementPort
          : undefined,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Invalid connection string';
    return { code: 'invalid_connection', message };
  }
}

function isOrigin(value: Origin | SectionDetail): value is Origin {
  return 'url' in value;
}

async function getJson(
  origin: Origin,
  connection: IConnection,
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<ManagementResult> {
  return managementCall({
    url: `${origin.url}${path}`,
    username: connection.monitorUsername ?? '',
    password: connection.monitorPassword ?? '',
    ca: origin.ca,
    method: init?.method,
    body: init?.body,
  });
}

async function buildStatus(connection: IConnection): Promise<StatusResponse> {
  if (!hasMonitor(connection)) {
    return {
      cluster: notConfigured(),
      nodes: notConfigured(),
      buckets: notConfigured(),
      tasks: notConfigured(),
    };
  }
  const hostProblem = managementHostProblem(connection.host);
  if (hostProblem) {
    const detail = { code: 'invalid_host', message: hostProblem };
    return {
      cluster: restricted(detail),
      nodes: restricted(detail),
      buckets: restricted(detail),
      tasks: restricted(detail),
    };
  }
  const origin = originOf(connection);
  if (!isOrigin(origin)) {
    return {
      cluster: restricted(origin),
      nodes: restricted(origin),
      buckets: restricted(origin),
      tasks: restricted(origin),
    };
  }
  const [pools, buckets, tasks] = await Promise.all([
    getJson(origin, connection, '/pools/default'),
    getJson(origin, connection, '/pools/default/buckets'),
    getJson(origin, connection, '/pools/default/tasks'),
  ]);
  const parsed = pools.ok ? parseCluster(pools.json) : null;
  return {
    cluster: parsed
      ? available(parsed.cluster)
      : restricted(
          pools.ok ? { message: 'Response was not JSON' } : pools.detail,
        ),
    nodes: parsed
      ? available(parsed.nodes)
      : restricted(
          pools.ok ? { message: 'Response was not JSON' } : pools.detail,
        ),
    buckets: buckets.ok
      ? available(parseBuckets(buckets.json))
      : restricted(buckets.detail),
    tasks: tasks.ok
      ? available(parseTasks(tasks.json))
      : restricted(tasks.detail),
  };
}

async function fetchMeasure(
  origin: Origin,
  connection: IConnection,
  measure: (typeof MEASURES)[number],
  fromMs: number,
  toMs: number,
): Promise<Section<MeasureData>> {
  const window = statsWindow(fromMs, toMs);
  let last: SectionDetail | null = null;
  let sawSuccess = false;
  for (const name of measure.candidates) {
    const result = await getJson(
      origin,
      connection,
      '/pools/default/stats/range',
      {
        method: 'POST',
        body: statsRangeBody(name, measure.rate ? 'rate' : null, window),
      },
    );
    if (!result.ok) {
      last = result.detail;
      if (
        result.detail.httpStatus === 401 ||
        result.detail.httpStatus === 403
      ) {
        return restricted(result.detail);
      }
      continue;
    }
    sawSuccess = true;
    const series = parseStatsRange(result.json, measure.rate);
    if (seriesHasPoints(series)) {
      return available({
        measure: measure.measure,
        unit: measure.unit,
        series,
      });
    }
  }
  if (!sawSuccess && last) return restricted(last);
  return available({
    measure: measure.measure,
    unit: measure.unit,
    series: [],
  });
}

async function buildInfrastructure(
  connection: IConnection,
  fromMs: number,
  toMs: number,
): Promise<Record<string, Section<MeasureData>>> {
  const blank = (section: Section<MeasureData>) =>
    Object.fromEntries(MEASURES.map(measure => [measure.id, section]));
  if (!hasMonitor(connection)) return blank(notConfigured());
  const hostProblem = managementHostProblem(connection.host);
  if (hostProblem) {
    return blank(restricted({ code: 'invalid_host', message: hostProblem }));
  }
  const origin = originOf(connection);
  if (!isOrigin(origin)) return blank(restricted(origin));
  const entries = await Promise.all(
    MEASURES.map(
      async measure =>
        [
          measure.id,
          await fetchMeasure(origin, connection, measure, fromMs, toMs),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}

async function runQuery<T>(
  connection: IConnection,
  team: TeamQuerySettings | null,
  built: SqlPP,
  map: (rows: Record<string, unknown>[]) => T,
): Promise<Section<T>> {
  const hostProblem = managementHostProblem(connection.host);
  if (hostProblem)
    return restricted({ code: 'invalid_host', message: hostProblem });
  try {
    const rows: Record<string, unknown>[] = [];
    const conn = toCouchbaseConnectionConfig(connection);
    for await (const frame of executeQuery({
      conn,
      inputs: { query: built.statement, query_params: built.parameters },
      team,
      frameRows: 500,
    })) {
      if (frame.type === 'rows') rows.push(...frame.rows);
      if (frame.type === 'error') {
        return restricted({
          code: frame.error.code,
          message: publicMessage(frame.error.message),
        });
      }
    }
    return available(map(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Query failed';
    return restricted({ code: 'query', message: publicMessage(message) });
  }
}

router.get('/:connectionId/status', async (req, res, next) => {
  try {
    const loaded = await loadConnection(req, res);
    if (!loaded) return;
    const refresh = one(req.query.refresh);
    const key = `${loaded.teamId}:${loaded.connection.id}:${loaded.connection.updatedAt?.toISOString() ?? ''}`;
    const now = Date.now();
    if (refresh == null || refresh === '') {
      const hit = statusCache.get(key);
      if (hit && hit.expires > now) {
        res.json(hit.body);
        return;
      }
    }
    const body = await buildStatus(loaded.connection);
    statusCache.set(key, { expires: now + STATUS_CACHE_MS, body });
    res.json(body);
  } catch (err) {
    next(err);
  }
});

router.get('/:connectionId/infrastructure', async (req, res, next) => {
  try {
    const loaded = await loadConnection(req, res);
    if (!loaded) return;
    const range = rangeSchema.safeParse({
      from: one(req.query.from),
      to: one(req.query.to),
    });
    if (!range.success) {
      res.status(400).json({
        message:
          'from and to must be millisecond timestamps, with to after from',
      });
      return;
    }
    res.json(
      await buildInfrastructure(
        loaded.connection,
        range.data.from,
        range.data.to,
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:connectionId/queries', async (req, res, next) => {
  try {
    const loaded = await loadConnection(req, res);
    if (!loaded) return;
    const range = rangeSchema.safeParse({
      from: one(req.query.from),
      to: one(req.query.to),
    });
    if (!range.success) {
      res.status(400).json({
        message:
          'from and to must be millisecond timestamps, with to after from',
      });
      return;
    }
    const { from, to } = range.data;
    const width = bucketWidthMs(from, to);
    const team = await teamSettings(loaded.teamId);
    const connection = loaded.connection;
    const [active, completedOverTime, topStatements, recent, indexes] =
      await Promise.all([
        runQuery(connection, team, activeRequestsQuery(), rows =>
          rows.map(mapActiveRequest),
        ),
        runQuery(
          connection,
          team,
          completedOverTimeQuery(from, to, width),
          rows =>
            rows
              .map(mapCompletedBucket)
              .filter((row): row is CompletedBucket => row != null),
        ),
        runQuery(connection, team, topStatementsQuery(from, to), rows =>
          rows.map(mapTopStatement),
        ),
        runQuery(connection, team, recentRequestsQuery(from, to), rows =>
          rows.map(mapRecentRequest),
        ),
        runQuery(connection, team, indexesQuery(), rows => rows.map(mapIndex)),
      ]);
    const body: QueriesResponse = {
      note: COMPLETED_REQUESTS_NOTE,
      active,
      completedOverTime,
      topStatements,
      recent,
      indexes,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

export default router;
