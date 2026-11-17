import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { ensureOutermostSelectLimit } from '@/couchbase/rawSqlLimit';
import { rewriteSqlInValueLists } from '@/couchbase/sqlInLists';
import { keyspace, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import { isRawSqlChartConfig } from '@/guards';
import { QUERY_PARAMS_BY_DISPLAY_TYPE } from '@/rawSqlParams';
import type {
  BuilderChartConfigWithOptDateRange,
  Filter,
  RawSqlChartConfig,
} from '@/types';
import { DisplayType } from '@/types';
import {
  expandTemplate,
  expandVariableToken,
  VARIABLE_MACRO_NAMES,
} from '@/variables';

import { expandMacrosCouchbase } from './macros';
import { couchbaseMetadataRef } from './metadata';
import {
  compileWhereExpressionCouchbase,
  renderSqlAstFilterCouchbase,
} from './where';

function joinAnd(parts: SqlPP[]): SqlPP | undefined {
  if (parts.length === 0) return undefined;
  return parts
    .slice(1)
    .reduce((acc, part) => sqlpp`${acc} AND ${part}`, parts[0]);
}

/**
 * Expand `$__filter` / `$__conditionalAll` / `$var` using the shared variable
 * expander, then leave time/source/`$__filters` macros for expandMacrosCouchbase.
 */
function expandVariableMacros(sqlTemplate: string, config: RawSqlChartConfig) {
  const variables = config.variables;
  if (variables == null) return sqlTemplate;
  const variableContext = { variables, inputLanguage: 'sql' as const };
  return expandTemplate(sqlTemplate, {
    macroNames: [...VARIABLE_MACRO_NAMES],
    expandMacro: token => expandVariableToken(token, variableContext),
    expandReference: token => expandVariableToken(token, variableContext),
  });
}

function chartConfigForFilterCompile(
  config: ChartConfigWithOptDateRangeEx,
): BuilderChartConfigWithOptDateRange {
  const from =
    'from' in config && config.from
      ? config.from
      : { databaseName: '', tableName: '' };
  const timestampValueExpression =
    'timestampValueExpression' in config && config.timestampValueExpression
      ? config.timestampValueExpression
      : 'Timestamp';
  const connection = 'connection' in config ? config.connection : '';
  // Minimal builder shape so Lucene/SQL filter compilation can resolve schema
  // against the tile's source table. Raw SQL configs do not carry select lists.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- adapter for filter compile only
  return {
    from,
    timestampValueExpression,
    connection,
    select: '',
  } as BuilderChartConfigWithOptDateRange;
}

async function renderFiltersSql(
  config: ChartConfigWithOptDateRangeEx,
  metadata: unknown,
): Promise<{ sql: string; params: Record<string, unknown> }> {
  const filters = 'filters' in config ? config.filters : undefined;
  if (!filters?.length) {
    return { sql: '', params: {} };
  }
  const ctx = { metadata: couchbaseMetadataRef(metadata) };
  const chartConfig = chartConfigForFilterCompile(config);

  const parts: SqlPP[] = [];
  for (const filter of filters as Filter[]) {
    if (filter.type === 'sql_ast') {
      parts.push(renderSqlAstFilterCouchbase(filter));
    } else if (filter.type === 'lucene' || filter.type === 'sql') {
      const compiled = await compileWhereExpressionCouchbase({
        condition: filter.condition,
        language: filter.type,
        chartConfig,
        ctx,
      });
      if (compiled.statement.trim()) parts.push(compiled);
    }
  }
  const combined = joinAnd(parts);
  return {
    sql: combined?.statement ?? '',
    params: combined?.parameters ?? {},
  };
}

export async function renderRawSqlChartConfigCouchbase(
  config: ChartConfigWithOptDateRangeEx,
  metadata: unknown,
): Promise<{ sql: string; params: Record<string, unknown>; dialect: 'sqlpp' }> {
  if (!isRawSqlChartConfig(config)) {
    throw new CouchbaseUnsupportedError('charts: rawSql');
  }
  const raw = config;
  if (typeof raw.sqlTemplate !== 'string') {
    throw new CouchbaseUnsupportedError('charts: rawSql');
  }
  const displayType = raw.displayType ?? DisplayType.Table;
  const queryParams = QUERY_PARAMS_BY_DISPLAY_TYPE[displayType] ?? [];
  const paramValues = Object.fromEntries(
    queryParams.map(param => [param.name, param.get(raw)]),
  );
  const start = Number(paramValues.startDateMilliseconds ?? Date.now());
  const end = Number(paramValues.endDateMilliseconds ?? Date.now());
  const intervalSeconds = Number(paramValues.intervalSeconds ?? 60);

  const from = 'from' in raw ? raw.from : undefined;
  const sourceKeyspace =
    from != null
      ? keyspace({
          bucket: from.databaseName,
          scope: from.scopeName || 'default',
          collection: from.tableName,
        })
      : undefined;

  const filters = await renderFiltersSql(config, metadata);
  const withVariables = expandVariableMacros(raw.sqlTemplate, raw);

  const expanded = expandMacrosCouchbase(withVariables, {
    startDateMilliseconds: start,
    endDateMilliseconds: end,
    intervalSeconds,
    timestampFormat:
      'timestampFormat' in config && config.timestampFormat === 'epoch_millis'
        ? 'epoch_millis'
        : 'iso8601',
    sourceKeyspace,
    filtersSql: filters.sql,
  });

  return {
    sql: ensureOutermostSelectLimit(rewriteSqlInValueLists(expanded.sql)),
    params: { ...paramValues, ...filters.params, ...expanded.params },
    dialect: 'sqlpp',
  };
}
