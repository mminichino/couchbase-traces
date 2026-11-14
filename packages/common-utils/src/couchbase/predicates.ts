import { toIso30 } from '@/couchbase/time';
import { JSDataType } from '@/query';

import type { ResolvedField } from './fields';

export type ParamBag = {
  params: Record<string, unknown>;
  add(value: unknown): string;
};

export function createParamBag(): ParamBag {
  const params: Record<string, unknown> = {};
  let n = 0;
  return {
    params,
    add(value) {
      const name = `s${n++}`;
      // Names are generated `sN` counters, copied in one entry so the bag
      // stays a plain record the serializer can spread into a statement.
      Object.assign(params, Object.fromEntries([[name, value]]));
      return `$${name}`;
    },
  };
}

export function negate(sql: string, negated: boolean): string {
  return negated ? `NOT (${sql})` : sql;
}

export function likePattern(
  term: string,
  prefixWildcard: boolean,
  suffixWildcard: boolean,
): string {
  const escaped = term.toLowerCase().replace(/[\\%_]/g, ch => `\\${ch}`);
  const both = !prefixWildcard && !suffixWildcard;
  const pre = prefixWildcard || both ? '%' : '';
  const suf = suffixWildcard || both ? '%' : '';
  return `${pre}${escaped}${suf}`;
}

const LIKE_ESCAPE = ' ESCAPE "\\\\"';

export function likeExpr(expr: string, pattern: string, bag: ParamBag): string {
  return `LOWER(${expr}) LIKE ${bag.add(pattern)}${LIKE_ESCAPE}`;
}

export function eqExpr(
  field: ResolvedField,
  term: string,
  negated: boolean,
  bag: ParamBag,
): string {
  if (field.kind === 'not_found') return negated ? 'TRUE' : 'FALSE';
  if (field.kind === 'map_key') return eqMap(field, term, negated, bag);
  if (field.kind === 'array_element') {
    const v = bag.add(coerce(term, field.jsType));
    return negate(
      `ANY e IN ${field.arrayExpr} SATISFIES ${field.elementExpr} = ${v} END`,
      negated,
    );
  }
  const js = jsOf(field);
  if (js === JSDataType.Number) {
    if (term.trim() === '' || Number.isNaN(Number(term))) {
      return negated ? 'TRUE' : 'FALSE';
    }
    return negate(`${exprOf(field)} = ${bag.add(Number(term))}`, negated);
  }
  if (js === JSDataType.Bool) return eqBool(exprOf(field), term, negated, bag);
  if (js === JSDataType.Date) {
    return negate(`${exprOf(field)} = ${bag.add(dateTerm(term))}`, negated);
  }
  return negate(`${exprOf(field)} = ${bag.add(term)}`, negated);
}

export function isNotNullExpr(
  field: ResolvedField,
  negated: boolean,
  bag: ParamBag,
): string {
  if (field.kind === 'not_found') return negated ? 'TRUE' : 'FALSE';
  if (field.kind === 'map_key') {
    return negate(
      `ANY k IN OBJECT_NAMES(${field.mapExpr}) SATISFIES k = ${bag.add(field.key)} END`,
      negated,
    );
  }
  if (field.kind === 'array_element') {
    return negate(
      `ANY e IN ${field.arrayExpr} SATISFIES ${field.elementExpr} IS VALUED END`,
      negated,
    );
  }
  const x = exprOf(field);
  const positive =
    jsOf(field) === JSDataType.String
      ? `(${x} IS VALUED AND ${x} != "")`
      : `${x} IS VALUED`;
  return negate(positive, negated);
}

export function cmpExpr(
  field: ResolvedField,
  op: '>' | '>=' | '<' | '<=',
  term: string,
  bag: ParamBag,
): string {
  if (field.kind === 'not_found') return 'FALSE';
  if (field.kind === 'array_element') {
    throw new Error(`${op} comparison is not supported for Array-type fields`);
  }
  const js = jsOf(field);
  const value =
    js === JSDataType.Number && !Number.isNaN(Number(term))
      ? Number(term)
      : js === JSDataType.Date
        ? dateTerm(term)
        : term;
  return `${exprOf(field)} ${op} ${bag.add(value)}`;
}

export function rangeExpr(
  field: ResolvedField,
  start: string,
  end: string,
  negated: boolean,
  inclusive: 'both' | 'left' | 'right' | 'none',
  bag: ParamBag,
): string {
  if (field.kind === 'not_found') return negated ? 'TRUE' : 'FALSE';
  if (field.kind === 'array_element') {
    throw new Error('range comparison is not supported for Array-type fields');
  }
  const x = exprOf(field);
  const openStart = start === '*';
  const openEnd = end === '*';
  if (openStart && openEnd) return negate(`${x} IS VALUED`, negated);
  const parts: string[] = [];
  if (!openStart) {
    const op = inclusive === 'both' || inclusive === 'left' ? '>=' : '>';
    parts.push(cmpExpr(field, op, start, bag));
  }
  if (!openEnd) {
    const op = inclusive === 'both' || inclusive === 'right' ? '<=' : '<';
    parts.push(cmpExpr(field, op, end, bag));
  }
  return negate(parts.join(' AND '), negated);
}

export function searchObject(
  term: string,
  fieldName: string,
  timeRange?: { from: string; to: string; field: string },
): Record<string, unknown> {
  const phrase = /\s/.test(term);
  const match = phrase
    ? { match_phrase: term, field: fieldName }
    : { match: term, field: fieldName, operator: 'and' };
  if (!timeRange) return match;
  return {
    conjuncts: [
      match,
      {
        start: timeRange.from,
        end: timeRange.to,
        inclusive_start: true,
        inclusive_end: true,
        field: timeRange.field,
      },
    ],
  };
}

function eqMap(
  field: Extract<ResolvedField, { kind: 'map_key' }>,
  term: string,
  negated: boolean,
  bag: ParamBag,
): string {
  if (term === '') {
    const x = field.expr;
    return negated
      ? `(${x} IS NOT MISSING AND ${x} != "")`
      : `(${x} = "" OR ${x} IS MISSING)`;
  }
  const kv = bag.add(`${field.key}=${term}`);
  return negate(
    `ANY p IN OBJECT_PAIRS(${field.mapExpr}) SATISFIES (p.\`name\` || "=" || p.\`val\`) = ${kv} END`,
    negated,
  );
}

function eqBool(
  expr: string,
  term: string,
  negated: boolean,
  bag: ParamBag,
): string {
  const norm = term.trim().toLowerCase();
  if (norm === 'true' || norm === 'false') {
    return negate(`${expr} = ${bag.add(norm === 'true')}`, negated);
  }
  if (/^-?\d+$/.test(norm)) {
    return negate(`${expr} = (${bag.add(Number(norm))} != 0)`, negated);
  }
  return negated ? 'TRUE' : 'FALSE';
}

function exprOf(field: ResolvedField): string {
  if (
    field.kind === 'column' ||
    field.kind === 'json_path' ||
    field.kind === 'implicit'
  ) {
    return field.expr;
  }
  if (field.kind === 'map_key') return field.expr;
  if (field.kind === 'array_element') return field.elementExpr;
  return 'FALSE';
}

function jsOf(field: ResolvedField): JSDataType {
  if (
    field.kind === 'column' ||
    field.kind === 'json_path' ||
    field.kind === 'array_element'
  ) {
    return field.jsType;
  }
  if (field.kind === 'map_key') return JSDataType.String;
  if (field.kind === 'implicit') return JSDataType.String;
  return JSDataType.String;
}

function coerce(term: string, js: JSDataType): unknown {
  if (js === JSDataType.Number && !Number.isNaN(Number(term)))
    return Number(term);
  if (js === JSDataType.Date) return dateTerm(term);
  if (js === JSDataType.Bool) {
    const norm = term.trim().toLowerCase();
    if (norm === 'true') return true;
    if (norm === 'false') return false;
  }
  return term;
}

function dateTerm(term: string): string {
  const parsed = Date.parse(term);
  if (Number.isNaN(parsed) || !term.includes('-')) return term;
  return toIso30(new Date(parsed));
}
