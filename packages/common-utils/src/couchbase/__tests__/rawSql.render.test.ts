import { renderFromCouchbase } from '@/couchbase/render/from';
import { renderRawSqlChartConfigCouchbase } from '@/couchbase/render/rawSql';
import { renderTimeBucketPartsCouchbase } from '@/couchbase/render/select';
import { renderWhereCouchbase } from '@/couchbase/render/where';
import { DisplayType } from '@/types';

describe('renderRawSqlChartConfigCouchbase', () => {
  it('expands time/source macros and leaves $__filters as TRUE when empty', async () => {
    const result = await renderRawSqlChartConfigCouchbase(
      {
        configType: 'sql',
        sqlTemplate:
          'SELECT ServiceName, COUNT(*) AS c FROM $__sourceTable WHERE Timestamp >= $__fromTime_ms AND Timestamp <= $__toTime_ms AND $__filters GROUP BY ServiceName',
        connection: 'local',
        displayType: DisplayType.Table,
        from: {
          databaseName: 'otel',
          scopeName: 'default',
          tableName: 'e2e_otel_logs',
        },
        dateRange: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-02T00:00:00.000Z'),
        ],
      } as any,
      {},
    );

    expect(result.dialect).toBe('sqlpp');
    expect(result.sql).toContain('`otel`.`default`.`e2e_otel_logs`');
    expect(result.sql).toContain('TRUE');
    expect(result.sql).not.toContain('$__sourceTable');
    expect(result.sql).not.toContain('$__fromTime_ms');
  });

  it('expands $__filter variable macros before SQL++ time macros', async () => {
    const result = await renderRawSqlChartConfigCouchbase(
      {
        configType: 'sql',
        sqlTemplate:
          'SELECT 1 FROM $__sourceTable WHERE $__filter(ServiceName, $svc) AND Timestamp >= $__fromTime_ms',
        connection: 'local',
        displayType: DisplayType.Table,
        from: {
          databaseName: 'otel',
          scopeName: 'default',
          tableName: 'e2e_otel_logs',
        },
        dateRange: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-02T00:00:00.000Z'),
        ],
        variables: [
          {
            name: 'svc',
            values: ['frontend'],
          },
        ],
      } as any,
      {},
    );

    expect(result.sql).toMatch(/ServiceName/i);
    expect(result.sql).toContain('frontend');
    expect(result.sql).not.toContain('$__filter');
  });

  it('inlines sql_ast dashboard filters into $__filters', async () => {
    const result = await renderRawSqlChartConfigCouchbase(
      {
        configType: 'sql',
        sqlTemplate: 'SELECT 1 FROM $__sourceTable WHERE $__filters',
        connection: 'local',
        displayType: DisplayType.Table,
        from: {
          databaseName: 'otel',
          scopeName: 'default',
          tableName: 'e2e_otel_logs',
        },
        dateRange: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-02T00:00:00.000Z'),
        ],
        filters: [
          {
            type: 'sql_ast',
            left: 'ServiceName',
            operator: '=',
            right: "'accounting'",
          },
        ],
      } as any,
      {},
    );

    expect(result.sql).toContain("ServiceName = 'accounting'");
    expect(result.sql).not.toContain('$__filters');
  });

  it('rejects non-raw-sql configs', async () => {
    await expect(
      renderRawSqlChartConfigCouchbase(
        {
          configType: 'builder',
          select: '',
          from: { databaseName: 'otel', tableName: 'logs' },
          connection: 'local',
          timestampValueExpression: 'Timestamp',
        } as any,
        {},
      ),
    ).rejects.toThrow(/rawSql/);
  });

  it('rejects a missing sqlTemplate', async () => {
    await expect(
      renderRawSqlChartConfigCouchbase(
        {
          configType: 'sql',
          connection: 'local',
          displayType: DisplayType.Table,
        } as any,
        {},
      ),
    ).rejects.toThrow(/rawSql/);
  });

  it('joins multiple sql_ast filters and expands bare $var references', async () => {
    const result = await renderRawSqlChartConfigCouchbase(
      {
        configType: 'sql',
        sqlTemplate:
          'SELECT 1 FROM $__sourceTable WHERE $__filters AND ServiceName = $svc',
        connection: 'local',
        displayType: DisplayType.Table,
        from: {
          databaseName: 'otel',
          scopeName: 'default',
          tableName: 'e2e_otel_logs',
        },
        dateRange: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-02T00:00:00.000Z'),
        ],
        variables: [{ name: 'svc', values: ['frontend'] }],
        filters: [
          {
            type: 'sql_ast',
            left: 'SeverityText',
            operator: '=',
            right: "'error'",
          },
          {
            type: 'sql',
            condition: "Body LIKE '%boom%'",
          },
        ],
      } as any,
      {},
    );

    expect(result.sql).toContain("SeverityText = 'error'");
    expect(result.sql).toContain("Body LIKE '%boom%'");
    expect(result.sql).toContain('frontend');
  });
});

describe('isRenderingRawSqlTemplate helpers', () => {
  it('emits $__sourceTable from renderFromCouchbase', () => {
    const from = renderFromCouchbase({
      from: {
        databaseName: 'otel',
        scopeName: 'default',
        tableName: 'logs',
      },
      isRenderingRawSqlTemplate: true,
    });
    expect(from.statement).toContain('$__sourceTable');
  });

  it('keeps CTE from clauses literal even when templating', () => {
    const from = renderFromCouchbase({
      from: { databaseName: '', tableName: 'series_cte' },
      isRenderingRawSqlTemplate: true,
    });
    expect(from.statement).toContain('series_cte');
    expect(from.statement).not.toContain('$__sourceTable');
  });

  it('falls back to the row alias when from is empty', () => {
    const from = renderFromCouchbase({
      from: { databaseName: '', tableName: '' },
    });
    expect(from.statement).toMatch(/FROM\s+d\b/);
  });

  it('emits $__timeInterval from renderTimeBucketPartsCouchbase', () => {
    const bucket = renderTimeBucketPartsCouchbase({
      from: { databaseName: 'otel', tableName: 'logs' },
      connection: 'local',
      select: '',
      timestampValueExpression: 'Timestamp',
      granularity: '1 minute',
      dateRange: [
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-02T00:00:00.000Z'),
      ],
      isRenderingRawSqlTemplate: true,
    } as any);
    expect(bucket?.expr.statement).toContain('$__timeInterval(');
  });
});

describe('renderRawSqlChartConfigCouchbase edge cases', () => {
  it('supports epoch_millis timestamps and empty variables arrays', async () => {
    const result = await renderRawSqlChartConfigCouchbase(
      {
        configType: 'sql',
        sqlTemplate:
          'SELECT 1 FROM $__sourceTable WHERE $__timeFilter_ms(Timestamp)',
        connection: 'local',
        displayType: DisplayType.Line,
        timestampFormat: 'epoch_millis',
        from: {
          databaseName: 'otel',
          tableName: 'e2e_otel_logs',
        },
        dateRange: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-02T00:00:00.000Z'),
        ],
        variables: [],
      } as any,
      {},
    );
    expect(result.sql).toContain('`otel`');
    expect(result.sql).not.toContain('$__timeFilter_ms');
  });

  it('renders without a from keyspace when none is set', async () => {
    const result = await renderRawSqlChartConfigCouchbase(
      {
        configType: 'sql',
        sqlTemplate: 'SELECT 1 WHERE $__filters',
        connection: 'local',
        displayType: DisplayType.Number,
        dateRange: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-02T00:00:00.000Z'),
        ],
      } as any,
      {},
    );
    expect(result.sql).toContain('TRUE');
  });
});

describe('renderWhereCouchbase template mode', () => {
  it('emits exclusive time bounds and $__filters', async () => {
    const where = await renderWhereCouchbase(
      {
        from: { databaseName: 'otel', tableName: 'logs' },
        connection: 'local',
        select: '',
        timestampValueExpression: 'Timestamp',
        dateRange: [
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-02T00:00:00.000Z'),
        ],
        dateRangeStartInclusive: false,
        dateRangeEndInclusive: true,
        isRenderingRawSqlTemplate: true,
      } as any,
      { metadata: {} as any },
    );
    expect(where?.statement).toContain('$__fromTime_ms');
    expect(where?.statement).toContain('$__toTime_ms');
    expect(where?.statement).toContain('$__filters');
    expect(where?.statement).toContain('>');
    expect(where?.statement).toContain('<=');
  });
});
