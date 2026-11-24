import { findClickhouseOnlyConstructs } from '@/couchbase/clickhouseOnly';
import {
  metricAttributeKeysQuery,
  metricAttributeValuesQuery,
  type MetricKindTable,
  metricNamesPageQuery,
  metricUnitsQuery,
} from '@/couchbase/metricQueries';

const gauge: MetricKindTable = {
  databaseName: 'otel',
  tableName: 'otel_metrics_gauge',
  timestampValueExpression: 'TimeUnix',
};
const start = new Date('2026-01-01T00:00:00.000Z');
const end = new Date('2026-01-01T01:00:00.000Z');

/** Every `$name` in the statement has a value, and every value is used. */
function expectSqlpp(q: { statement: string; parameters: object }) {
  expect(findClickhouseOnlyConstructs(q.statement)).toEqual([]);
  expect(q.statement).not.toMatch(/\{\w+:\w+\}/);
  const used = new Set(
    [...q.statement.matchAll(/\$([A-Za-z_]\w*)/g)].map(m => m[1]),
  );
  expect([...used].sort()).toEqual(Object.keys(q.parameters).sort());
}

describe('metricNamesPageQuery', () => {
  it('pages distinct names in a window with bound cursor, pattern and limit', () => {
    const q = metricNamesPageQuery({
      table: gauge,
      start,
      end,
      namePattern: 'system.%',
      afterName: 'a',
      limit: 11,
    });
    expectSqlpp(q);
    expect(q.statement).toContain('FROM `otel`.`default`.`otel_metrics_gauge`');
    expect(q.statement).toContain('MetricName > $after');
    expect(q.statement).toContain('LOWER(MetricName) LIKE LOWER($pattern)');
    expect(q.statement).toMatch(/GROUP BY MetricName\s+ORDER BY MetricName ASC/);
    expect(q.parameters).toMatchObject({
      after: 'a',
      pattern: 'system.%',
      limit: 11,
    });
  });

  it('omits the cursor and pattern when unset, and reads the source scope', () => {
    const q = metricNamesPageQuery({
      table: { ...gauge, scopeName: 'app' },
      start,
      end,
      limit: 5,
    });
    expectSqlpp(q);
    expect(q.statement).toContain('FROM `otel`.`app`.`otel_metrics_gauge`');
    expect(q.statement).not.toContain('$after');
    expect(q.statement).not.toContain('$pattern');
  });

  it('compares epoch-millis timestamps numerically', () => {
    const q = metricNamesPageQuery({
      table: { ...gauge, timestampFormat: 'epoch_millis' },
      start,
      end,
      limit: 5,
    });
    expect(Object.values(q.parameters)).toEqual(
      expect.arrayContaining([start.getTime(), end.getTime()]),
    );
  });
});

describe('metricUnitsQuery', () => {
  it('takes the most recent unit and description per name, as argMax', () => {
    const q = metricUnitsQuery({
      table: gauge,
      names: ['a', 'b'],
      hasUnit: true,
      hasDescription: true,
      start,
      end,
      sampleSize: 100,
    });
    expectSqlpp(q);
    expect(q.statement).toContain(
      'MAX([s.__ts, s.`MetricUnit`])[1] AS `MetricUnit`',
    );
    expect(q.statement).toContain(
      'MAX([s.__ts, s.`MetricDescription`])[1] AS `MetricDescription`',
    );
    expect(q.statement).toContain('STR_TO_MILLIS(TimeUnix) AS __ts');
    expect(q.statement).toContain('MetricName IN $names');
    expect(q.parameters).toMatchObject({ names: ['a', 'b'], sample: 100 });
  });

  it('projects only the columns present and skips the sample cap when unset', () => {
    const q = metricUnitsQuery({
      table: gauge,
      names: ['a'],
      hasUnit: true,
      hasDescription: false,
      start,
      end,
    });
    expectSqlpp(q);
    expect(q.statement).not.toContain('MetricDescription');
    expect(q.statement).not.toContain('$sample');
  });
});

describe('metricAttributeKeysQuery', () => {
  it('aggregates distinct OBJECT_NAMES per map column from a bounded sample', () => {
    const q = metricAttributeKeysQuery({
      table: gauge,
      metricName: 'm',
      mapColumns: ['ResourceAttributes', 'Attributes'],
      sampleSize: 1000,
      start,
      end,
    });
    expectSqlpp(q);
    expect(q.statement).toContain(
      'ARRAY_DISTINCT(ARRAY_FLATTEN(ARRAY_AGG(OBJECT_NAMES(s.`ResourceAttributes`)), 1)) AS `ResourceAttributes`',
    );
    expect(q.statement).toContain('MetricName = $metric');
    expect(q.statement).toContain('LIMIT $sample');
    expect(q.parameters).toMatchObject({ metric: 'm', sample: 1000 });
  });
});

describe('metricAttributeValuesQuery', () => {
  it('reads each key as a quoted field and names results param<i>', () => {
    const q = metricAttributeValuesQuery({
      table: gauge,
      metricName: 'm',
      keys: [
        { mapColumn: 'ResourceAttributes', key: 'service.name' },
        { mapColumn: 'Attributes', key: 'http.route' },
      ],
      sampleSize: 1000,
      start,
      end,
    });
    expectSqlpp(q);
    expect(q.statement).toContain(
      'ARRAY_AGG(DISTINCT TOSTRING(s.`ResourceAttributes`.`service.name`)) AS `param0`',
    );
    expect(q.statement).toContain(
      'ARRAY_AGG(DISTINCT TOSTRING(s.`Attributes`.`http.route`)) AS `param1`',
    );
  });

  it('rejects a key it cannot quote', () => {
    expect(() =>
      metricAttributeValuesQuery({
        table: gauge,
        metricName: 'm',
        keys: [{ mapColumn: 'Attributes', key: 'a`b' }],
        sampleSize: 10,
        start,
        end,
      }),
    ).toThrow(/backtick/);
  });
});
