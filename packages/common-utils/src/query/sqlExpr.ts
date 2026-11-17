import * as SQLParser from 'node-sql-parser';

import { quoteIdentifierIfNeeded } from '@/core/metadata';
import {
  extractSettingsClauseFromEnd,
  hashCode,
  type QuotedIdentifierReplacements,
  replaceBacktickedIdentifiers,
  replaceJsonExpressions,
  restoreReplacements,
  splitAndTrimWithBracket,
} from '@/core/utils';

const hash = (input: string | number) => Math.abs(hashCode(`${input}`));
const paramHash = (str: string | number) => {
  return `HYPERDX_PARAM_${hash(str)}`;
};

export type SqlFrag = {
  sql: string;
  params: Record<string, any>;
};

type ParamTypes =
  | SqlFrag
  | SqlFrag[]
  | { Identifier: string }
  | { String: string }
  | { Float32: number }
  | { Float64: number }
  | { Int32: number }
  | { Int64: number }
  | { UNSAFE_RAW_SQL: string }
  | string; // TODO: Deprecate raw string interpolation

export const sqlExpr = (
  strings: TemplateStringsArray,
  ...values: ParamTypes[]
): SqlFrag => {
  const sql = strings
    .map((str, i) => {
      const value = values[i];
      // if (typeof value === 'string') {
      //   console.error('Unsafe string detected', value, 'in', strings, values);
      // }
      return (
        str +
        (value == null
          ? ''
          : typeof value === 'string'
            ? value // If it's just a string sql literal
            : 'UNSAFE_RAW_SQL' in value
              ? value.UNSAFE_RAW_SQL
              : Array.isArray(value)
                ? value.map(v => v.sql).join('')
                : 'sql' in value
                  ? value.sql
                  : 'Identifier' in value
                    ? `{${paramHash(value.Identifier)}:Identifier}`
                    : 'String' in value
                      ? `{${paramHash(value.String)}:String}`
                      : 'Float32' in value
                        ? `{${paramHash(value.Float32)}:Float32}`
                        : 'Float64' in value
                          ? `{${paramHash(value.Float64)}:Float64}`
                          : 'Int32' in value
                            ? `{${paramHash(value.Int32)}:Int32}`
                            : 'Int64' in value
                              ? `{${paramHash(value.Int64)}:Int64}`
                              : '')
      );
    })
    .join('');

  return {
    sql,
    params: values.reduce((acc, value) => {
      return {
        ...acc,
        ...(value == null ||
        typeof value === 'string' ||
        'UNSAFE_RAW_SQL' in value
          ? {}
          : Array.isArray(value)
            ? value.reduce((acc, v) => {
                Object.assign(acc, v.params);
                return acc;
              }, {})
            : 'params' in value
              ? value.params
              : 'Identifier' in value
                ? { [paramHash(value.Identifier)]: value.Identifier }
                : 'String' in value
                  ? { [paramHash(value.String)]: value.String }
                  : 'Float32' in value
                    ? { [paramHash(value.Float32)]: value.Float32 }
                    : 'Float64' in value
                      ? { [paramHash(value.Float64)]: value.Float64 }
                      : 'Int32' in value
                        ? { [paramHash(value.Int32)]: value.Int32 }
                        : 'Int64' in value
                          ? { [paramHash(value.Int64)]: value.Int64 }
                          : {}),
      };
    }, {}),
  };
};

export const concatSqlExpr = (
  sep: string,
  ...args: (SqlFrag | SqlFrag[])[]
) => {
  return args.reduce(
    (acc: SqlFrag, arg) => {
      if (Array.isArray(arg)) {
        if (arg.length === 0) {
          return acc;
        }

        acc.sql +=
          (acc.sql.length > 0 ? sep : '') +
          arg
            .map(a => a.sql)
            .filter(Boolean) // skip empty string expressions
            .join(sep);
        acc.params = arg.reduce((acc, a) => {
          Object.assign(acc, a.params);
          return acc;
        }, acc.params);
      } else if (arg.sql.length > 0) {
        acc.sql += `${acc.sql.length > 0 ? sep : ''}${arg.sql}`;
        Object.assign(acc.params, arg.params);
      }
      return acc;
    },
    { sql: '', params: {} },
  );
};

const isSqlFragEmpty = (sqlExpr: SqlFrag | SqlFrag[]) => {
  if (Array.isArray(sqlExpr)) {
    return sqlExpr.every(c => c.sql.length === 0);
  }
  return sqlExpr.sql.length === 0;
};

export const wrapSqlExprIfNotEmpty = (
  sql: SqlFrag | SqlFrag[],
  left: string,
  right: string,
): SqlFrag | [] => {
  if (isSqlFragEmpty(sql)) {
    return [];
  }

  return sqlExpr`${left}${sql}${right}`;
};

export const extractColumnReferencesFromKey = (expr: string): string[] => {
  const parser = new SQLParser.Parser();

  const exprs = splitAndTrimWithBracket(expr);
  if (!exprs?.length) {
    return [];
  }

  return exprs.flatMap(expr => {
    try {
      // Extract map or array access expressions, e.g. map['key'] or array[1], since node-sql-parser does not support them.
      const mapAccessRegex = /\b[a-zA-Z0-9_]+\[([0-9]+|'[^']*')\]/g;
      const mapAccesses = expr.match(mapAccessRegex) || [];

      // Replace map/array accesses with a literal string ('') so that node-sql-parser ignores them
      const exprWithoutMaps = expr.replace(mapAccessRegex, "''");

      // Strip out any JSON type expressions, eg. in json.a.:Int64, remove the .:Int64 part
      const exprWithoutMapsOrJsonType = exprWithoutMaps.replace(
        /\.:[a-zA-Z0-9]+/g,
        '',
      );

      // Extract out any JSON path expressions, since node-sql-parser does not support them.
      const jsonPathRegex = /\b[a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+/g;
      const jsonPaths = exprWithoutMapsOrJsonType.match(jsonPathRegex) || [];

      // Replace JSON paths and map/array accesses with a literal string ('') so that node-sql-parser ignores them
      const exprWithoutMapsOrJson = exprWithoutMapsOrJsonType.replace(
        jsonPathRegex,
        "''",
      );

      // Parse remaining column references with node-sql-parser
      const parsedColumnList = parser
        .columnList(`select ${exprWithoutMapsOrJson}`)
        .map(col => col.split('::')[2]);

      return [...new Set([...parsedColumnList, ...jsonPaths, ...mapAccesses])];
    } catch (e) {
      console.error('Error parsing column references from key', e, expr);
      return [];
    }
  });
};

export const tableExpr = ({
  database,
  table,
}: {
  database: string;
  table: string;
}) => {
  return sqlExpr`${{ Identifier: database }}.${{ Identifier: table }}`;
};

/**
 * SELECT
 *  aggFnIf(fieldToColumn(field), where),
 *  timeBucketing(Granularity, timeConversion(fieldToColumn(field))),
 * FROM db.table
 * WHERE where
 * GROUP BY timeBucketing, fieldToColumn(groupBy)
 * ORDER BY orderBy
 */

export function parameterizedQueryToSql({
  sql,
  params,
}: {
  sql: string;
  params: Record<string, any>;
}) {
  return Object.entries(params).reduce((acc, [key, value]) => {
    return acc.replace(new RegExp(`{${key}:(\\w+)}`, 'g'), (_, type) => {
      return type === 'String' ? `'${value}'` : String(value);
    });
  }, sql);
}

// Table name used when re-parsing only the outer projection (see
// extractOuterSelectProjection). It is never executed, only fed to the parser.
const ALIAS_FALLBACK_TABLE = '__hdx_alias_src';

/**
 * Builds an alias map from a SELECT statement that node-sql-parser can parse.
 * Alias expressions are sliced out of `parsedSql` using the AST node
 * locations, so callers must pass the exact string that was parsed. Throws if
 * the SQL does not parse.
 */
function selectColumnsToAliasMap(
  parsedSql: string,
  jsonReplacements: Map<string, string>,
  identifierReplacements: QuotedIdentifierReplacements,
): Record<string, string> {
  const aliasMap: Record<string, string> = {};
  const parser = new SQLParser.Parser();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- astify returns union type
  const ast = parser.astify(parsedSql, {
    database: 'Postgresql',
    parseOptions: { includeLocations: true },
  }) as SQLParser.Select;

  // SQL++ assigns `$1`, `$2`, … to select items without an AS alias. Map those
  // result names back to the expression so ad hoc click-to-filter keys match
  // the upstream column naming (unaliased expression as the result name).
  let autoResultIndex = 0;

  if (ast.columns != null) {
    ast.columns.forEach(column => {
      const expressionFromLoc =
        column.expr.loc != null
          ? parsedSql.slice(
              column.expr.loc.start.offset,
              column.expr.loc.end.offset,
            )
          : undefined;

      if (column.as != null) {
        if (column.type === 'expr' && column.expr.type === 'column_ref') {
          const escapedColumnName = quoteIdentifierIfNeeded(
            column.expr.column.expr.value,
          );
          aliasMap[column.as] =
            column.expr.array_index && column.expr.array_index[0]?.brackets
              ? // alias with brackets, ex: ResourceAttributes['service.name'] as service_name
                `${escapedColumnName}['${column.expr.array_index[0].index.value}']`
              : // normal alias
                escapedColumnName;
        } else if (expressionFromLoc != null) {
          aliasMap[column.as] = expressionFromLoc;
        } else {
          console.error('Unknown alias column type', column);
        }
        // Bare column refs keep their name in SQL++; only computed expressions
        // without AS are auto-named `$1`, `$2`, …
      } else if (expressionFromLoc != null) {
        autoResultIndex += 1;
        aliasMap[`$${autoResultIndex}`] = expressionFromLoc;
      }
    });
  }

  // Replace the JSON replacement tokens with the original JSON expressions
  for (const [alias, aliasExpression] of Object.entries(aliasMap)) {
    for (const [replacement, original] of jsonReplacements) {
      if (aliasExpression.includes(replacement)) {
        aliasMap[alias] = aliasExpression.replaceAll(replacement, original);
      }
    }
  }

  // Replace the backticked identifier replacements with the original quoted identifiers
  const { quotedText, names } = identifierReplacements;
  return Object.fromEntries(
    Object.entries(aliasMap).map(([alias, aliasExpression]) => [
      names.get(alias) ?? alias,
      restoreReplacements(aliasExpression, quotedText),
    ]),
  );
}

/**
 * Returns the text of the outer SELECT projection (everything between the
 * top-level SELECT and its FROM). Leading WITH/CTE clauses, the WHERE clause,
 * and nested subqueries are skipped because their SELECT/FROM keywords sit
 * inside parentheses. Returns null when no top-level SELECT...FROM is found.
 *
 * Used as a fallback by sqlExprToAliasMap: the alias map only needs the outer
 * projection's `expr AS alias` pairs, so when the full statement is
 * unparseable by node-sql-parser (e.g. a sampling CTE containing
 * `CAST(x AS UInt32)`), re-parsing just the projection still recovers them.
 */
function extractOuterSelectProjection(sql: string): string | null {
  let parenDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let projectionStart = -1;

  const isWordChar = (c: string | undefined) =>
    c != null && /[A-Za-z0-9_]/.test(c);
  const matchesKeywordAt = (index: number, keyword: string): boolean => {
    if (sql.slice(index, index + keyword.length).toUpperCase() !== keyword) {
      return false;
    }
    // Require word boundaries so we don't match inside a longer identifier.
    return (
      !isWordChar(sql[index - 1]) && !isWordChar(sql[index + keyword.length])
    );
  };

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    // Skip over string / quoted-identifier contents so keywords and brackets
    // inside them are ignored.
    if (inSingleQuote) {
      if (c === "'") inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (c === '"') inDoubleQuote = false;
      continue;
    }
    if (inBacktick) {
      if (c === '`') inBacktick = false;
      continue;
    }
    // Skip SQL comments so keywords / brackets inside them are ignored.
    if (c === '-' && sql[i + 1] === '-') {
      const lineEnd = sql.indexOf('\n', i + 2);
      if (lineEnd === -1) break;
      i = lineEnd;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const blockEnd = sql.indexOf('*/', i + 2);
      if (blockEnd === -1) break;
      i = blockEnd + 1;
      continue;
    }
    if (c === "'") {
      inSingleQuote = true;
      continue;
    }
    if (c === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (c === '`') {
      inBacktick = true;
      continue;
    }
    if (c === '(') {
      parenDepth++;
      continue;
    }
    if (c === ')') {
      parenDepth--;
      continue;
    }
    if (parenDepth !== 0) {
      continue;
    }

    if (projectionStart === -1) {
      if (matchesKeywordAt(i, 'SELECT')) {
        projectionStart = i + 'SELECT'.length;
        i = projectionStart - 1;
      }
    } else if (matchesKeywordAt(i, 'FROM')) {
      return sql.slice(projectionStart, i).trim();
    }
  }

  return null;
}

/**
 * Renders `sqlExpr` and swaps the constructs node-sql-parser rejects (the
 * SETTINGS clause, backtick-quoted identifiers, JSON paths) for parseable
 * tokens. `restore` puts the originals back into text sliced from `sql`.
 */
/**
 * SQL++ `META(alias).id` is not valid Postgresql; node-sql-parser stops at the
 * `.id`. Replace with a plain identifier so alias-map parsing of the rest of
 * the SELECT projection can succeed. The original is not restored into filter
 * keys — row-id columns are never ad hoc filter targets.
 */
function stripMetaIdExpressions(sql: string): string {
  return sql.replace(/\bMETA\s*\([^)]*\)\s*\.\s*id\b/gi, '__cbt_meta_id');
}

function prepareSqlFragForParser(sqlExpr: SqlFrag) {
  const sql = parameterizedQueryToSql(sqlExpr);

  // Remove the SETTINGS clause because `SQLParser` doesn't understand it.
  const [sqlWithoutSettingsClause] = extractSettingsClauseFromEnd(sql);

  const sqlWithoutMetaId = stripMetaIdExpressions(sqlWithoutSettingsClause);

  // Replace backtick-quoted identifiers with placeholder tokens so that a
  // quoted alias doesn't fail the parse
  const {
    sqlWithReplacements: sqlWithoutBackticks,
    replacements: identifierReplacements,
  } = replaceBacktickedIdentifiers(sqlWithoutMetaId);

  // Replace JSON expressions with replacement tokens so that node-sql-parser can parse the SQL
  const { sqlWithReplacements, replacements: jsonReplacements } =
    replaceJsonExpressions(sqlWithoutBackticks);

  return {
    sql: sqlWithReplacements,
    jsonReplacements,
    identifierReplacements,
    // JSON first: its stored text can hold identifier tokens.
    restore: (expression: string) =>
      restoreReplacements(
        restoreReplacements(expression, jsonReplacements),
        identifierReplacements.quotedText,
      ),
  };
}

export function sqlExprToAliasMap(
  sqlExpr: SqlFrag | undefined,
): Record<string, string> {
  if (sqlExpr == null || !sqlExpr.sql) {
    return {};
  }

  try {
    const { sql, jsonReplacements, identifierReplacements } =
      prepareSqlFragForParser(sqlExpr);

    try {
      return selectColumnsToAliasMap(
        sql,
        jsonReplacements,
        identifierReplacements,
      );
    } catch (fullParseError) {
      // node-sql-parser's Postgresql dialect rejects some legacy store-specific
      // SQL (e.g. `CAST(x AS UInt32)` in a sampling CTE, or parameterized
      // identifiers). The alias map only needs the outer SELECT projection, so
      // retry with `SELECT <projection> FROM <table>` before giving up.
      const projection = extractOuterSelectProjection(sql);
      if (projection == null) {
        throw fullParseError;
      }
      return selectColumnsToAliasMap(
        `SELECT ${projection} FROM ${ALIAS_FALLBACK_TABLE}`,
        jsonReplacements,
        identifierReplacements,
      );
    }
  } catch (e) {
    console.error(
      'Error parsing alias map with JSON removed',
      e,
      'for query',
      sqlExpr,
    );
  }

  return {};
}

const isNumberLiteral = (
  expr: unknown,
): expr is { type: 'number'; value: number } =>
  typeof expr === 'object' &&
  expr != null &&
  'type' in expr &&
  expr.type === 'number' &&
  'value' in expr &&
  typeof expr.value === 'number';

/** An item of a query's outer SELECT list, in projection order. */
export type SelectColumn = {
  /** The item's expression, without its alias. */
  expression: string;
  /** Whether the outer GROUP BY lists the item (by expression, alias, or position). */
  isGroupBy: boolean;
};

/**
 * The outer SELECT list of `sqlExpr`, in order, so the i-th item lines up with
 * the i-th result column even where legacy store renames an unaliased
 * expression's column. Undefined when the query doesn't parse, has no GROUP BY
 * (or `GROUP BY ALL`, which doesn't parse), or selects `*`.
 */
export function sqlExprToSelectColumns(
  sqlExpr: SqlFrag | undefined,
): SelectColumn[] | undefined {
  if (sqlExpr == null || !sqlExpr.sql) return undefined;

  try {
    const { sql, restore, identifierReplacements } =
      prepareSqlFragForParser(sqlExpr);
    const parser = new SQLParser.Parser();
    const options = {
      database: 'Postgresql',
      parseOptions: { includeLocations: true },
    };
    const ast = parser.astify(sql, options);
    if (Array.isArray(ast) || ast.type !== 'select') return undefined;

    const columns = ast.columns;
    const groupBy = ast.groupby?.columns;
    if (!Array.isArray(columns) || !groupBy?.length) return undefined;

    // Each backtick-quoted occurrence gets its own token, so identifiers
    // compare by the name the token stands for.
    const bareName = (name: string) =>
      identifierReplacements.names.get(name) ?? name;
    // Unquoted, so `"svc"` matches `svc`; printing would keep the quotes.
    const columnRefName = (
      expr: SQLParser.ExpressionValue,
    ): string | undefined => {
      if (expr.type !== 'column_ref' || !('column' in expr) || expr.table) {
        return undefined;
      }
      const name =
        typeof expr.column === 'string' ? expr.column : expr.column.expr.value;
      return typeof name === 'string' ? bareName(name) : undefined;
    };
    // Case-, whitespace- and outer-parentheses-insensitive, so `lower(x)`
    // matches `(LOWER( x ))`.
    const normalize = (expr: SQLParser.ExpressionValue) =>
      restore(parser.exprToSQL({ ...expr, parentheses: false }, options))
        .replace(/\s+/g, '')
        .toLowerCase();
    const groupByNames = new Set<string>();
    const groupByPositions = new Set<number>();
    const groupByExpressions = new Set<string>();
    for (const item of groupBy) {
      // The parser's types omit the number literal of `GROUP BY 1`.
      const literal: unknown = item;
      if (isNumberLiteral(literal)) {
        groupByPositions.add(literal.value - 1);
      } else {
        const name = columnRefName(item);
        if (name != null) groupByNames.add(name);
        groupByExpressions.add(normalize(item));
      }
    }

    const selectColumns: SelectColumn[] = [];
    for (const [index, column] of columns.entries()) {
      const { expr } = column;
      if (
        expr.type === 'column_ref' &&
        parser.exprToSQL(expr, options) === '*'
      ) {
        return undefined;
      }
      // Column references carry no location, so they are printed instead.
      // The location of a binary expression can take in trailing whitespace.
      const text =
        expr.loc != null
          ? sql.slice(expr.loc.start.offset, expr.loc.end.offset).trim()
          : parser.exprToSQL(expr, options);
      const alias =
        typeof column.as === 'string' ? column.as : column.as?.value;
      const name = columnRefName(expr);
      selectColumns.push({
        expression: restore(text),
        isGroupBy:
          groupByPositions.has(index) ||
          (alias != null && groupByNames.has(bareName(alias))) ||
          (name != null && groupByNames.has(name)) ||
          groupByExpressions.has(normalize(expr)),
      });
    }
    return selectColumns;
  } catch {
    return undefined;
  }
}
