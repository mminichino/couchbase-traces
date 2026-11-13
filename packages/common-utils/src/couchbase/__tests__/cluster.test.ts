import {
  activeRequestsQuery,
  bucketWidthMs,
  completedOverTimeQuery,
  indexesQuery,
  mapActiveRequest,
  mapCompletedBucket,
  recentRequestsQuery,
  topStatementsQuery,
} from '@/couchbase/cluster';

describe('cluster query statements', () => {
  it('keeps active requests on system:active_requests', () => {
    expect(activeRequestsQuery().statement).toMatchSnapshot();
  });

  it('parameterizes the completed-request range', () => {
    const query = completedOverTimeQuery(1_000, 2_000, 1_000);
    expect(query.statement).toMatchSnapshot();
    expect(query.statement).not.toContain('1000');
    expect(query.parameters).toEqual({ p0: 1_000, p1: 1_000, p2: 2_000 });
  });

  it('parameterizes top statements and recent requests', () => {
    expect(topStatementsQuery(10, 20).statement).toMatchSnapshot();
    expect(recentRequestsQuery(10, 20).statement).toMatchSnapshot();
  });

  it('reads system:indexes with the reserved using column aliased', () => {
    expect(indexesQuery().statement).toMatchSnapshot();
  });

  it('picks a bucket width of at most 300 slots', () => {
    expect(bucketWidthMs(0, 60_000)).toBe(1_000);
    expect(bucketWidthMs(0, 24 * 60 * 60 * 1000)).toBe(300_000);
  });

  it('maps query rows', () => {
    expect(
      mapActiveRequest({
        requestId: 'a',
        statement: 'SELECT 1',
        state: 'running',
        elapsedTime: '10.2ms',
        users: 'cbt_query',
        node: '127.0.0.1:8091',
      }),
    ).toEqual({
      requestId: 'a',
      statement: 'SELECT 1',
      state: 'running',
      elapsedTime: '10.2ms',
      users: 'cbt_query',
      node: '127.0.0.1:8091',
    });
    expect(mapCompletedBucket({ bucketMs: 5, count: '2', errors: 1 })).toEqual({
      t: 5,
      count: 2,
      errors: 1,
    });
  });
});
