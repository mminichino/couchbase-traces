import {
  ConnStrError,
  parseConnStr,
} from '@couchbase-traces/common-utils/dist/couchbase/connstr';
import {
  type CouchbaseErrorCode,
  CouchbaseQueryError,
  httpStatusForCode,
  type SerializedQueryError,
} from '@couchbase-traces/common-utils/dist/couchbase/errors';
import {
  executeQuery,
  setCouchbaseLogger,
  testConnection,
  testKeyspace,
} from '@couchbase-traces/common-utils/dist/couchbase/node';
import { assertAllowedStatement } from '@couchbase-traces/common-utils/dist/couchbase/statement';
import {
  COUCHBASE_FORMATS,
  type CouchbaseQueryInputs,
  type Frame,
} from '@couchbase-traces/common-utils/dist/couchbase/types';
import type { TeamClickHouseSettings } from '@couchbase-traces/common-utils/dist/types';
import express, { type Request, type Response } from 'express';
import { performance } from 'perf_hooks';
import { z } from 'zod';

import * as config from '@/config';
import {
  getConnectionById,
  toCouchbaseConnectionConfig,
} from '@/controllers/connection';
import { getTeam } from '@/controllers/team';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import { recordOperationOutcome } from '@/utils/instrumentation';
import logger from '@/utils/logger';
import { IPV6_BRACKET_RE, isPrivateIp } from '@/utils/validators';
import { objectIdSchema } from '@/utils/zod';

// Both operations report their own SLIs because errors are returned as JSON
// or NDJSON frames and never reach the API error middleware.
const QUERY_OPERATION = 'couchbase.query';
const CONNECTION_TEST_OPERATION = 'couchbase.connection_test';

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_STATEMENT_BYTES = 256 * 1024;
const MAX_PARAMETERS = 1000;
const CONNECTION_TEST_TIMEOUT_MS = 5000;

setCouchbaseLogger(logger);

const router = express.Router();

function sendError(
  res: Response,
  code: CouchbaseErrorCode,
  message: string,
  status = httpStatusForCode(code),
) {
  const error: SerializedQueryError = { code, message, sqlppCode: null };
  return res.status(status).json({ success: false, error });
}

function zodMessage(err: z.ZodError) {
  return err.issues
    .map(i => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

function bodyTooLarge(req: Request) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared)) return declared > MAX_BODY_BYTES;
  return Buffer.byteLength(JSON.stringify(req.body ?? null)) > MAX_BODY_BYTES;
}

/** Returns an error message when the connection string is unusable, else null. */
function checkHost(host: string): string | null {
  let parsed;
  try {
    parsed = parseConnStr(host);
  } catch (e) {
    return e instanceof ConnStrError ? e.message : 'Invalid connection string';
  }
  // Hostnames are not resolved, matching the ClickHouse test route.
  if (
    parsed.hosts.some(h => isPrivateIp(h.host.replace(IPV6_BRACKET_RE, '')))
  ) {
    return 'Invalid host';
  }
  return null;
}

async function getTeamSettings(
  teamId: string,
): Promise<TeamClickHouseSettings | null> {
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

const testBodySchema = z.object({
  host: z.string(),
  username: z.string().optional(),
  password: z.string().optional(),
  wanProfile: z.boolean().optional(),
  tlsCaCertificate: z.string().optional(),
  connectionId: objectIdSchema.optional(),
});

router.post('/test', async (req, res, next) => {
  const startedAt = performance.now();
  const record = (outcome: 'success' | 'error') =>
    recordOperationOutcome({
      operation: CONNECTION_TEST_OPERATION,
      outcome,
      durationMs: performance.now() - startedAt,
    });
  try {
    const { teamId } = getNonNullUserWithTeam(req);
    const parsed = testBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'INVALID_CONNECTION', zodMessage(parsed.error));
    }
    const body = parsed.data;
    const hostError = checkHost(body.host);
    if (hostError) {
      return sendError(res, 'INVALID_CONNECTION', hostError, 400);
    }

    let { password, tlsCaCertificate } = body;
    if (
      body.connectionId &&
      (password === undefined || tlsCaCertificate === undefined)
    ) {
      const stored = await getConnectionById(
        teamId.toString(),
        body.connectionId,
        true,
      );
      if (stored == null) {
        return sendError(res, 'CONNECTION_NOT_FOUND', 'Connection not found');
      }
      if (stored.kind === 'couchbase') {
        password ??= stored.password;
        tlsCaCertificate ??= stored.tlsCaCertificate;
      }
    }

    const result = await testConnection(
      {
        host: body.host,
        username: body.username ?? '',
        password,
        wanProfile: body.wanProfile,
        tlsCaCertificate,
      },
      CONNECTION_TEST_TIMEOUT_MS,
    );
    record(result.success ? 'success' : 'error');
    return res.json(result);
  } catch (e) {
    record('error');
    next(e);
  }
});

const testSourceBodySchema = z.object({
  connectionId: objectIdSchema,
  bucket: z.string().min(1),
  scope: z.string().min(1),
  collection: z.string().min(1),
});

async function loadCouchbaseConnection(
  res: Response,
  teamId: string,
  connectionId: string,
) {
  const connection = await getConnectionById(teamId, connectionId, true);
  if (connection == null) {
    sendError(res, 'CONNECTION_NOT_FOUND', 'Connection not found');
    return null;
  }
  if (connection.kind !== 'couchbase') {
    sendError(
      res,
      'WRONG_CONNECTION_KIND',
      'Connection is not a Couchbase connection',
      409,
    );
    return null;
  }
  return toCouchbaseConnectionConfig(connection);
}

router.post('/test-source', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);
    const parsed = testSourceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'PARSING_FAILED', zodMessage(parsed.error));
    }
    const { connectionId, bucket, scope, collection } = parsed.data;
    const conn = await loadCouchbaseConnection(
      res,
      teamId.toString(),
      connectionId,
    );
    if (conn == null) return;
    const result = await testKeyspace(
      conn,
      { bucket, scope, collection },
      CONNECTION_TEST_TIMEOUT_MS,
    );
    return res.json(result);
  } catch (e) {
    next(e);
  }
});

const settingSchema = z.object({ setting: z.string(), value: z.string() });

const queryBodySchema = z.object({
  connectionId: objectIdSchema,
  statement: z
    .string()
    .min(1)
    .refine(
      s => Buffer.byteLength(s) <= MAX_STATEMENT_BYTES,
      'Statement exceeds 256 KB',
    ),
  parameters: z
    .record(z.unknown())
    .refine(
      p => Object.keys(p).length <= MAX_PARAMETERS,
      `At most ${MAX_PARAMETERS} parameters are allowed`,
    )
    .optional(),
  format: z.enum(COUCHBASE_FORMATS).optional(),
  columns: z.array(z.string()).optional(),
  columnTypes: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  scanConsistency: z.enum(['not_bounded', 'request_plus']).optional(),
  queryContext: z
    .object({ bucket: z.string().min(1), scope: z.string().min(1) })
    .optional(),
  sourceSettings: z.array(settingSchema).max(10).optional(),
  queryId: z.string().max(64).optional(),
  attribution: z.record(z.unknown()).optional(),
});

function writeFrame(res: Response, frame: Frame) {
  res.write(`${JSON.stringify(frame)}\n`);
  // `compression()` buffers writes; flush so each frame reaches the client.
  (res as Response & { flush?: () => void }).flush?.();
}

router.post('/query', async (req, res, next) => {
  const startedAt = performance.now();
  const record = (outcome: 'success' | 'error') =>
    recordOperationOutcome({
      operation: QUERY_OPERATION,
      outcome,
      durationMs: performance.now() - startedAt,
    });

  let teamId: string;
  try {
    teamId = getNonNullUserWithTeam(req).teamId.toString();
  } catch (e) {
    return next(e);
  }

  if (bodyTooLarge(req)) {
    return sendError(res, 'PARSING_FAILED', 'Request body exceeds 1 MB');
  }
  const parsed = queryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 'PARSING_FAILED', zodMessage(parsed.error));
  }
  const body = parsed.data;

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  let iterator: AsyncIterator<Frame> | null = null;
  try {
    const conn = await loadCouchbaseConnection(res, teamId, body.connectionId);
    if (conn == null) return;

    try {
      assertAllowedStatement(body.statement);
    } catch (e) {
      if (e instanceof CouchbaseQueryError) {
        return sendError(res, e.code, e.message);
      }
      throw e;
    }

    const inputs: CouchbaseQueryInputs<any> = {
      query: body.statement,
      query_params: body.parameters,
      format: body.format,
      columns: body.columns,
      columnTypes: body.columnTypes,
      timeoutMs: body.timeoutMs,
      scanConsistency: body.scanConsistency,
      queryContext: body.queryContext,
      sourceSettings: body.sourceSettings,
      queryId: body.queryId,

      attribution: body.attribution as CouchbaseQueryInputs['attribution'],
    };
    const team = await getTeamSettings(teamId);
    iterator = executeQuery({
      conn,
      inputs,
      team,
      signal: abort.signal,
      frameRows: config.COUCHBASE_FRAME_ROWS,
      logger,
    })[Symbol.asyncIterator]();

    const first = await iterator.next();
    if (!first.done && first.value.type === 'error') {
      record('error');
      const { error } = first.value;
      return res
        .status(httpStatusForCode(error.code))
        .json({ success: false, error });
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.flushHeaders();

    let failed = false;
    if (!first.done) writeFrame(res, first.value);
    for (;;) {
      if (abort.signal.aborted) break;
      const next = await iterator.next();
      if (next.done) break;
      if (next.value.type === 'error') failed = true;
      writeFrame(res, next.value);
    }
    record(failed || abort.signal.aborted ? 'error' : 'success');
    res.end();
  } catch (e) {
    record('error');
    if (res.headersSent) {
      if (!abort.signal.aborted) {
        logger.error({ err: e }, 'Couchbase query stream failed');
        writeFrame(res, {
          type: 'error',
          error: { code: 'INTERNAL', message: 'Query failed', sqlppCode: null },
        });
      }
      res.end();
      return;
    }
    if (e instanceof CouchbaseQueryError) {
      return sendError(res, e.code, e.message);
    }
    next(e);
  } finally {
    await iterator?.return?.(undefined);
  }
});

export default router;
