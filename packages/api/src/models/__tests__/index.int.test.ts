import { createTeam } from '@/controllers/team';
import { clearDBCollections, closeDB, connectDB } from '@/fixtures';
import { getMetadataStore } from '@/metadata';

describe('team controller', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    await clearDBCollections();
  });

  afterAll(async () => {
    await closeDB();
  });

  // Upstream checked Mongoose strictQuery; the metadata store has no ad hoc
  // filters, so the equivalent is that only the created team is listed.
  it('does not query for non-existent properties', async () => {
    await createTeam({ name: 'My Team' });

    const teams = await getMetadataStore().teams.listAll();
    expect(teams.filter(t => t.name === 'My Team')).toHaveLength(1);
    expect(
      teams.filter(
        t =>
          (t as unknown as Record<string, unknown>).fakeProperty === 'please',
      ),
    ).toHaveLength(0);
  });
});
