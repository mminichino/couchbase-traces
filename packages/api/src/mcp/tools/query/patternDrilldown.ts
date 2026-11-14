import type { Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';
import { escapeSqlString } from '@couchbase-traces/common-utils/dist/core/utils';
import { CouchbaseSerializer } from '@couchbase-traces/common-utils/dist/couchbase/serializer';
import {
  genWhereSQL,
  parse,
} from '@couchbase-traces/common-utils/dist/queryParser';
import {
  type ChartVariable,
  UseTextIndex,
} from '@couchbase-traces/common-utils/dist/types';
import { substituteVariables } from '@couchbase-traces/common-utils/dist/variables';

const PATTERN_WILDCARD = '<*>';

export const MAX_PREDICATE_TEMPLATE_LENGTH = 4000;

export const PATTERN_MATCH_SEMANTICS =
  'whereSnippet matches values with the same whitespace-separated token count as the ' +
  'template, the same literal tokens (case-sensitive) in the same positions, and exactly ' +
  'one non-whitespace token at each <*>. Every sampled member of the cluster matches. ' +
  'It can also match unsampled events whose shape fits, including ones Drain would have ' +
  'put in a more specific cluster, so the drill-down is a superset of cluster membership.';

const JS_WHITESPACE = '\\s\\x{0B}\\pZ\\x{FEFF}';
const WS = `[${JS_WHITESPACE}]`;
const NON_WS = `[^${JS_WHITESPACE}]`;

function escapeRe2Literal(token: string): string {
  return token.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
}

export function templateToRegex(template: string): string {
  const tokens = template.split(/\s+/).filter(t => t.length > 0);
  const body = tokens
    .map(t => (t === PATTERN_WILDCARD ? `${NON_WS}+` : escapeRe2Literal(t)))
    .join(`${WS}+`);
  return `^${WS}*${body}${WS}*$`;
}

export function buildPatternPredicate(
  valueExpression: string,
  template: string,
): string | null {
  if (template.length > MAX_PREDICATE_TEMPLATE_LENGTH) return null;
  return `match(${valueExpression}, '${escapeSqlString(templateToRegex(template))}')`;
}

export function andSql(...conditions: Array<string | undefined>): string {
  const parts = conditions.filter(
    (c): c is string => c != null && c.trim() !== '',
  );
  if (parts.length <= 1) return parts[0] ?? '';
  return parts.map(c => `(${c})`).join(' AND ');
}

export async function userWhereAsSql({
  where,
  whereLanguage,
  variables,
  metadata,
  databaseName,
  tableName,
  connectionId,
  implicitColumnExpression,
  useTextIndexForImplicitColumn,
}: {
  where: string;
  whereLanguage: 'lucene' | 'sql';
  variables?: ChartVariable[];
  metadata: Metadata;
  databaseName: string;
  tableName: string;
  connectionId: string;
  implicitColumnExpression?: string;
  useTextIndexForImplicitColumn?: UseTextIndex;
}): Promise<string> {
  if (!where.trim()) return '';
  const expanded = variables
    ? substituteVariables(where, { variables, inputLanguage: whereLanguage })
    : where;
  if (whereLanguage === 'sql') return expanded;
  const serializer = new CouchbaseSerializer({
    metadata: {
      getColumns: args => metadata.getColumns(args),
    },
    tc: {
      connectionId,
      databaseName,
      scopeName: 'default',
      tableName,
    },
    alias: 't',
    implicitColumnExpression,
    searchIndexName:
      useTextIndexForImplicitColumn !== undefined &&
      useTextIndexForImplicitColumn !== UseTextIndex.Disabled
        ? 'default'
        : undefined,
  });
  try {
    return await genWhereSQL(parse(expanded), serializer);
  } catch {
    return expanded;
  }
}
