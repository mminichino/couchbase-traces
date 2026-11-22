import { aliasMapToWithClauses } from '@/core/utils';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { sqlExprToAliasMap } from '@/query';
import { DisplayType } from '@/types';

import { dateRange, metadata } from './defectFixtures';

const from = {
  databaseName: 'otel',
  scopeName: 'default',
  tableName: 'otel_logs',
};

const render = async (config: unknown) =>
  renderChartConfigCouchbase(config as never, metadata, undefined);

/**
 * What checkAlerts `computeAliasWithClauses` derives from a saved search's
 * select: render it, read the aliases back, turn them into WITH clauses.
 */
async function aliasWith(select: string) {
  const search = await render({
    connection: 'c',
    displayType: DisplayType.Search,
    from,
    select,
    where: '',
    whereLanguage: 'lucene',
    timestampValueExpression: 'Timestamp',
  });
  return aliasMapToWithClauses(sqlExprToAliasMap(search));
}

/** The saved-search alert query: count per window, the search's where. */
function alertConfig(where: string, withClauses: unknown, extra = {}) {
  return {
    connection: 'c',
    displayType: DisplayType.Line,
    from,
    select: [{ aggFn: 'count', valueExpression: '', aggCondition: '' }],
    where,
    whereLanguage: 'lucene',
    timestampValueExpression: 'Timestamp',
    dateRange,
    granularity: '5 minute',
    with: withClauses,
    ...extra,
  };
}

describe('D11 alias WITH clauses render as SQL++ LET', () => {
  it('binds a saved-search alias with LET and filters on it (alias in select and where)', async () => {
    const withClauses = await aliasWith('toString(Body) AS body');
    const { sql } = await render(alertConfig('body:wrong', withClauses));
    expect(sql).not.toMatch(/^\s*WITH\b/);
    expect(sql).toContain('AS d LET `body` = (toString(Body)) WHERE');
    // The Lucene term targets the alias, not an unknown field (FALSE).
    expect(sql).toMatch(/LOWER\(`body`\) LIKE \$\w+/);
    expect(sql).not.toContain('(FALSE)');
  });

  it('binds every alias and filters on the one the where names (multiple aliases)', async () => {
    const withClauses = await aliasWith(
      'toString(Body) AS body, ServiceName AS svc',
    );
    const { sql, params } = await render(alertConfig('svc:"api"', withClauses));
    expect(sql).toContain(
      'LET `body` = (toString(Body)), `svc` = (ServiceName) WHERE',
    );
    expect(sql).toMatch(/`svc` = \$\w+/);
    expect(Object.values(params)).toContain('api');
  });

  it('keeps subquery WITH clauses as CTEs next to the LET', async () => {
    const { sql } = await render(
      alertConfig('', [
        {
          name: 'n',
          sql: { sql: 'ServiceName', params: {} },
          isSubquery: false,
        },
        {
          name: 'ids',
          sql: { sql: 'SELECT RAW 1', params: {} },
          isSubquery: true,
        },
      ]),
    );
    expect(sql).toMatch(/^WITH `ids` AS \(SELECT RAW 1\) SELECT /);
    expect(sql).toContain('AS d LET `n` = (ServiceName) WHERE');
  });

  it('keeps alias params distinct from the rest of the statement', async () => {
    const { sql, params } = await render(
      alertConfig('', [
        {
          name: 'tagged',
          sql: { sql: 'ServiceName = $p0', params: { p0: 'api' } },
          isSubquery: false,
        },
      ]),
    );
    const letParam = /LET `tagged` = \(ServiceName = \$(\w+)\)/.exec(sql)?.[1];
    expect(letParam).toBeDefined();
    expect(params[letParam!]).toBe('api');
    // Both time bounds are still bound to dates, not to the alias value.
    const dates = Object.values(params).filter(
      v => typeof v === 'string' && v.startsWith('2026-'),
    );
    expect(dates).toHaveLength(2);
  });

  it('inlines an alias that references an earlier alias, as ClickHouse resolves it', async () => {
    const { sql } = await render(
      alertConfig('', [
        {
          name: 'a',
          sql: { sql: 'ServiceName', params: {} },
          isSubquery: false,
        },
        {
          name: 'b',
          sql: { sql: "concat(a, '!')", params: {} },
          isSubquery: false,
        },
      ]),
    );
    expect(sql).toContain(
      "LET `a` = (ServiceName), `b` = (concat((ServiceName), '!'))",
    );
  });

  it('applies the LET to the series-limit CTE that reuses the where', async () => {
    const withClauses = await aliasWith('ServiceName AS svc');
    const { sql } = await render(
      alertConfig('svc:api', withClauses, {
        groupBy: 'ServiceName',
        seriesLimit: 3,
      }),
    );
    const lets = sql.match(/LET `svc` = \(ServiceName\)/g) ?? [];
    expect(lets).toHaveLength(2);
  });
});
