import request, { SuperAgentTest } from 'supertest';

import { createOrgApiKey } from '@/controllers/orgApiKey';
import { getLoggedInAgent, getServer } from '@/fixtures';
import { getMetadataStore } from '@/metadata';
import { newId } from '@/metadata/ids';
import type { ITeam } from '@/metadata/schemas/team';
import type { IUser } from '@/metadata/schemas/user';
import { getAlert, seedAlert } from '@/metadata/testing/alertFixtures';
import { findUser, getUserDoc, seedUser } from '@/metadata/testing/seed';

const TEAM_BASE_URL = '/api/v2/team';

describe('External API v2 Team', () => {
  const server = getServer();
  let agent: SuperAgentTest;
  let team: ITeam;
  let user: IUser;

  beforeAll(async () => {
    await server.start();
  });

  beforeEach(async () => {
    const result = await getLoggedInAgent(server);
    agent = result.agent;
    team = result.team;
    user = result.user;
  });

  afterEach(async () => {
    await server.clearDBs();
  });

  afterAll(async () => {
    await server.stop();
  });

  const authRequest = (
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
  ) => agent[method](url).set('Authorization', `Bearer ${user?.accessKey}`);

  describe('GET /api/v2/team', () => {
    it('returns the team id and name', async () => {
      const response = await authRequest('get', TEAM_BASE_URL).expect(200);
      expect(response.body.data.id).toBe(team._id.toString());
      expect(response.body.data).toHaveProperty('name');
    });

    it('requires authentication', async () => {
      await request(server.getHttpServer()).get(TEAM_BASE_URL).expect(401);
    });
  });

  describe('GET /api/v2/team/members', () => {
    it('returns the current user', async () => {
      const response = await authRequest(
        'get',
        `${TEAM_BASE_URL}/members`,
      ).expect(200);
      const me = response.body.data.find(
        (m: { email: string }) => m.email === user.email,
      );
      expect(me).toBeTruthy();
      expect(me.isCurrentUser).toBe(true);
    });
  });

  describe('Invitations', () => {
    it('creates a pending invitation and lists then deletes it', async () => {
      const inviteRes = await authRequest('post', `${TEAM_BASE_URL}/invitation`)
        .send({ email: 'oss-invitee@example.com' })
        .expect(200);
      expect(inviteRes.body.data.status).toBe('pending');
      expect(inviteRes.body.data.url).toContain('/join-team?token=');
      const invitationId = inviteRes.body.data.invitationId;

      const listRes = await authRequest(
        'get',
        `${TEAM_BASE_URL}/invitations`,
      ).expect(200);
      expect(
        listRes.body.data.some(
          (i: { email: string }) => i.email === 'oss-invitee@example.com',
        ),
      ).toBe(true);

      await authRequest(
        'delete',
        `${TEAM_BASE_URL}/invitation/${invitationId}`,
      ).expect(200);
    });

    it('rejects inviting an existing user', async () => {
      await authRequest('post', `${TEAM_BASE_URL}/invitation`)
        .send({ email: user.email })
        .expect(400);
    });

    it('handles concurrent invites for the same email idempotently', async () => {
      const email = 'race@example.com';
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          authRequest('post', `${TEAM_BASE_URL}/invitation`).send({ email }),
        ),
      );

      // No request should 500 on the {teamId, email} unique-index race.
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      // All requests resolve to the same single invitation.
      const ids = new Set(responses.map(r => r.body.data.invitationId));
      expect(ids.size).toBe(1);

      const listRes = await authRequest(
        'get',
        `${TEAM_BASE_URL}/invitations`,
      ).expect(200);
      expect(
        listRes.body.data.filter((i: { email: string }) => i.email === email)
          .length,
      ).toBe(1);
    });
  });

  describe('org API keys', () => {
    const createKey = async () =>
      (
        await createOrgApiKey(team._id, user._id, {
          description: 'terraform',
          expiry: 'never',
        })
      ).key;

    const withKey = (key: string, req: request.Test) =>
      req.set('Authorization', `Bearer ${key}`);

    const serviceAccounts = () =>
      getMetadataStore().users.listOrgKeys(team._id);

    const createMember = () =>
      seedUser({ email: 'member@example.com', team: team._id });

    it('lists members without the key or anyone marked as the caller', async () => {
      const key = await createKey();
      const res = await withKey(
        key,
        agent.get(`${TEAM_BASE_URL}/members`),
      ).expect(200);
      expect(res.body.data.map((m: { email: string }) => m.email)).toEqual([
        user.email,
      ]);
      expect(res.body.data[0].isCurrentUser).toBe(false);
    });

    it("can't reach an invite link", async () => {
      const key = await createKey();
      await withKey(key, agent.post(`${TEAM_BASE_URL}/invitation`))
        .send({ email: 'new@example.com' })
        .expect(403);

      await authRequest('post', `${TEAM_BASE_URL}/invitation`)
        .send({ email: 'new@example.com' })
        .expect(200);
      const list = await withKey(
        key,
        agent.get(`${TEAM_BASE_URL}/invitations`),
      ).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).not.toHaveProperty('url');
    });

    it('can remove members', async () => {
      const key = await createKey();
      const member = await createMember();
      const alert = await seedAlert({
        team: team._id,
        threshold: 1,
        interval: '5m',
        thresholdType: 'above',
        source: 'saved_search',
        channel: { type: 'webhook', webhookId: 'x' },
        createdBy: member._id,
      });

      await withKey(
        key,
        agent.delete(`${TEAM_BASE_URL}/member/${member._id}`),
      ).expect(200);
      expect(await findUser(member._id)).toBeNull();
      const stored = await getAlert(alert._id);
      const [account] = await serviceAccounts();
      expect(stored?.createdBy?.toString()).toEqual(account?._id);
    });

    it('stops a key removing the last member', async () => {
      const key = await createKey();
      const res = await withKey(
        key,
        agent.delete(`${TEAM_BASE_URL}/member/${user._id}`),
      ).expect(400);
      expect(res.body.message).toBe('Cannot remove the last team member');
      // The member is deleted then put back, and must keep their credentials.
      const restored = await getUserDoc(user._id);
      expect(restored?.hash).toBeTruthy();
      expect(restored?.accessKey).toBe(user.accessKey);
    });

    it('keeps a member when a key removes the last two at once', async () => {
      const key = await createKey();
      const member = await createMember();
      const results = await Promise.all(
        [user._id, member._id].map(id =>
          withKey(key, agent.delete(`${TEAM_BASE_URL}/member/${id}`)),
        ),
      );
      expect(results.map(r => r.status).sort()).not.toEqual([200, 200]);
      expect(
        await getMetadataStore().users.countPeople(team._id),
      ).toBeGreaterThan(0);
    });

    it('returns 404 for a non-member before applying the last-member rule', async () => {
      const key = await createKey();
      await withKey(
        key,
        agent.delete(`${TEAM_BASE_URL}/member/${newId()}`),
      ).expect(404);
    });

    it('hides service accounts from members and member removal', async () => {
      await createKey();
      const [account] = await serviceAccounts();

      const list = await authRequest('get', `${TEAM_BASE_URL}/members`).expect(
        200,
      );
      expect(list.body.data.map((m: { id: string }) => m.id)).not.toContain(
        account?._id.toString(),
      );

      const alert = await seedAlert({
        team: team._id,
        threshold: 1,
        interval: '5m',
        thresholdType: 'above',
        source: 'saved_search',
        channel: { type: 'webhook', webhookId: 'x' },
        createdBy: account?._id,
      });

      await authRequest(
        'delete',
        `${TEAM_BASE_URL}/member/${account?._id}`,
      ).expect(404);
      expect(await findUser(account?._id)).not.toBeNull();
      expect((await getAlert(alert._id))?.createdBy?.toString()).toEqual(
        account?._id,
      );
    });
  });
});
