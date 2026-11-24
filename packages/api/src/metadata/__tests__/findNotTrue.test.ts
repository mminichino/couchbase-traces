import { buildCount, buildFind } from '@/metadata/couchbase/find';
import { MemoryFind } from '@/metadata/testing/memoryFind';
import { MemoryKv } from '@/metadata/testing/memoryKv';

const target = { bucket: 'cbt_meta', scope: 'app' };

describe('find notTrue (Mongo $ne: true)', () => {
  it('renders a predicate that keeps missing, null and false', () => {
    const q = buildFind(target, 'dashboards', {
      where: { team: 't1' },
      notTrue: ['provisioned'],
    });
    expect(q.statement).toContain(
      'IFMISSINGORNULL(d.`provisioned`, FALSE) != TRUE',
    );
    expect(
      buildCount(target, 'dashboards', {
        where: { team: 't1' },
        notTrue: ['provisioned'],
      }).statement,
    ).toContain('IFMISSINGORNULL(d.`provisioned`, FALSE) != TRUE');
  });

  it('matches the same rows in memory', async () => {
    const kv = new MemoryKv();
    await kv.insert('dashboards', 'a', { team: 't1', provisioned: true });
    await kv.insert('dashboards', 'b', { team: 't1', provisioned: false });
    await kv.insert('dashboards', 'c', { team: 't1' });
    await kv.insert('dashboards', 'd', { team: 't1', provisioned: null });
    const find = new MemoryFind(kv);
    const spec = { where: { team: 't1' }, notTrue: ['provisioned'] };
    const rows = await find.find('dashboards', spec);
    expect(rows.map(r => r.key).sort()).toEqual(['b', 'c', 'd']);
    expect(await find.count('dashboards', spec)).toBe(3);
  });
});
