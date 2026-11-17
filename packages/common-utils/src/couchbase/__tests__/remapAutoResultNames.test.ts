import { remapCouchbaseAutoResultNames } from '@/couchbase/nodeExecute';

describe('remapCouchbaseAutoResultNames', () => {
  it('maps $1 onto the first unused hint name', () => {
    expect(
      remapCouchbaseAutoResultNames({ $1: 10, ServiceName: 'frontend' }, [
        'count()',
        'ServiceName',
      ]),
    ).toEqual({ 'count()': 10, ServiceName: 'frontend' });
  });

  it('leaves rows alone when there are no auto names', () => {
    expect(
      remapCouchbaseAutoResultNames({ 'count()': 3, ServiceName: 'api' }, [
        'count()',
        'ServiceName',
      ]),
    ).toEqual({ 'count()': 3, ServiceName: 'api' });
  });

  it('no-ops without hints', () => {
    expect(remapCouchbaseAutoResultNames({ $1: 1 }, undefined)).toEqual({
      $1: 1,
    });
  });
});
