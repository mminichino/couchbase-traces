import {
  orderRowByHintedColumns,
  remapCouchbaseAutoResultNames,
} from '@/couchbase/nodeExecute';

describe('remapCouchbaseAutoResultNames', () => {
  it('maps $1 onto the first unused hint name in hint order', () => {
    expect(
      Object.keys(
        remapCouchbaseAutoResultNames({ $1: 10, ServiceName: 'frontend' }, [
          'count()',
          'ServiceName',
        ]),
      ),
    ).toEqual(['count()', 'ServiceName']);
    expect(
      remapCouchbaseAutoResultNames({ $1: 10, ServiceName: 'frontend' }, [
        'count()',
        'ServiceName',
      ]),
    ).toEqual({ 'count()': 10, ServiceName: 'frontend' });
  });

  it('reorders aliased rows to match hint order', () => {
    expect(
      Object.keys(
        remapCouchbaseAutoResultNames({ ServiceName: 'api', 'count()': 3 }, [
          'count()',
          'ServiceName',
        ]),
      ),
    ).toEqual(['count()', 'ServiceName']);
  });

  it('no-ops without hints', () => {
    expect(remapCouchbaseAutoResultNames({ $1: 1 }, undefined)).toEqual({
      $1: 1,
    });
  });
});

describe('orderRowByHintedColumns', () => {
  it('puts hinted keys first in the given order', () => {
    expect(
      Object.keys(orderRowByHintedColumns({ z: 1, a: 2, m: 3 }, ['m', 'a'])),
    ).toEqual(['m', 'a', 'z']);
  });
});
