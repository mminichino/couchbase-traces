import { authenticate } from '@/metadata/auth/localStrategy';
import { AUTH_ERRORS, UserExistsError } from '@/metadata/auth/password';
import { DuplicateKeyError } from '@/metadata/errors';
import { isValidId } from '@/metadata/ids';
import { INVITE_CLAIM_WAIT_MS } from '@/metadata/repos/teamInvites';
import { hashOrgApiKey } from '@/metadata/repos/users';
import { createMemoryStore } from '@/metadata/testing/memoryStore';
import { claimUnique } from '@/metadata/unique';

// scrypt at N=32768 is ~100ms per hash; a few per test is fine.
jest.setTimeout(30_000);

const PASSWORD = 'TacoCat!2#4X';

function setup() {
  let now = new Date('2026-01-01T00:00:00Z');
  const store = createMemoryStore({ now: () => now });
  return {
    store,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('TeamRepository', () => {
  it('creates the single team and refuses a second', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    expect(isValidId(team._id)).toBe(true);
    expect(team).toMatchObject({
      name: 'A',
      allowedAuthMethods: [],
      collectorAuthenticationEnforced: false,
      isMetricsSeriesTableEnabled: false,
    });
    await expect(store.teams.createFirst({ name: 'B' })).rejects.toBeInstanceOf(
      DuplicateKeyError,
    );
    expect(await store.teams.exists()).toBe(true);
    expect((await store.teams.getOnly())?._id).toBe(team._id);
  });

  it('looks up by api key and rotates it', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    expect((await store.teams.getByApiKey(team.apiKey))?._id).toBe(team._id);
    const rotated = await store.teams.rotateApiKey(team._id);
    expect(rotated?.apiKey).not.toBe(team.apiKey);
    expect(await store.teams.getByApiKey(team.apiKey)).toBeNull();
    expect((await store.teams.getByApiKey(rotated!.apiKey))?._id).toBe(
      team._id,
    );
  });

  it('sets and unsets query settings', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const set = await store.teams.updateQuerySettings(team._id, {
      searchRowLimit: 500,
    });
    expect(set?.searchRowLimit).toBe(500);
    const unset = await store.teams.updateQuerySettings(team._id, {
      searchRowLimit: null,
    });
    expect(unset).not.toHaveProperty('searchRowLimit');
  });

  it('returns null for malformed and unknown ids', async () => {
    const { store } = setup();
    expect(await store.teams.getById('nope')).toBeNull();
    expect(await store.teams.getById('0'.repeat(24))).toBeNull();
  });

  it('frees the singleton when the team is removed', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    await store.teams.remove(team._id);
    expect(await store.teams.exists()).toBe(false);
    await expect(store.teams.createFirst({ name: 'B' })).resolves.toBeTruthy();
  });
});

describe('UserRepository', () => {
  const register = (
    store: ReturnType<typeof setup>['store'],
    team: string,
    email = 'Fake@Example.com',
  ) => store.users.register({ email, team }, PASSWORD);

  it('registers with a lowercased email and no secret on the result', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const user = await register(store, team._id);
    expect(user.email).toBe('fake@example.com');
    expect(user).not.toHaveProperty('hash');
    expect(user.hasPasswordAuth).toBe(true);
    expect((await store.users.getByEmail('FAKE@example.com'))?._id).toBe(
      user._id,
    );
  });

  it('keeps the legacy auth errors', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    await register(store, team._id);
    await expect(register(store, team._id)).rejects.toBeInstanceOf(
      UserExistsError,
    );
    await expect(
      store.users.register({ email: 'x@y.z', team: team._id }, ''),
    ).rejects.toThrow(AUTH_ERRORS.missingPassword);
    await expect(
      store.users.register({ email: '', team: team._id }, PASSWORD),
    ).rejects.toThrow(AUTH_ERRORS.missingUsername);
  });

  it('authenticates with the same messages', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const user = await register(store, team._id);
    expect(
      (await authenticate(store.users, 'fake@example.com', PASSWORD)).user,
    ).toMatchObject({ _id: user._id });
    expect(
      await authenticate(store.users, 'fake@example.com', 'wrong'),
    ).toEqual({ user: false, message: AUTH_ERRORS.incorrect });
    expect(await authenticate(store.users, 'nobody@x.y', PASSWORD)).toEqual({
      user: false,
      message: AUTH_ERRORS.incorrect,
    });
  });

  it('never authenticates a virtual user', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const virtual = await store.users.createVirtual({
      teamId: team._id,
      name: 'sa',
      email: 'sa@x.invalid',
    });
    expect(
      (await authenticate(store.users, virtual.email, PASSWORD)).virtual,
    ).toBe(true);
  });

  it('resolves access keys: people by uuid, org keys by prefix + hash', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const user = await register(store, team._id);
    expect((await store.users.getByAccessKey(user.accessKey))?._id).toBe(
      user._id,
    );
    const key = 'hdx_org_' + 'k'.repeat(43);
    const org = await store.users.createVirtual({
      teamId: team._id,
      name: 'ci',
      email: 'sa-1@x.invalid',
      accessKey: hashOrgApiKey(key),
      createdBy: user._id,
      expiresAt: new Date('2026-02-01T00:00:00Z'),
    });
    expect((await store.users.getByAccessKey(key))?._id).toBe(org._id);
    expect(await store.users.getByAccessKey(hashOrgApiKey(key))).toBeNull();
    expect(
      await store.users.getByAccessKey(key, new Date('2026-03-01T00:00:00Z')),
    ).toBeNull();
    await store.users.revokeOrgKey(team._id, org._id, new Date());
    expect(await store.users.getByAccessKey(key)).toBeNull();
  });

  it('rotates the personal access key with no grace period', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const user = await register(store, team._id);
    const rotated = await store.users.rotateAccessKey(user._id);
    expect(await store.users.getByAccessKey(user.accessKey)).toBeNull();
    expect((await store.users.getByAccessKey(rotated!.accessKey))?._id).toBe(
      user._id,
    );
  });

  it('lists members, org keys, and displays', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const user = await register(store, team._id);
    await store.users.createVirtual({
      teamId: team._id,
      name: 'ci',
      email: 'sa-1@x.invalid',
      createdBy: user._id,
    });
    await store.users.createVirtual({
      teamId: team._id,
      name: 'actor',
      email: 'actor@x.invalid',
    });
    expect((await store.users.listByTeam(team._id)).map(u => u._id)).toEqual([
      user._id,
    ]);
    expect(await store.users.countPeople(team._id)).toBe(1);
    expect((await store.users.listOrgKeys(team._id)).map(u => u.name)).toEqual([
      'ci',
    ]);
    const displays = await store.users.getDisplay([user._id, null, 'bad']);
    expect([...displays.values()]).toEqual([
      // The user has no name, so the field is omitted (populate parity).
      { _id: user._id, email: 'fake@example.com' },
    ]);
  });

  it('records onboarding tasks once and skips virtual users', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const user = await register(store, team._id);
    await store.users.recordOnboardingTask(user._id, 'dashboard');
    await store.users.recordOnboardingTask(user._id, 'dashboard');
    expect(
      (await store.users.getById(user._id))?.onboardingData.completedTasks,
    ).toEqual(['dashboard']);
    const sa = await store.users.createVirtual({
      teamId: team._id,
      name: 'sa',
      email: 'sa@x.invalid',
    });
    await store.users.recordOnboardingTask(sa._id, 'alert');
    expect(
      (await store.users.getById(sa._id))?.onboardingData.completedTasks,
    ).toEqual([]);
  });

  it('writes lastUsedAt only when stale', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const sa = await store.users.createVirtual({
      teamId: team._id,
      name: 'sa',
      email: 'sa@x.invalid',
    });
    const t0 = new Date('2026-01-01T00:00:00Z');
    await store.users.touchLastUsed(sa._id, t0, new Date(0));
    await store.users.touchLastUsed(sa._id, new Date(t0.getTime() + 1), t0);
    expect((await store.users.getById(sa._id))?.lastUsedAt).toEqual(t0);
  });

  it('removes a member, freeing the email, and refuses the last person', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const first = await register(store, team._id);
    const second = await register(store, team._id, 'second@example.com');
    const other = '0'.repeat(24);
    expect(await store.users.removeMember(other, second._id, first._id)).toBe(
      'not_found',
    );
    expect(
      await store.users.removeMember(team._id, second._id, first._id),
    ).toBe('deleted');
    expect(await store.users.getByEmail(second.email)).toBeNull();
    expect(
      await store.users.removeMember(team._id, second._id, first._id),
    ).toBe('not_found');
    expect(await store.users.removeMember(team._id, first._id, first._id)).toBe(
      'last_member',
    );
    expect(await store.users.getById(first._id)).not.toBeNull();
  });
});

describe('TeamInviteRepository', () => {
  it('creates one invite per team and email, case-insensitively', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const a = await store.teamInvites.getOrCreate(team._id, {
      email: 'X@Y.z',
      name: 'X',
    });
    const b = await store.teamInvites.getOrCreate(team._id, { email: 'x@y.z' });
    expect(b._id).toBe(a._id);
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await store.teamInvites.getByToken(a.token))?._id).toBe(a._id);
    expect(await store.teamInvites.listByTeam(team._id)).toHaveLength(1);
  });

  it('expires invites after 30 days', async () => {
    const { store, advance } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const invite = await store.teamInvites.getOrCreate(team._id, {
      email: 'x@y.z',
    });
    advance(30 * 24 * 60 * 60 * 1000);
    expect(await store.teamInvites.getByToken(invite.token)).toBeNull();
    const fresh = await store.teamInvites.getOrCreate(team._id, {
      email: 'x@y.z',
    });
    expect(fresh._id).not.toBe(invite._id);
  });

  it('scopes delete to the team and consume is idempotent', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    const invite = await store.teamInvites.getOrCreate(team._id, {
      email: 'x@y.z',
    });
    expect(
      await store.teamInvites.deleteForTeam('0'.repeat(24), invite._id),
    ).toBe(false);
    await store.teamInvites.consume(invite._id);
    await store.teamInvites.consume(invite._id);
    expect(await store.teamInvites.getByToken(invite.token)).toBeNull();
    expect(await store.teamInvites.deleteForTeam(team._id, invite._id)).toBe(
      false,
    );
  });
});

describe('TeamInviteRepository concurrent creates (D13)', () => {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  /** Delays every team_invites insert, widening the claim-to-insert gap. */
  function delayInviteInserts(
    store: ReturnType<typeof setup>['store'],
    ms: (n: number) => number,
  ) {
    const insert = store.kv.insert.bind(store.kv);
    let n = 0;
    jest
      .spyOn(store.kv, 'insert')
      .mockImplementation(async (c, key, value, o) => {
        if (c === 'team_invites') await sleep(ms(n++));
        return insert(c, key, value, o);
      });
  }

  it('returns the winner’s invite to every concurrent caller', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    delayInviteInserts(store, () => 50);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        store.teamInvites.getOrCreate(team._id, { email: 'race@x.io' }),
      ),
    );

    expect(results.filter(r => r.status === 'rejected')).toEqual([]);
    const ids = results.map(r => r.status === 'fulfilled' && r.value._id);
    expect(new Set(ids).size).toBe(1);
    expect(await store.teamInvites.listByTeam(team._id)).toHaveLength(1);
  });

  it('takes over a claim whose invite never appears', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    // A crash between the member claim and the invite insert.
    await claimUnique(
      store.kv,
      'invite_member',
      [team._id, 'gone@x.io'],
      '0'.repeat(24),
    );

    const started = Date.now();
    const invite = await store.teamInvites.getOrCreate(team._id, {
      email: 'gone@x.io',
    });

    expect(Date.now() - started).toBeLessThan(INVITE_CLAIM_WAIT_MS + 1000);
    expect(
      (await store.teamInvites.getByTeamEmail(team._id, 'gone@x.io'))?._id,
    ).toBe(invite._id);
    expect(await store.teamInvites.listByTeam(team._id)).toHaveLength(1);
  });

  it('a winner stalled past the bound yields to the caller that took over', async () => {
    const { store } = setup();
    const team = await store.teams.createFirst({ name: 'A' });
    // The first insert stalls longer than a loser waits; later ones do not.
    delayInviteInserts(store, n => (n === 0 ? INVITE_CLAIM_WAIT_MS + 300 : 0));

    const slow = store.teamInvites.getOrCreate(team._id, { email: 's@x.io' });
    await sleep(20);
    const fast = store.teamInvites.getOrCreate(team._id, { email: 's@x.io' });
    const [a, b] = await Promise.all([slow, fast]);

    expect(a._id).toBe(b._id);
    const invites = await store.teamInvites.listByTeam(team._id);
    expect(invites.map(i => i._id)).toEqual([b._id]);
    expect((await store.teamInvites.getByToken(a.token))?._id).toBe(b._id);
  });
});
