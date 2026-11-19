import { clusterCache } from '@couchbase-traces/common-utils/dist/couchbase/node';
import {
  ConnectionSchema,
  ConnectionSchemaNoId,
} from '@couchbase-traces/common-utils/dist/types';
import express from 'express';
import { validateRequest } from 'zod-express-middleware';

import {
  buildCouchbaseConnectionUpdate,
  createConnection,
  deleteConnection,
  getConnectionById,
  getConnectionsByTeam,
  updateConnection,
} from '@/controllers/connection';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import logger from '@/utils/logger';
import { rejectPromqlBody } from '@/utils/rejectPromql';

const router = express.Router();

function connectionForClient(
  doc: Awaited<ReturnType<typeof getConnectionsByTeam>>[number],
) {
  const json: Record<string, unknown> = { ...doc };
  const kind = (json.kind as string | undefined) ?? 'clickhouse';
  const unsupported = Boolean(json.unsupported) || kind === 'clickhouse';
  if (unsupported) {
    return {
      id: String(json.id ?? json._id),
      name: String(json.name ?? ''),
      kind: 'clickhouse' as const,
      unsupported: true as const,
    };
  }
  const {
    password: _password,
    tlsCaCertificate: _tls,
    monitorPassword: _monitorPassword,
    ...rest
  } = json;
  return rest;
}

async function invalidateCouchbaseCluster(connectionId: string) {
  try {
    await clusterCache.invalidate(connectionId);
  } catch (e) {
    logger.warn({ connectionId, err: e }, 'Failed to close Couchbase cluster');
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);

    const connections = await getConnectionsByTeam(teamId.toString());

    res.json(connections.map(connectionForClient));
  } catch (e) {
    next(e);
  }
});

router.post(
  '/',
  rejectPromqlBody,
  validateRequest({
    body: ConnectionSchemaNoId,
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);

      // `platformProvisioned` records how a connection came to exist and
      // decides whether IaC export treats it as safe to `terraform import`, so
      // it is server-owned. `validateRequest` only validates — it does not
      // replace `req.body` — so a client-supplied value would otherwise reach
      // the model. Re-parsing rather than omitting the one key by name: zod
      // strips every unknown key, so this holds for the next server-owned
      // field too, and lodash's `omit` types its key as `keyof any` rather
      // than `keyof T`, so a typo in the name would compile silently.
      const body = ConnectionSchemaNoId.parse(req.body);

      const connection = await createConnection(teamId.toString(), {
        ...body,
        password: body.password ?? '',
        kind: 'couchbase',
        managementPort:
          typeof body.managementPort === 'number'
            ? body.managementPort
            : undefined,
        monitorPassword: body.monitorPassword || undefined,
      });

      res.status(200).send({ id: connection._id.toString() });
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  '/:id',
  rejectPromqlBody,
  validateRequest({
    body: ConnectionSchema,
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);

      const connection = await getConnectionById(
        teamId.toString(),
        req.params.id,
        true,
      );

      if (!connection) {
        res.status(404).send();
        return;
      }

      // `platformProvisioned` is server-owned — see the POST handler above.
      const body = ConnectionSchema.parse(req.body);
      const storedKind = connection.kind ?? 'clickhouse';
      if (storedKind !== 'couchbase' || connection.unsupported) {
        res.status(400).json({
          message:
            'This connection used ClickHouse, which is no longer supported. Delete it and create a Couchbase connection.',
        });
        return;
      }

      const { update: newConnection, unsetFields } =
        buildCouchbaseConnectionUpdate(body, connection.password);

      const updatedConnection = await updateConnection(
        teamId.toString(),
        req.params.id,
        newConnection,
        unsetFields,
      );

      if (!updatedConnection) {
        res.status(404).send();
        return;
      }

      if (storedKind === 'couchbase') {
        await invalidateCouchbaseCluster(req.params.id);
      }

      res.status(200).send();
    } catch (e) {
      next(e);
    }
  },
);

router.delete('/:id', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);

    const deleted = await deleteConnection(teamId.toString(), req.params.id);

    if (deleted?.kind === 'couchbase') {
      await invalidateCouchbaseCluster(req.params.id);
    }

    res.status(200).send();
  } catch (e) {
    next(e);
  }
});

export default router;
