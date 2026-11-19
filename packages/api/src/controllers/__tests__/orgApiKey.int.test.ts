import mongoose from 'mongoose';

import {
  createOrgApiKey,
  listOrgApiKeys,
  revokeOrgApiKey,
  touchOrgApiKeyLastUsed,
  updateOrgApiKeyDescription,
} from '@/controllers/orgApiKey';
import { createTeam } from '@/controllers/team';
import {
  createVirtualUser,
  deleteTeamMember,
  findUserByAccessKey,
  findUsersByTeam,
  hashOrgApiKey,
} from '@/controllers/user';
import { clearDBCollections, closeDB, connectDB } from '@/fixtures';
import { getMetadataStore } from '@/metadata';
import { AlertSource, AlertThresholdType } from '@/metadata/schemas/alert';
import { findUser, getUserDoc, seedUser } from '@/metadata/testing/seed';

const DAY_MS = 24 * 60 * 60 * 1000;

const ALERT_FIELDS = {
  channel: { type: 'webhook' as const, webhookId: 'w' },
  interval: '5m' as const,
  threshold: 1,
  thresholdType: AlertThresholdType.ABOVE,
  source: AlertSource.SAVED_SEARCH,
};

describe('orgApiKey controller', () => {
  const creator = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    await clearDBCollections();
  });

  afterAll(async () => {
    await closeDB();
  });

  const create = async (
    teamId: string,
    expiry: '30d' | '1y' | 'never' = '30d',
  ) =>
    createOrgApiKey(teamId, creator, {
      description: 'terraform',
      expiry,
    });

  it('returns a prefixed key once and stores only its hash', async () => {
    const team = await createTeam({ name: 'A' });
    const { doc, key } = await create(team._id);

    expect(key).toMatch(/^hdx_org_[A-Za-z0-9_-]{43}$/);
    const stored = await getUserDoc(doc._id);
    expect(stored?.accessKey).toBe(hashOrgApiKey(key));
    expect(Object.values(stored ?? {})).not.toContain(key);
  });

  it.each([
    ['30d', 30 * DAY_MS],
    ['1y', 365 * DAY_MS],
  ] as const)('sets expiresAt for %s', async (expiry, offset) => {
    const team = await createTeam({ name: 'A' });
    const before = Date.now();
    const { doc } = await create(team._id, expiry);
    const expiresAt = doc.expiresAt?.getTime() ?? 0;
    expect(Math.abs(expiresAt - (before + offset))).toBeLessThan(1000);
  });

  it('stores null expiresAt for never', async () => {
    const team = await createTeam({ name: 'A' });
    const { doc } = await create(team._id, 'never');
    expect(doc.expiresAt).toBeNull();
  });

  it('finds active keys and rejects expired, unknown, and non-org keys', async () => {
    const team = await createTeam({ name: 'A' });
    const { doc, key } = await create(team._id);

    expect((await findUserByAccessKey(key))?._id).toEqual(doc._id);
    expect(
      await findUserByAccessKey(key, doc.expiresAt ?? new Date(0)),
    ).toBeNull();
    expect(await findUserByAccessKey(`hdx_org_${'x'.repeat(43)}`)).toBeNull();
    expect(
      await findUserByAccessKey('4b9e3c1a-7f2d-4e8b-9a6c-1d2e3f4a5b6c'),
    ).toBeNull();
    // The stored hash is not a credential.
    expect(await findUserByAccessKey(hashOrgApiKey(key))).toBeNull();
  });

  it('scopes list and delete to the team', async () => {
    const teamA = await createTeam({ name: 'A' });
    // OSS allows a single team, so team B only needs to be a distinct id.
    const teamB = new mongoose.Types.ObjectId().toString();
    const { doc } = await create(teamA._id);

    expect(await listOrgApiKeys(teamB)).toHaveLength(0);
    expect(await revokeOrgApiKey(teamB, doc._id.toString())).toBeNull();
    expect(await listOrgApiKeys(teamA._id)).toHaveLength(1);
  });

  it('leaves virtual users that are not org keys alone', async () => {
    const team = await createTeam({ name: 'A' });
    const other = await createVirtualUser({
      teamId: team._id,
      name: 'actor',
      email: 'actor@example.com',
    });

    expect(await listOrgApiKeys(team._id)).toHaveLength(0);
    expect(await revokeOrgApiKey(team._id, other._id.toString())).toBeNull();
  });

  it('writes lastUsedAt at most once per 5 minutes', async () => {
    const team = await createTeam({ name: 'A' });
    const { doc } = await create(team._id);
    const t0 = new Date();

    const lastUsed = async () => {
      // Writes are fire-and-forget; give them a moment to land.
      await new Promise(r => setTimeout(r, 100));
      return (await findUser(doc._id))?.lastUsedAt?.getTime();
    };

    touchOrgApiKeyLastUsed(doc, t0);
    expect(await lastUsed()).toBe(t0.getTime());

    const fresh = (await findUser(doc._id))!;
    touchOrgApiKeyLastUsed(fresh, new Date(t0.getTime() + 60_000));
    expect(await lastUsed()).toBe(t0.getTime());

    // A request holding a stale copy passes the in-memory check, so only the
    // conditional filter stops it overwriting a recent write.
    touchOrgApiKeyLastUsed(
      { _id: doc._id, lastUsedAt: null },
      new Date(t0.getTime() + 60_000),
    );
    expect(await lastUsed()).toBe(t0.getTime());

    const t6 = new Date(t0.getTime() + 6 * 60_000);
    touchOrgApiKeyLastUsed(fresh, t6);
    expect(await lastUsed()).toBe(t6.getTime());
  });

  describe('service accounts', () => {
    it('creates a service account user for each key', async () => {
      const team = await createTeam({ name: 'A' });
      const { doc } = await create(team._id);
      const account = await findUser(doc._id);

      expect(account).toMatchObject({
        isVirtual: true,
        name: 'terraform',
      });
      expect(account?.team).toEqual(team._id);
      expect(account?.email).toMatch(
        /^sa-[0-9a-f]{24}@service-accounts\.hyperdx\.invalid$/,
      );
    });

    it('keeps service accounts out of members', async () => {
      const team = await createTeam({ name: 'A' });
      await create(team._id);
      expect(await findUsersByTeam(team._id)).toHaveLength(0);
    });

    it('renames the service account with the key', async () => {
      const team = await createTeam({ name: 'A' });
      const { doc } = await create(team._id);
      await updateOrgApiKeyDescription(team._id, doc._id.toString(), 'ci');
      expect((await findUser(doc._id))?.name).toBe('ci');
    });

    it('keeps the service account when the key is revoked', async () => {
      const team = await createTeam({ name: 'A' });
      const { doc, key } = await create(team._id);
      await revokeOrgApiKey(team._id, doc._id.toString());
      expect(await findUserByAccessKey(key)).toBeNull();
      expect(await listOrgApiKeys(team._id)).toHaveLength(0);
      expect(await findUser(doc._id)).not.toBeNull();
    });
  });

  describe('member removal by a service account', () => {
    const setupTeam = async (people: number) => {
      const team = await createTeam({ name: 'A' });
      const { doc } = await create(team._id);
      const users = await Promise.all(
        Array.from({ length: people }, (_, i) =>
          seedUser({ email: `p${i}@example.com`, team: team._id }),
        ),
      );
      return { team, serviceAccount: doc._id, users };
    };

    afterEach(() => jest.restoreAllMocks());

    it('removes a member and hands their alerts to the requester', async () => {
      const { team, serviceAccount, users } = await setupTeam(2);
      const alert = await getMetadataStore().alerts.create(team._id, {
        ...ALERT_FIELDS,
        createdBy: users[0]._id.toString(),
      });

      const result = await deleteTeamMember(
        team._id,
        users[0]._id.toString(),
        serviceAccount,
      );
      expect(result).toBe('deleted');
      expect(await findUser(users[0]._id)).toBeNull();
      expect(
        (await getMetadataStore().alerts.get(team._id, alert._id))?.createdBy,
      ).toBe(serviceAccount.toString());
    });

    it('keeps the member when the team would be left empty', async () => {
      const { team, serviceAccount, users } = await setupTeam(1);
      const result = await deleteTeamMember(
        team._id,
        users[0]._id.toString(),
        serviceAccount,
      );
      expect(result).toBe('last_member');
      expect(await findUser(users[0]._id)).not.toBeNull();
    });
  });
});
