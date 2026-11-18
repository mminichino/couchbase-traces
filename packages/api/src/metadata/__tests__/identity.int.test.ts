// C1 acceptance on the real metadata store: the session round trip through
// the Couchbase session store, and uniqueness under concurrent writers.
import { getAgent, getLoggedInAgent, getServer } from '@/fixtures';
import { getMetadataStore } from '@/metadata';

const PARALLEL = 20;
const PASSWORD = 'TacoCat!2#4X';

describe('identity on the metadata store', () => {
  const server = getServer();

  beforeAll(async () => {
    await server.start();
  });

  afterEach(async () => {
    await server.clearDBs();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('keeps a session from login to logout', async () => {
    const { agent, user } = await getLoggedInAgent(server);

    const me = await agent.get('/me').expect(200);
    expect(me.body.id).toBe(user._id);

    await agent.get('/logout').expect(302);
    await agent.get('/me').expect(401);
  });

  it('lets exactly one of many concurrent registrations create the team', async () => {
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) =>
        getAgent(server)
          .post('/register/password')
          .send({
            email: `racer${i}@example.com`,
            password: PASSWORD,
            confirmPassword: PASSWORD,
          }),
      ),
    );

    const statuses = results.map(r => r.status);
    expect(statuses.filter(s => s === 200)).toHaveLength(1);
    expect(statuses.filter(s => s !== 200).every(s => s === 409)).toBe(true);

    const team = await getMetadataStore().teams.getOnly();
    expect(team).not.toBeNull();
    const members = await getMetadataStore().users.listByTeam(team!._id);
    expect(members).toHaveLength(1);
  });

  it('creates one invitation for many concurrent invites of one email', async () => {
    const { agent, team } = await getLoggedInAgent(server);

    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        agent
          .post('/team/invitation')
          .send({ email: 'invitee@example.com', name: 'Invitee' }),
      ),
    );

    expect(results.map(r => r.status).every(s => s === 200)).toBe(true);
    const urls = new Set(results.map(r => r.body.url));
    expect(urls.size).toBe(1);
    const invites = await getMetadataStore().teamInvites.listByTeam(team._id);
    expect(invites).toHaveLength(1);
  });

  it('gives every concurrently created API key its own service account', async () => {
    const { agent, team } = await getLoggedInAgent(server);

    const results = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) =>
        agent
          .post('/team/api-keys')
          .send({ description: `key ${i}`, expiry: 'never' }),
      ),
    );

    expect(results.map(r => r.status).every(s => s === 200)).toBe(true);
    expect(new Set(results.map(r => r.body.id)).size).toBe(PARALLEL);
    expect(new Set(results.map(r => r.body.key)).size).toBe(PARALLEL);
    const keys = await getMetadataStore().users.listOrgKeys(team._id);
    expect(keys).toHaveLength(PARALLEL);
    // Service accounts are not people.
    expect(await getMetadataStore().users.countPeople(team._id)).toBe(1);
  });
});
