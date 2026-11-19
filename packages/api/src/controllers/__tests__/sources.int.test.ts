import { getSource } from '@/controllers/sources';
import { clearDBCollections, closeDB, connectDB } from '@/fixtures';
import { newId } from '@/metadata/ids';

describe('sources controller', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterEach(async () => {
    await clearDBCollections();
  });

  afterAll(async () => {
    await closeDB();
  });

  describe('getSource', () => {
    it('returns null when sourceId is not a valid id', async () => {
      // Non-ids strings used to bubble a the model layer CastError up
      // through MCP tools as "Cast to ids failed for value ...".
      // The wrapper now short-circuits before hitting the store so the
      // caller's not-found branch fires cleanly.
      const team = newId();

      expect(await getSource(team, 'not-a-valid-id')).toBeNull();
      expect(await getSource(team, '')).toBeNull();
      expect(await getSource(team, '   ')).toBeNull();
    });

    it('returns null for a well-formed but missing id', async () => {
      const team = newId();
      const missingSourceId = newId();

      expect(await getSource(team, missingSourceId)).toBeNull();
    });
  });
});
