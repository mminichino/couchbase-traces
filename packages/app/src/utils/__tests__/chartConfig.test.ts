import { stripClientSideConfigFields } from '@/utils/chartConfig';

describe('stripClientSideConfigFields', () => {
  it('returns a builder config unchanged', () => {
    const config = {
      select: 'count()',
      from: { databaseName: 'db', tableName: 'logs' },
      where: '',
      connection: 'conn',
    };

    expect(stripClientSideConfigFields(config)).toBe(config);
  });
});
