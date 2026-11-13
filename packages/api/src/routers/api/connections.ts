import { clusterCache } from '@couchbase-traces/common-utils/dist/couchbase/node';
import {
  ConnectionSchema,
  ConnectionSchemaNoId,
} from '@couchbase-traces/common-utils/dist/types';
import express from 'express';
import { validateRequest } from 'zod-express-middleware';

import {
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

    res.json(connections.map(c => c.toJSON({ virtuals: true })));
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

      const connection = await createConnection(
        teamId.toString(),
        body.kind === 'couchbase'
          ? { ...body, password: body.password ?? '', team: teamId }
          : {
              ...body,
              password: body.password ?? '',
              team: teamId,
              hyperdxSettingPrefix: body.hyperdxSettingPrefix ?? undefined,
            },
      );

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
      if (body.kind !== storedKind) {
        res.status(400).json({
          message: `Connection kind cannot change from ${storedKind} to ${body.kind}`,
        });
        return;
      }

      // Secrets are write-only: an omitted or empty value keeps the stored one.
      const password = body.password || connection.password;
      let newConnection;
      const unsetFields: string[] = [];
      if (body.kind === 'couchbase') {
        const { tlsCaCertificate, ...rest } = body;
        newConnection = {
          ...rest,
          team: teamId,
          password,
          ...(tlsCaCertificate ? { tlsCaCertificate } : {}),
        };
      } else {
        // Read from the raw body: the schema rejects '', which clears the prefix.
        const rawPrefix: unknown = Reflect.get(
          Object(req.body),
          'hyperdxSettingPrefix',
        );
        const shouldUnsetPrefix = rawPrefix === null || rawPrefix === '';
        const { hyperdxSettingPrefix, ...rest } = body;
        newConnection = {
          ...rest,
          team: teamId,
          password,
          ...(!shouldUnsetPrefix && hyperdxSettingPrefix
            ? { hyperdxSettingPrefix }
            : {}),
        };
        if (shouldUnsetPrefix) unsetFields.push('hyperdxSettingPrefix');
      }

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
