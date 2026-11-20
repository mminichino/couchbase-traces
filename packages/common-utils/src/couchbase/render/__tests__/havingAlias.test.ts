import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { convertToCategoricalChartConfig } from '@/core/utils';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType } from '@/types';

import { logTableConfig, metadata } from './defectFixtures';

const render = (config: unknown) =>
  renderChartConfigCouchbase(
    config as ChartConfigWithOptDateRangeEx,
    metadata,
    undefined,
  );

const havingOf = (sql: string) => {
  const m = / HAVING (.*?)(?: ORDER BY | LIMIT |$)/.exec(sql);
  return m?.[1];
};

// D1: cbt_table `having: 'n > 1'` failed with "Expression (1 < (`d`.`n`))
// must depend only on group keys or aggregates". SQL++ HAVING cannot see
// select aliases, so an alias is replaced by the aggregate it names.
describe('D1 HAVING on a select alias', () => {
  it('rewrites the alias to its aggregate', async () => {
    const q = await render(
      logTableConfig({ having: 'n > 1', havingLanguage: 'sql' }),
    );
    expect(havingOf(q.sql)).toBe('((COUNT(*)) > 1)');
  });

  it.each([DisplayType.Pie, DisplayType.Bar])(
    'rewrites the alias on shape %s',
    async displayType => {
      const config = convertToCategoricalChartConfig(
        logTableConfig({
          displayType,
          having: 'n > 1',
          havingLanguage: 'sql',
        }) as never,
      );
      const q = await render(config);
      expect(havingOf(q.sql)).toBe('((COUNT(*)) > 1)');
    },
  );

  it('rewrites a backtick-quoted alias and an alias with a space', async () => {
    const q = await render(
      logTableConfig({
        select: [
          { aggFn: 'count', alias: 'Line Count', valueExpression: '' },
          { aggFn: 'max', alias: 'm', valueExpression: 'Duration' },
        ],
        having: '`Line Count` > 1 AND `m` < 10',
        havingLanguage: 'sql',
      }),
    );
    expect(havingOf(q.sql)).toBe('((COUNT(*)) > 1 AND (MAX(Duration)) < 10)');
  });

  it('leaves strings, qualified paths, functions and group keys alone', async () => {
    const q = await render(
      logTableConfig({
        having: "n > 1 AND ServiceName != 'n' AND d.n IS MISSING AND n(1)",
        havingLanguage: 'sql',
      }),
    );
    expect(havingOf(q.sql)).toBe(
      "((COUNT(*)) > 1 AND ServiceName != 'n' AND d.n IS MISSING AND n(1))",
    );
  });

  it('carries named parameters from a conditional aggregate', async () => {
    const q = await render(
      logTableConfig({
        select: [
          {
            aggFn: 'count',
            alias: 'errors',
            valueExpression: '',
            aggCondition: "SeverityText = 'error'",
            aggConditionLanguage: 'sql',
          },
        ],
        having: 'errors >= 2',
        havingLanguage: 'sql',
      }),
    );
    expect(havingOf(q.sql)).toBe(
      "((COUNT(CASE WHEN (SeverityText = 'error') THEN 1 END)) >= 2)",
    );
  });

  it('renumbers named parameters from a Lucene aggregate condition', async () => {
    const q = await render(
      logTableConfig({
        select: [
          {
            aggFn: 'count',
            alias: 'errors',
            valueExpression: '',
            aggCondition: 'SeverityText:error',
            aggConditionLanguage: 'lucene',
          },
        ],
        having: 'errors >= $min',
        havingLanguage: 'sql',
      }),
    );
    const having = havingOf(q.sql) ?? '';
    expect(having).toMatch(
      /^\(\(COUNT\(CASE WHEN .*\$p\d+.* THEN 1 END\)\) >= \$min\)$/,
    );
    // Every $pN the statement uses is bound; none collide across clauses.
    for (const [, name] of q.sql.matchAll(/\$(p\d+)\b/g)) {
      expect(q.params).toHaveProperty(name);
    }
    expect(Object.values(q.params)).toContain('%error%');
  });

  it('rewrites the browser RUM sessions tile (Errors > 0)', async () => {
    // packages/app/src/dashboardTemplates/browser-rum.json, sessions table.
    const q = await render(
      logTableConfig({
        select: [
          {
            aggFn: 'count',
            valueExpression: '',
            aggCondition: 'SeverityText:error',
            aggConditionLanguage: 'lucene',
            alias: 'Errors',
          },
          {
            aggFn: 'count_distinct',
            valueExpression: 'TraceId',
            alias: 'Traces',
          },
        ],
        having: 'Errors > 0',
        havingLanguage: 'sql',
      }),
    );
    expect(havingOf(q.sql)).toMatch(
      /^\(\(COUNT\(CASE WHEN .* THEN 1 END\)\) > 0\)$/,
    );
  });

  it('keeps a having with no alias as written', async () => {
    const q = await render(
      logTableConfig({ having: 'COUNT(*) > 1', havingLanguage: 'sql' }),
    );
    expect(havingOf(q.sql)).toBe('(COUNT(*) > 1)');
  });
});
