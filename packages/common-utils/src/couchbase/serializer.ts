import lucene from '@hyperdx/lucene';

import { JSDataType } from '@/clickhouse';
import { concatSqlPP, type SqlPP } from '@/couchbase/sqlpp';
import { genWhereSQL, parse } from '@/queryParser';

import type { FieldContext, ResolvedField } from './fields';
import { resolveField } from './fields';
import {
  cmpExpr,
  createParamBag,
  eqExpr,
  isNotNullExpr,
  likeExpr,
  likePattern,
  negate,
  type ParamBag,
  rangeExpr,
  searchObject,
} from './predicates';

export type SerializerMetadata = {
  getColumns(args: {
    connectionId: string;
    databaseName: string;
    tableName: string;
    scopeName?: string;
  }): Promise<{ name: string; type: string }[]>;
};

export type CouchbaseSerializerOptions = {
  metadata: SerializerMetadata;
  tc: {
    connectionId: string;
    databaseName: string;
    scopeName: string;
    tableName: string;
  };
  alias: string;
  implicitColumnExpression?: string;
  bodyExpression?: string;
  searchIndexName?: string;
  searchFields?: string[];
  timeRange?: { from: string; to: string; field: string };
};

type Inclusive = 'both' | 'left' | 'right' | 'none';

export class CouchbaseSerializer {
  readonly params: Record<string, unknown>;
  private readonly bag: ParamBag;
  private readonly opts: CouchbaseSerializerOptions;
  private columns?: Promise<{ name: string; type: string }[]>;

  constructor(opts: CouchbaseSerializerOptions) {
    this.opts = opts;
    this.bag = createParamBag();
    this.params = this.bag.params;
  }

  operator(op: lucene.Operator, _ctx?: FieldContext): string {
    switch (op as string) {
      case 'NOT':
      case 'AND NOT':
        return 'AND NOT';
      case 'OR NOT':
        return 'OR NOT';
      case '&&':
      case '<implicit>':
      case 'AND':
        return 'AND';
      case '||':
      case 'OR':
        return 'OR';
      default:
        throw new Error(`Unexpected operator. ${op}`);
    }
  }

  eq(field: string, term: string, negated: boolean, ctx: FieldContext) {
    return this.with(field, ctx, resolved =>
      eqExpr(resolved, term, negated, this.bag),
    );
  }

  isNotNull(field: string, negated: boolean, ctx: FieldContext) {
    return this.with(field, ctx, resolved =>
      isNotNullExpr(resolved, negated, this.bag),
    );
  }

  gte(field: string, term: string, ctx: FieldContext) {
    return this.cmp(field, '>=', term, ctx);
  }

  lte(field: string, term: string, ctx: FieldContext) {
    return this.cmp(field, '<=', term, ctx);
  }

  lt(field: string, term: string, ctx: FieldContext) {
    return this.cmp(field, '<', term, ctx);
  }

  gt(field: string, term: string, ctx: FieldContext) {
    return this.cmp(field, '>', term, ctx);
  }

  range(
    field: string,
    start: string,
    end: string,
    negated: boolean,
    ctx: FieldContext,
    inclusive: Inclusive = 'both',
  ) {
    return this.with(field, ctx, resolved =>
      rangeExpr(resolved, start, end, negated, inclusive, this.bag),
    );
  }

  fieldSearch(
    field: string,
    term: string,
    negated: boolean,
    prefixWildcard: boolean,
    suffixWildcard: boolean,
    ctx: FieldContext,
  ) {
    return this.with(field, ctx, resolved =>
      this.search(resolved, term, negated, prefixWildcard, suffixWildcard),
    );
  }

  private cmp(
    field: string,
    op: '>' | '>=' | '<' | '<=',
    term: string,
    ctx: FieldContext,
  ) {
    return this.with(field, ctx, resolved =>
      cmpExpr(resolved, op, term, this.bag),
    );
  }

  private async with(
    field: string,
    ctx: FieldContext,
    render: (field: ResolvedField) => string,
  ): Promise<string> {
    const columns = await this.loadColumns();
    const resolved = await resolveField(field, this.opts, ctx, columns);
    return render(resolved);
  }

  private loadColumns() {
    this.columns ??= this.opts.metadata.getColumns({
      connectionId: this.opts.tc.connectionId,
      databaseName: this.opts.tc.databaseName,
      tableName: this.opts.tc.tableName,
      scopeName: this.opts.tc.scopeName,
    });
    return this.columns;
  }

  private search(
    field: ResolvedField,
    term: string,
    negated: boolean,
    prefixWildcard: boolean,
    suffixWildcard: boolean,
  ): string {
    if (field.kind === 'not_found') return negated ? 'TRUE' : 'FALSE';
    if (term === '') return 'TRUE';
    const js = jsOf(field);
    if (js === JSDataType.Number || js === JSDataType.Bool) {
      return eqExpr(field, term, negated, this.bag);
    }
    if (
      field.kind === 'implicit' &&
      field.searchable &&
      !prefixWildcard &&
      !suffixWildcard
    ) {
      return this.searchIndex(field, term, negated);
    }
    // Unquoted map filters are the common attribute predicate. Equality on
    // `name=value` is what the Phase 5 array index is defined for.
    if (field.kind === 'map_key' && !prefixWildcard && !suffixWildcard) {
      return eqExpr(field, term, negated, this.bag);
    }
    if (field.kind === 'array_element') {
      const pattern = likePattern(term, prefixWildcard, suffixWildcard);
      return negate(
        `ANY e IN ${field.arrayExpr} SATISFIES ${likeExpr(field.elementExpr, pattern, this.bag)} END`,
        negated,
      );
    }
    const target =
      field.kind === 'map_key' ||
      field.kind === 'implicit' ||
      field.kind === 'column' ||
      field.kind === 'json_path'
        ? field.expr
        : 'FALSE';
    return negate(
      likeExpr(
        target,
        likePattern(term, prefixWildcard, suffixWildcard),
        this.bag,
      ),
      negated,
    );
  }

  private searchIndex(
    field: Extract<ResolvedField, { kind: 'implicit' }>,
    term: string,
    negated: boolean,
  ): string {
    const name = bareName(field.expr);
    const q = this.bag.add(searchObject(term, name, this.opts.timeRange));
    const idx = this.bag.add(this.opts.searchIndexName);
    return negate(
      `SEARCH(${this.opts.alias}, ${q}, {"index": ${idx}})`,
      negated,
    );
  }
}

export class CouchbaseSearchBuilder {
  private readonly serializer: CouchbaseSerializer;
  private readonly query: string;
  private readonly extra: SqlPP[] = [];

  constructor(query: string, opts: CouchbaseSerializerOptions) {
    this.query = query;
    this.serializer = new CouchbaseSerializer(opts);
  }

  and(condition: SqlPP): this {
    if (condition.statement.trim()) this.extra.push(condition);
    return this;
  }

  async build(): Promise<SqlPP> {
    const parts: SqlPP[] = [];
    if (this.query.trim()) {
      const statement = await genWhereSQL(parse(this.query), this.serializer);
      if (statement.trim()) {
        parts.push({
          statement: `(${statement})`,
          parameters: { ...this.serializer.params },
        });
      }
    }
    for (const condition of this.extra) {
      parts.push({
        statement: `(${condition.statement})`,
        parameters: condition.parameters,
      });
    }
    if (parts.length === 0) return { statement: '', parameters: {} };
    return concatSqlPP(' AND ', parts);
  }
}

function jsOf(field: ResolvedField): JSDataType {
  if (
    field.kind === 'column' ||
    field.kind === 'json_path' ||
    field.kind === 'array_element'
  ) {
    return field.jsType;
  }
  return JSDataType.String;
}

function bareName(expr: string): string {
  const parts = expr.split('.');
  const last = parts[parts.length - 1] ?? expr;
  return last.replace(/^`/, '').replace(/`$/, '');
}
