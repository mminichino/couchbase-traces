import type { ColumnMeta } from '@couchbase-traces/common-utils/dist/query/types';

import {
  andSql,
  buildPatternPredicate,
  userWhereAsSql,
} from '@/mcp/tools/query/patternDrilldown';
import {
  builderColumnsError,
  builderFieldRoots,
  rawSqlColumnsError,
  rawSqlFieldRoots,
  unknownColumns,
} from '@/mcp/tools/query/unknownColumns';

const LOGS = {
  connectionId: 'c1',
  databaseName: 'otel',
  scopeName: 'default',
  tableName: 'otel_logs',
};

function lookup(inferred: string[] = [], opts: { missing?: boolean } = {}) {
  return {
    getColumns: jest.fn(
      async (): Promise<ColumnMeta[]> =>
        inferred.map(name => ({
          name,
          type: 'String',
          codec_expression: '',
          comment: '',
          default_expression: '',
          default_type: '',
          ttl_expression: '',
        })),
    ),
    listKeyspaces: jest.fn(async () =>
      opts.missing
        ? []
        : [{ bucket: 'otel', scope: 'default', collection: LOGS.tableName }],
    ),
  };
}

describe('unknownColumns', () => {
  it('flags a name outside the declared OTel schema and the inferred columns', async () => {
    const md = lookup(['Body', 'Timestamp']);
    await expect(
      unknownColumns(md, LOGS, ['Body', 'nonexistent_column_xyz']),
    ).resolves.toEqual(['nonexistent_column_xyz']);
  });

  it('accepts a field documents have even when the declared schema lacks it', async () => {
    await expect(
      unknownColumns(lookup(['custom_field']), LOGS, ['custom_field']),
    ).resolves.toEqual([]);
  });

  it('does not read the collection when every name is declared', async () => {
    const md = lookup();
    await expect(
      unknownColumns(md, LOGS, ['Body', 'LogAttributes']),
    ).resolves.toEqual([]);
    expect(md.getColumns).not.toHaveBeenCalled();
  });

  it('skips collections with no declared schema', async () => {
    const md = lookup();
    await expect(
      unknownColumns(md, { ...LOGS, tableName: 'my_events' }, ['anything']),
    ).resolves.toEqual([]);
    expect(md.getColumns).not.toHaveBeenCalled();
  });

  it('leaves a missing collection to the server error', async () => {
    await expect(
      unknownColumns(lookup([], { missing: true }), LOGS, ['nope']),
    ).resolves.toEqual([]);
  });

  it('fails open when the column lookup throws', async () => {
    const md = lookup();
    md.getColumns.mockRejectedValue(new Error('boom'));
    await expect(unknownColumns(md, LOGS, ['nope'])).resolves.toEqual([]);
  });
});

describe('builderFieldRoots', () => {
  it('reads value expressions, SQL conditions, groupBy and a SQL where', () => {
    expect(
      builderFieldRoots({
        select: [
          { valueExpression: 'Duration' },
          {
            valueExpression: '',
            aggCondition: "StatusCode = 'Error'",
            aggConditionLanguage: 'sql',
          },
          { aggCondition: 'ServiceName:api', aggConditionLanguage: 'lucene' },
        ],
        groupBy: "SpanAttributes['http.route'], ServiceName",
        where: 'SpanKind = $k',
        whereLanguage: 'sql',
      }),
    ).toEqual([
      'Duration',
      'StatusCode',
      'SpanAttributes',
      'ServiceName',
      'SpanKind',
    ]);
  });

  it('ignores a search string select and a Lucene where', () => {
    expect(
      builderFieldRoots({ select: 'Body, nope', where: 'nope:1' }),
    ).toEqual([]);
  });

  // An event-pattern drill-down qualifies the Lucene filter's fields with the
  // search alias `d` (D2); `d` is the keyspace, not a field.
  it('reads d.X in a drill-down where as field X', async () => {
    const filter = await userWhereAsSql({
      where: 'ServiceName:svc-a',
      whereLanguage: 'lucene',
      metadata: {
        getColumns: async () => [
          { name: 'ServiceName', type: 'String' },
          { name: 'Body', type: 'String' },
        ],
      },
      databaseName: 'otel',
      tableName: 'otel_logs',
      connectionId: 'c1',
    });
    const where = andSql(
      buildPatternPredicate('Body', 'it\'s "q" \\ <*> (x) ü') ?? undefined,
      filter,
    );
    expect(builderFieldRoots({ where, whereLanguage: 'sql' })).toEqual([
      'Body',
      'ServiceName',
    ]);
  });
});

describe('rawSqlFieldRoots', () => {
  it('expands $__sourceTable to the source collection', () => {
    expect(
      rawSqlFieldRoots(
        'SELECT nope FROM $__sourceTable WHERE $__timeFilter(Timestamp)',
        'c1',
        { databaseName: 'otel', tableName: 'otel_logs' },
      ),
    ).toEqual({ target: LOGS, roots: ['nope', 'Timestamp'] });
  });

  it('returns null without a single three-part keyspace', () => {
    expect(rawSqlFieldRoots('SELECT 1', 'c1')).toBeNull();
  });
});

describe('errors', () => {
  it('reports upstream UNKNOWN_IDENTIFIER for raw SQL', async () => {
    const err = await rawSqlColumnsError(
      lookup(['Body']),
      'SELECT nonexistent_column_xyz FROM `otel`.`default`.`otel_logs` LIMIT 1',
      'c1',
    );
    expect(err?.message).toMatch(
      /^UNKNOWN_IDENTIFIER: Unknown expression identifier `nonexistent_column_xyz` in otel\.default\.otel_logs/,
    );
  });

  it('passes a valid builder chart', async () => {
    await expect(
      builderColumnsError(lookup(), LOGS, {
        select: [{ valueExpression: 'TONUMBER(LogAttributes.`x.y`)' }],
      }),
    ).resolves.toBeNull();
  });
});
