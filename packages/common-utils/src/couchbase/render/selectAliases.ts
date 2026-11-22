import { rewriteMapSubscripts } from '@/couchbase/mapAccess';
import { concatSqlPP, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { SelectList } from '@/types';

import { splitOnAliasRefs } from './havingAliases';

/**
 * A select item before alias references are resolved: raw SQL `text` that may
 * name other items' aliases, or an `expr` that is already rendered (an
 * aggregate, a Lucene condition). `expr: undefined` marks an item whose SQL++
 * is not known here; anything referencing it resolves to undefined.
 */
export type PendingSelectItem =
  | { alias?: string; text: string }
  | { alias?: string; expr: SqlPP | undefined };

/**
 * ClickHouse resolves a select alias anywhere in the same select list, before
 * or after the item that defines it (`error_count / greatest(total_count, 1)`
 * ahead of `count() AS error_count`), and reads `"Calls"` as an identifier.
 * SQL++ reads both as a document field or a string, which under GROUP BY is
 * error 4210. Each reference is replaced by the aliased expression; a cyclic
 * reference is left as written (ClickHouse rejects those too).
 */
export function resolveSelectAliases(
  items: readonly PendingSelectItem[],
): (SqlPP | undefined)[] {
  const byAlias = new Map<string, number>();
  items.forEach((item, i) => {
    const alias = item.alias?.trim();
    if (alias && !byAlias.has(alias)) byAlias.set(alias, i);
  });
  const done = new Map<number, SqlPP | undefined>();
  const resolving = new Set<number>();
  const byIndex = new Map(items.map((item, i) => [i, item]));

  const resolve = (i: number): SqlPP | undefined => {
    if (done.has(i)) return done.get(i);
    const item = byIndex.get(i);
    if (item == null) return undefined;
    if (!('text' in item)) return item.expr;
    resolving.add(i);
    const refs = new Set(
      [...byAlias].flatMap(([name, j]) =>
        j === i || resolving.has(j) ? [] : [name],
      ),
    );
    const pieces = splitOnAliasRefs(item.text, refs, { doubleQuoted: true });
    let out: SqlPP | undefined;
    if (pieces.every(p => 'text' in p)) {
      out = sqlpp`${{ Raw: item.text }}`;
    } else {
      const parts: SqlPP[] = [];
      for (const piece of pieces) {
        if ('text' in piece) {
          parts.push({ statement: piece.text, parameters: {} });
          continue;
        }
        const ref = resolve(byAlias.get(piece.alias)!);
        if (ref == null) {
          parts.length = 0;
          break;
        }
        parts.push(sqlpp`(${ref})`);
      }
      out = parts.length ? concatSqlPP('', ...parts) : undefined;
    }
    resolving.delete(i);
    done.set(i, out);
    return out;
  };

  return items.map((_, i) => resolve(i));
}

/**
 * Plain-SQL select items' resolved text by alias, for a GROUP BY that names a
 * select alias (`groupBy: 'Model'`): ClickHouse groups by the aliased
 * expression, SQL++ cannot group by a projection alias. Aggregates and Lucene
 * items are not groupable, nor is anything that references them.
 */
export function groupableSelectAliases(
  select: SelectList | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(select)) return out;
  const pending: PendingSelectItem[] = select.map(item => {
    const alias = item.alias?.trim() || undefined;
    const text = item.valueExpression?.trim() ?? '';
    const isPlainSql =
      item.aggFn == null &&
      item.valueExpressionLanguage !== 'lucene' &&
      text !== '' &&
      text !== '*';
    return isPlainSql
      ? { alias, text: rewriteMapSubscripts(item.valueExpression) }
      : { alias, expr: undefined };
  });
  const resolved = resolveSelectAliases(pending);
  pending.forEach(({ alias }, i) => {
    const expr = resolved.at(i);
    if (
      alias &&
      expr &&
      !out.has(alias) &&
      Object.keys(expr.parameters).length === 0
    ) {
      out.set(alias, expr.statement);
    }
  });
  return out;
}
