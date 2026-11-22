import { columnTypeToJSType, JSDataType } from '@/query';
import { IMPLICIT_FIELD } from '@/queryParser';

import type { CouchbaseSerializerOptions } from './serializer';
import { quoteIdent } from './sqlpp';

export type ResolvedField =
  | { kind: 'column'; expr: string; type: string; jsType: JSDataType }
  | {
      kind: 'map_key';
      mapExpr: string;
      mapColumn: string;
      key: string;
      expr: string;
    }
  | { kind: 'json_path'; expr: string; type: string; jsType: JSDataType }
  | {
      kind: 'array_element';
      arrayExpr: string;
      varName: 'e';
      elementExpr: string;
      elementIsMap: boolean;
      mapKey?: string;
      jsType: JSDataType;
    }
  | { kind: 'implicit'; expr: string; searchable: boolean }
  | { kind: 'not_found' };

type Column = { name: string; type: string };

export type FieldContext = {
  implicitColumnExpression?: string;
  bodyExpression?: string;
  isNegatedAndParenthesized?: boolean;
};

export async function resolveField(
  field: string,
  opts: CouchbaseSerializerOptions,
  context?: FieldContext,
  columns?: Column[],
): Promise<ResolvedField> {
  const cols =
    columns ??
    (await opts.metadata.getColumns({
      connectionId: opts.tc.connectionId,
      databaseName: opts.tc.databaseName,
      tableName: opts.tc.tableName,
      scopeName: opts.tc.scopeName,
    }));
  return resolveAgainst(field, opts, cols, context);
}

function resolveAgainst(
  field: string,
  opts: CouchbaseSerializerOptions,
  columns: Column[],
  context?: FieldContext,
): ResolvedField {
  if (field === IMPLICIT_FIELD) return resolveImplicit(opts, columns, context);
  // A query alias (LET variable) shadows a column of the same name, as a
  // ClickHouse WITH alias does. Its type is unknown, so it compares as text.
  if (opts.letAliases?.includes(field)) {
    return {
      kind: 'column',
      expr: quoteIdent(field),
      type: 'String',
      jsType: JSDataType.String,
    };
  }
  const exact = columns.find(c => c.name === field);
  if (exact) return asColumn(exact, opts.alias);
  const parts = field.split('.');
  for (let i = 1; i < parts.length; i++) {
    const prefix = parts.slice(0, i).join('.');
    const col = columns.find(c => c.name === prefix);
    if (!col) continue;
    return withRemainder(col, parts.slice(i), opts.alias);
  }
  return { kind: 'not_found' };
}

function resolveImplicit(
  opts: CouchbaseSerializerOptions,
  columns: Column[],
  context?: FieldContext,
): ResolvedField {
  const override = context?.implicitColumnExpression;
  if (override && isFieldName(override)) {
    return resolveAgainst(override, opts, columns);
  }
  const raw =
    override ??
    context?.bodyExpression ??
    opts.implicitColumnExpression ??
    opts.bodyExpression;
  if (!raw) return { kind: 'not_found' };
  const bare = bareField(raw);
  const searchable = Boolean(
    opts.searchIndexName && bare && opts.searchFields?.includes(bare),
  );
  return { kind: 'implicit', expr: qualify(raw, opts.alias), searchable };
}

function asColumn(col: Column, alias: string): ResolvedField {
  const jsType = columnTypeToJSType(col.type) ?? JSDataType.String;
  return {
    kind: 'column',
    expr: `${alias}.${quoteIdent(col.name)}`,
    type: col.type,
    jsType,
  };
}

function withRemainder(
  col: Column,
  rest: string[],
  alias: string,
): ResolvedField {
  const jsType = columnTypeToJSType(col.type) ?? JSDataType.String;
  let quoted: string;
  try {
    quoted = `${alias}.${quoteIdent(col.name)}`;
  } catch (err) {
    console.debug('Rejecting column name', err);
    return { kind: 'not_found' };
  }
  if (jsType === JSDataType.Map) {
    const key = rest.join('.');
    let keySql: string;
    try {
      keySql = quoteIdent(key);
    } catch (err) {
      console.debug('Rejecting map key', err);
      return { kind: 'not_found' };
    }
    return {
      kind: 'map_key',
      mapExpr: quoted,
      mapColumn: col.name,
      key,
      expr: `${quoted}.${keySql}`,
    };
  }
  if (jsType === JSDataType.JSON) {
    try {
      const path = rest.map(part => quoteIdent(part)).join('.');
      return {
        kind: 'json_path',
        expr: `${quoted}.${path}`,
        type: 'String',
        jsType: JSDataType.String,
      };
    } catch (err) {
      console.debug('Rejecting JSON path', err);
      return { kind: 'not_found' };
    }
  }
  if (jsType === JSDataType.Array) {
    const inner = arrayInner(col.type);
    const elementField = rest[0];
    const mapKey = rest.length > 1 ? rest.slice(1).join('.') : undefined;
    const elementIsMap =
      inner.startsWith('Map') || (inner === 'JSON' && mapKey != null);
    let elementExpr = `e.${quoteIdent(elementField)}`;
    if (mapKey) {
      try {
        elementExpr = `${elementExpr}.${quoteIdent(mapKey)}`;
      } catch (err) {
        console.debug('Rejecting array map key', err);
        return { kind: 'not_found' };
      }
    }
    return {
      kind: 'array_element',
      arrayExpr: quoted,
      varName: 'e',
      elementExpr,
      elementIsMap,
      mapKey,
      jsType: columnTypeToJSType(inner) ?? JSDataType.String,
    };
  }
  return { kind: 'not_found' };
}

function arrayInner(type: string): string {
  const match = /^Array\((.*)\)$/.exec(type.trim());
  return match?.[1] ?? 'JSON';
}

function isFieldName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value);
}

function bareField(expr: string): string | undefined {
  const trimmed = expr.trim();
  return isFieldName(trimmed) ? trimmed : undefined;
}

function qualify(expr: string, alias: string): string {
  const bare = bareField(expr);
  if (!bare) return expr;
  return bare
    .split('.')
    .map((part, i) =>
      i === 0 ? `${alias}.${quoteIdent(part)}` : quoteIdent(part),
    )
    .join('.');
}
