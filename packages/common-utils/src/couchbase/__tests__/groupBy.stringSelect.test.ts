import { groupByClauseExpr, groupByItems } from '@/couchbase/render/groupBy';

const clauses = (config: Parameters<typeof groupByItems>[0]) =>
  groupByItems(config).map(i => groupByClauseExpr(i).statement);

describe('groupByItems with a string select list', () => {
  it('keeps a group key the select list projects unwrapped', () => {
    // The release-markers query: SQL++ needs the projection to match the
    // group key exactly, so wrapping it in IFMISSINGORNULL is error 4210.
    const config = {
      select:
        "min(Timestamp) AS firstSeen, ResourceAttributes['service.version'] AS version, ServiceName AS service",
      groupBy: "ResourceAttributes['service.version'], ServiceName",
    };
    expect(clauses(config)).toEqual([
      'ResourceAttributes.`service.version`',
      'ServiceName',
    ]);
    expect(groupByItems(config).every(i => i.fromSelectAlias)).toBe(true);
  });

  it('still wraps a nullable group key the select list does not project', () => {
    expect(
      clauses({
        select: 'count() AS n',
        groupBy: "ResourceAttributes['service.version']",
      }),
    ).toEqual(['IFMISSINGORNULL(ResourceAttributes.`service.version`, "")']);
  });
});
