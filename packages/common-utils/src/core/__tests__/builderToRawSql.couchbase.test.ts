import { renderBuilderConfigAsSqlTemplate } from '@/core/builderToRawSql';
import { DisplayType } from '@/types';

describe('renderBuilderConfigAsSqlTemplate (Couchbase)', () => {
  it('emits SQL++ macros instead of bound keyspaces and time predicates', async () => {
    const result = await renderBuilderConfigAsSqlTemplate(
      {
        configType: 'builder',
        displayType: DisplayType.Line,
        select: [{ aggFn: 'count', valueExpression: '' }],
        from: {
          databaseName: 'otel',
          scopeName: 'default',
          tableName: 'e2e_otel_logs',
        },
        timestampValueExpression: 'Timestamp',
        connection: 'local',
        dateRange: [new Date(0), new Date(0)],
        granularity: 'auto',
      } as any,
      {} as any,
    );

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.sql).toContain('$__sourceTable');
    expect(result.sql).toContain('$__fromTime_ms');
    expect(result.sql).toContain('$__toTime_ms');
    expect(result.sql).toContain('$__timeInterval(');
    expect(result.sql).toContain('$__filters');
    expect(result.sql).toContain('COUNT(*)');
    expect(result.sql).toContain('AS `count()`');
    expect(result.sql).not.toContain('e2e_otel_logs');
  });
});
