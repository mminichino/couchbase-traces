import type {
  RotateApiKeyApiResponse,
  TeamApiResponse,
  TeamInvitationsApiResponse,
  TeamMembersApiResponse,
  TeamTagsApiResponse,
  UpdateQuerySettingsApiResponse,
} from '@couchbase-traces/common-utils/dist/types';
import {
  TagResourceTypeSchema,
  TeamQuerySettingsUpdateSchema,
} from '@couchbase-traces/common-utils/dist/types';
import express from 'express';
import pick from 'lodash/pick';
import { z } from 'zod';
import { processRequest, validateRequest } from 'zod-express-middleware';

import {
  getTags,
  getTeam,
  getTeamInviteUrl,
  rotateTeamApiKey,
  setTeamName,
  updateTeamQuerySettings,
} from '@/controllers/team';
import {
  deleteTeamInvite,
  getOrCreateTeamInvite,
  listTeamInvites,
} from '@/controllers/teamInvite';
import {
  deleteTeamMember,
  findUserByEmail,
  findUsersByTeam,
} from '@/controllers/user';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import orgApiKeysRouter from '@/routers/api/orgApiKeys';
import { sendJson } from '@/utils/serialization';
import { idSchema } from '@/utils/zod';

const router = express.Router();

type TeamApiExpRes = express.Response<TeamApiResponse>;
router.get('/', async (req, res: TeamApiExpRes, next) => {
  try {
    const teamId = req.user?.team;
    const userId = req.user?._id;

    if (teamId == null) {
      throw new Error(`User ${req.user?._id} not associated with a team`);
    }
    if (userId == null) {
      throw new Error(`User has no id`);
    }

    const fields = [
      '_id',
      'allowedAuthMethods',
      'apiKey',
      'name',
      'createdAt',
      'isMetricsSeriesTableEnabled',
    ] as const;
    const team = await getTeam(teamId, fields);
    if (team == null) {
      throw new Error(`Team ${teamId} not found for user ${userId}`);
    }

    sendJson(res, team);
  } catch (e) {
    next(e);
  }
});

type RotateApiKeyExpRes = express.Response<RotateApiKeyApiResponse>;
router.patch('/apiKey', async (req, res: RotateApiKeyExpRes, next) => {
  try {
    const teamId = req.user?.team;
    if (teamId == null) {
      throw new Error(`User ${req.user?._id} not associated with a team`);
    }
    const team = await rotateTeamApiKey(teamId);
    if (team?.apiKey == null) {
      throw new Error(`Failed to rotate API key for team ${teamId}`);
    }
    res.json({ newApiKey: team.apiKey });
  } catch (e) {
    next(e);
  }
});

router.patch(
  '/name',
  validateRequest({
    body: z.object({
      name: z.string().min(1).max(100),
    }),
  }),
  async (req, res, next) => {
    try {
      const teamId = req.user?.team;
      if (teamId == null) {
        throw new Error(`User ${req.user?._id} not associated with a team`);
      }
      const { name } = req.body;
      const team = await setTeamName(teamId, name);
      res.json({ name: team?.name });
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  '/query-settings',
  processRequest({
    body: TeamQuerySettingsUpdateSchema,
  }),
  async (req, res: express.Response<UpdateQuerySettingsApiResponse>, next) => {
    try {
      const teamId = req.user?.team;
      if (teamId == null) {
        throw new Error(`User ${req.user?._id} not associated with a team`);
      }

      if (Object.keys(req.body).length === 0) {
        return res.json({});
      }

      const team = await updateTeamQuerySettings(teamId, req.body);

      res.json(pick(team, Object.keys(req.body)));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/invitation',
  validateRequest({
    body: z.object({
      email: z.string().email(),
      name: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { email: toEmail, name } = req.body;
      const teamId = req.user?.team;
      const fromEmail = req.user?.email;

      if (teamId == null) {
        throw new Error(`User ${req.user?._id} not associated with a team`);
      }

      if (fromEmail == null) {
        throw new Error(`User ${req.user?._id} doesnt have email`);
      }

      const toUser = await findUserByEmail(toEmail);
      if (toUser) {
        return res.status(400).json({
          message:
            'User already exists. Please contact Couchbase Traces team for support',
        });
      }

      // Reuses a pending invite for the (lowercased) email.
      const teamInvite = await getOrCreateTeamInvite(teamId, {
        email: toEmail,
        name,
      });

      res.json({
        url: getTeamInviteUrl(teamInvite.token),
      });
    } catch (e) {
      next(e);
    }
  },
);

type TeamInviteExpressRes = express.Response<TeamInvitationsApiResponse>;
router.get('/invitations', async (req, res: TeamInviteExpressRes, next) => {
  try {
    const teamId = req.user?.team;
    if (teamId == null) {
      throw new Error(`User ${req.user?._id} not associated with a team`);
    }
    const teamInvites = await listTeamInvites(teamId);
    res.json({
      data: teamInvites.map(ti => ({
        _id: ti._id,
        createdAt: ti.createdAt.toISOString(),
        email: ti.email,
        name: ti.name,
        url: getTeamInviteUrl(ti.token),
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.delete(
  '/invitation/:id',
  validateRequest({
    params: z.object({
      id: idSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const id = req.params.id;
      // Throws rather than reading `req.user?.team` directly. A filter drops an
      // undefined value entirely, so a teamless caller would
      // turn the scoped delete below back into the unscoped one this guard
      // exists to prevent — any authenticated user revoking any team's
      // pending invitation given its id.
      const { teamId } = getNonNullUserWithTeam(req);

      const deleted = await deleteTeamInvite(teamId, id);
      if (!deleted) {
        return res.sendStatus(404);
      }

      return res.json({ message: 'TeamInvite deleted' });
    } catch (e) {
      next(e);
    }
  },
);

type TeamMembersExpRes = express.Response<TeamMembersApiResponse>;
router.get('/members', async (req, res: TeamMembersExpRes, next) => {
  try {
    const teamId = req.user?.team;
    const userId = req.user?._id;
    if (teamId == null) {
      throw new Error(`User ${req.user?._id} not associated with a team`);
    }
    if (userId == null) {
      throw new Error(`User has no id`);
    }
    const teamUsers = await findUsersByTeam(teamId);
    res.json({
      data: teamUsers.map(user => ({
        ...pick(user, ['_id', 'email', 'name', 'hasPasswordAuth']),
        isCurrentUser: user._id === userId,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.delete(
  '/member/:id',
  validateRequest({
    params: z.object({
      id: idSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const userIdToDelete = req.params.id;
      const teamId = req.user?.team;
      if (teamId == null) {
        throw new Error(`User ${req.user?._id} not associated with a team`);
      }

      const userIdRequestingDelete = req.user?._id;
      if (!userIdRequestingDelete) {
        throw new Error(`Requesting user has no id`);
      }

      const result = await deleteTeamMember(
        teamId,
        userIdToDelete,
        userIdRequestingDelete,
      );
      if (result === 'last_member') {
        return res
          .status(400)
          .json({ message: 'Cannot remove the last team member' });
      }

      res.json({ message: 'User deleted' });
    } catch (e) {
      next(e);
    }
  },
);

type TeamTagsExpRes = express.Response<TeamTagsApiResponse>;
router.get(
  '/tags',
  processRequest({
    query: z.object({
      /** Limits the response to tags applied to this kind of entity */
      resourceType: TagResourceTypeSchema.optional(),
    }),
  }),
  async (req, res: TeamTagsExpRes, next) => {
    try {
      const teamId = req.user?.team;
      if (teamId == null) {
        throw new Error(`User ${req.user?._id} not associated with a team`);
      }
      const tags = await getTags(teamId, req.query.resourceType);
      return res.json({ data: tags });
    } catch (e) {
      next(e);
    }
  },
);

router.use('/api-keys', orgApiKeysRouter);

export default router;
