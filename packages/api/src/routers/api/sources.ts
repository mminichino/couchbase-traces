import { validateSourceForConnectionKind } from '@couchbase-traces/common-utils/dist/couchbase/source';
import {
  SourceSchema,
  SourceSchemaNoId,
} from '@couchbase-traces/common-utils/dist/types';
import express from 'express';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import {
  getConnectionById,
  validateConnectionId,
} from '@/controllers/connection';
import {
  createSource,
  deleteSource,
  getSources,
  updateSource,
} from '@/controllers/sources';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import { rejectPromqlBody } from '@/utils/rejectPromql';
import { objectIdSchema } from '@/utils/zod';

const router = express.Router();

/** Applies the per-connection-kind source rules; null when the source is valid. */
async function checkSourceForConnection(
  teamId: string,
  source: Parameters<typeof validateSourceForConnectionKind>[0] & {
    connection: string;
  },
): Promise<string | null> {
  const connection = await getConnectionById(teamId, source.connection);
  return validateSourceForConnectionKind(
    source,
    connection?.kind ?? 'clickhouse',
  );
}

router.get('/', async (req, res, next) => {
  try {
    const { teamId } = getNonNullUserWithTeam(req);

    const sources = await getSources(teamId.toString());

    return res.json(
      sources.map(
        // @ts-expect-error source.toJSON has incompatible type signatures but is actually a safe operation
        source => source.toJSON({ getters: true }),
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.post(
  '/',
  rejectPromqlBody,
  validateRequest({
    body: SourceSchemaNoId,
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);

      const connectionCheck = await validateConnectionId(
        req.body.connection,
        teamId,
      );
      if (!connectionCheck.ok) {
        return res
          .status(connectionCheck.status)
          .json({ message: connectionCheck.message });
      }

      const sourceError = await checkSourceForConnection(
        teamId.toString(),
        req.body,
      );
      if (sourceError) {
        return res.status(400).json({ message: sourceError });
      }

      const source = await createSource(teamId.toString(), {
        ...req.body,
        team: teamId.toString(),
      });

      res.json(source);
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  '/:id',
  rejectPromqlBody,
  validateRequest({
    body: SourceSchema,
    params: z.object({
      id: objectIdSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);

      const connectionCheck = await validateConnectionId(
        req.body.connection,
        teamId,
      );
      if (!connectionCheck.ok) {
        return res
          .status(connectionCheck.status)
          .json({ message: connectionCheck.message });
      }

      const sourceError = await checkSourceForConnection(
        teamId.toString(),
        req.body,
      );
      if (sourceError) {
        return res.status(400).json({ message: sourceError });
      }

      const source = await updateSource(teamId.toString(), req.params.id, {
        ...req.body,
        team: teamId.toString(),
      });

      if (!source) {
        res.status(404).send('Source not found');
        return;
      }

      return res.status(200).send();
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  '/:id',
  validateRequest({
    params: z.object({
      id: objectIdSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const { teamId } = getNonNullUserWithTeam(req);

      await deleteSource(teamId.toString(), req.params.id);

      return res.status(200).send();
    } catch (e) {
      next(e);
    }
  },
);

export default router;
