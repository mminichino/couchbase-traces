import { clickhouse, formatDialect, n1ql } from 'sql-formatter';
import { SQLConfig, SQLDialect } from '@codemirror/lang-sql';
import { sql } from '@codemirror/lang-sql';

import { sqlKeywordsForCouchbase } from '@/couchbase/dialect';

const { tokenizerOptions } = clickhouse;

const allKeywords = [
  ...tokenizerOptions.reservedKeywords,
  ...tokenizerOptions.reservedClauses,
  ...tokenizerOptions.reservedSelect,
  ...tokenizerOptions.reservedSetOperations,
  ...tokenizerOptions.reservedJoins,
  ...(tokenizerOptions.reservedKeywordPhrases ?? []),
];

const clickhouseDialect = SQLDialect.define({
  keywords: allKeywords.join(' ').toLowerCase(),
  types: tokenizerOptions.reservedDataTypes.join(' ').toLowerCase(),
  builtin: tokenizerOptions.reservedFunctionNames.join(' ').toLowerCase(),
  backslashEscapes: true,
  doubleDollarQuotedStrings: true,
  operatorChars: '*+-%<>!=&|~^/?:',
  identifierQuotes: '`"',
});

export const clickhouseSql = (config?: SQLConfig) =>
  sql({ ...config, dialect: clickhouseDialect });

const sqlppDialect = SQLDialect.define({
  keywords: sqlKeywordsForCouchbase().join(' ').toLowerCase(),
  backslashEscapes: true,
  doubleDollarQuotedStrings: true,
  operatorChars: '*+-%<>!=&|~^/?:',
  identifierQuotes: '`"',
});

export const sqlppSql = (config?: SQLConfig) =>
  sql({ ...config, dialect: sqlppDialect });

export function formatSqlForDialect(
  text: string,
  dialect: 'clickhouse' | 'n1ql',
): string {
  try {
    return formatDialect(text, {
      dialect: dialect === 'n1ql' ? n1ql : clickhouse,
    });
  } catch {
    return text;
  }
}
