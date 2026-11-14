import lucene from '@hyperdx/lucene';

import { Metadata, TableConnection } from '@/core/metadata';
import {
  columnTypeToJSType,
  extractInnerArrayJSType,
  JSDataType,
} from '@/query/columnTypes';
import type { ColumnMeta } from '@/query/types';

/**
 * Sequences the lucene grammar can't parse, placeholder-encoded before
 * parsing. `source` restores the original query spelling; `value` is the
 * raw value the sequence represents (lucene escaping dropped).
 */
const SPECIAL_TOKEN_ENCODINGS = [
  {
    encodePattern: /\\\\/g,
    placeholder: 'HDX_BACKSLASH_LITERAL',
    decodePattern: /HDX_BACKSLASH_LITERAL/g,
    source: '\\\\',
    value: '\\',
  },
  {
    encodePattern: /http:\/\//g,
    placeholder: 'http_COLON_//',
    decodePattern: /http_COLON_\/\//g,
    source: 'http://',
    value: 'http://',
  },
  {
    encodePattern: /https:\/\//g,
    placeholder: 'https_COLON_//',
    decodePattern: /https_COLON_\/\//g,
    source: 'https://',
    value: 'https://',
  },
  {
    encodePattern: /localhost:(\d{1,5})/g,
    placeholder: 'localhost_COLON_$1',
    decodePattern: /localhost_COLON_(\d{1,5})/g,
    source: 'localhost:$1',
    value: 'localhost:$1',
  },
  {
    encodePattern: /\\:/g,
    placeholder: 'HDX_COLON',
    decodePattern: /HDX_COLON/g,
    source: '\\:',
    value: ':',
  },
] as const;

export function encodeSpecialTokens(query: string): string {
  return SPECIAL_TOKEN_ENCODINGS.reduce(
    (encoded, { encodePattern, placeholder }) =>
      encoded.replace(encodePattern, placeholder),
    query,
  );
}

/** Decode placeholders (and `\"`) to the raw values the sequences represent. */
function decodeSpecialTokens(query: string): string {
  return SPECIAL_TOKEN_ENCODINGS.reduce(
    (decoded, { decodePattern, value }) =>
      decoded.replace(decodePattern, value),
    query.replace(/\\"/g, '"'),
  );
}

/** Lossless inverse of `encodeSpecialTokens`: placeholders back to their original query spelling. */
export function decodeSpecialTokensToSource(query: string): string {
  return SPECIAL_TOKEN_ENCODINGS.reduce(
    (decoded, { decodePattern, source }) =>
      decoded.replace(decodePattern, source),
    query,
  );
}

export function parse(query: string): lucene.AST {
  return lucene.parse(encodeSpecialTokens(query));
}

export const IMPLICIT_FIELD = '<implicit>';

export type CustomSchemaConfig = {
  databaseName: string;
  tableName: string;
  connectionId: string;
};

// Type guards for lucene AST types
function isNodeTerm(node: lucene.Node | lucene.AST): node is lucene.NodeTerm {
  return 'term' in node && node.term != null;
}

function isNodeRangedTerm(
  node: lucene.Node | lucene.AST,
): node is lucene.NodeRangedTerm {
  return 'inclusive' in node && node.inclusive != null;
}

function isBinaryAST(ast: lucene.AST | lucene.Node): ast is lucene.BinaryAST {
  return 'right' in ast && ast.right != null;
}

function hasStart(
  ast: lucene.BinaryAST,
): ast is lucene.BinaryAST & { start: lucene.Operator } {
  return 'start' in ast && !!ast.start;
}

function isLeftOnlyAST(
  ast: lucene.AST | lucene.Node,
): ast is lucene.LeftOnlyAST {
  return (
    'left' in ast && ast.left != null && !('right' in ast && ast.right != null)
  );
}

/**
 * Find and return the column metadata for the column in the
 * given table with the shortest name that matches a
 * prefix of the given dot-separated field.
 *
 * eg. for field 'a.b.c', check for columns 'a', 'a.b', 'a.b.c' in order.
 **/
async function findPrefixMatch({
  field,
  metadata,
  databaseName,
  tableName,
  connectionId,
}: {
  field: string;
  metadata: Metadata;
  databaseName: string;
  tableName: string;
  connectionId: string;
}): Promise<ColumnMeta | undefined> {
  const fieldParts = field.split('.');
  let fieldPrefix = '';

  for (const part of fieldParts) {
    fieldPrefix = fieldPrefix ? `${fieldPrefix}.${part}` : part;
    const prefixMatch = await metadata.getColumn({
      databaseName,
      tableName,
      column: fieldPrefix,
      connectionId,
    });

    if (prefixMatch) {
      return prefixMatch;
    }
  }
}

interface SerializerContext {
  /** The current implicit column expression, indicating which SQL expression to use when comparing a term to the '<implicit>' field */
  implicitColumnExpression?: string;
  /**
   * Fallback used when implicitColumnExpression is unset. Mirrors the one-way
   * fallback `getEventBody` already implements for row display: an admin who
   * sets only the Body Expression on a log source can still run bare-text
   * Lucene search.
   */
  bodyExpression?: string;
  isNegatedAndParenthesized?: boolean;
}

export interface Serializer {
  operator(op: lucene.Operator, context: SerializerContext): string;
  eq(
    field: string,
    term: string,
    isNegatedField: boolean,
    context: SerializerContext,
  ): Promise<string>;
  isNotNull(
    field: string,
    isNegatedField: boolean,
    context: SerializerContext,
  ): Promise<string>;
  gte(field: string, term: string, context: SerializerContext): Promise<string>;
  lte(field: string, term: string, context: SerializerContext): Promise<string>;
  lt(field: string, term: string, context: SerializerContext): Promise<string>;
  gt(field: string, term: string, context: SerializerContext): Promise<string>;
  fieldSearch(
    field: string,
    term: string,
    isNegatedField: boolean,
    prefixWildcard: boolean,
    suffixWildcard: boolean,
    context: SerializerContext,
  ): Promise<string>;
  range(
    field: string,
    start: string,
    end: string,
    isNegatedField: boolean,
    context: SerializerContext,
    inclusive?: lucene.NodeRangedTerm['inclusive'],
  ): Promise<string>;
}

class EnglishSerializer implements Serializer {
  private metadata: Metadata;
  private tableName: string;
  private databaseName: string;
  private connectionId: string;

  constructor({
    metadata,
    databaseName,
    tableName,
    connectionId,
  }: { metadata: Metadata } & CustomSchemaConfig) {
    this.metadata = metadata;
    this.databaseName = databaseName;
    this.tableName = tableName;
    this.connectionId = connectionId;
  }

  private translateField(field: string, context: SerializerContext) {
    if (field === IMPLICIT_FIELD) {
      return context.implicitColumnExpression ?? 'event';
    }

    return `'${field}'`;
  }

  private async getFieldType(field: string) {
    const column = await findPrefixMatch({
      field,
      metadata: this.metadata,
      databaseName: this.databaseName,
      tableName: this.tableName,
      connectionId: this.connectionId,
    });
    const fieldParts = field.split('.');
    const fieldPostfix = fieldParts
      .slice(column ? column.name.split('.').length : 0)
      .join('.');

    if (!column) {
      return {
        isArray: false,
        type: null,
      };
    }

    let jsType = columnTypeToJSType(column.type);
    const isArray = jsType === JSDataType.Array;
    if (isArray && extractInnerArrayJSType(column.type)) {
      jsType = extractInnerArrayJSType(column.type);
    }

    return { isArray, type: jsType, fieldPostfix, column: column.name };
  }

  operator(op: lucene.Operator) {
    switch (op) {
      case 'NOT':
      case 'AND NOT':
        return 'AND NOT';
      case 'OR NOT':
        return 'OR NOT';
      // @ts-expect-error TODO: Types need to be fixed upstream
      case '&&':
      case '<implicit>':
      case 'AND':
        return 'AND';
      // @ts-expect-error TODO: Types need to be fixed upstream
      case '||':
      case 'OR':
        return 'OR';
      default:
        throw new Error(`Unexpected operator. ${op}`);
    }
  }

  async eq(
    field: string,
    term: string,
    isNegatedField: boolean,
    context: SerializerContext,
  ) {
    const { isArray } = await this.getFieldType(field);

    return `${this.translateField(field, context)} ${
      isArray
        ? isNegatedField
          ? 'does not contain'
          : 'contains'
        : isNegatedField
          ? 'is not'
          : 'is'
    } ${term}`;
  }

  async isNotNull(
    field: string,
    isNegatedField: boolean,
    context: SerializerContext,
  ) {
    const { isArray, type, fieldPostfix, column } =
      await this.getFieldType(field);
    const isArrayOfMaps =
      isArray && (type === JSDataType.Map || type === JSDataType.JSON);

    if (column && isArrayOfMaps && fieldPostfix) {
      return `${this.translateField(column, context)} ${
        isNegatedField
          ? `does not contain an element with non-null ${fieldPostfix}`
          : `contains an element with non-null ${fieldPostfix}`
      }`;
    }

    return `${this.translateField(field, context)} ${
      isNegatedField ? 'is null' : 'is not null'
    }`;
  }

  async gte(field: string, term: string, context: SerializerContext) {
    return `${this.translateField(field, context)} is greater than or equal to ${term}`;
  }

  async lte(field: string, term: string, context: SerializerContext) {
    return `${this.translateField(field, context)} is less than or equal to ${term}`;
  }

  async lt(field: string, term: string, context: SerializerContext) {
    return `${this.translateField(field, context)} is less than ${term}`;
  }

  async gt(field: string, term: string, context: SerializerContext) {
    return `${this.translateField(field, context)} is greater than ${term}`;
  }

  async fieldSearch(
    field: string,
    term: string,
    isNegatedField: boolean,
    prefixWildcard: boolean,
    suffixWildcard: boolean,
    context: SerializerContext,
  ) {
    const formattedTerm = term.trim().match(/\s/) ? `"${term}"` : term;

    if (field === IMPLICIT_FIELD) {
      const isUsingTokenSearch = !context.implicitColumnExpression; // Source's implicit column has not been overridden
      return `${this.translateField(field, context)} ${
        prefixWildcard && suffixWildcard
          ? isNegatedField
            ? 'does not contain'
            : 'contains'
          : prefixWildcard
            ? isNegatedField
              ? 'does not end with'
              : 'ends with'
            : suffixWildcard
              ? isNegatedField
                ? 'does not start with'
                : 'starts with'
              : isUsingTokenSearch
                ? isNegatedField
                  ? 'does not have whole word'
                  : 'has whole word'
                : isNegatedField
                  ? 'does not contain'
                  : 'contains'
      } ${formattedTerm}`;
    } else {
      const { isArray, type, column, fieldPostfix } =
        await this.getFieldType(field);
      const isExactMatchType =
        type === JSDataType.Bool || type === JSDataType.Number;
      const isArrayOfMaps =
        isArray && (type === JSDataType.Map || type === JSDataType.JSON);
      const fieldToTranslate = isArrayOfMaps && column ? column : field;
      return `${this.translateField(fieldToTranslate, context)} ${
        isArrayOfMaps
          ? isNegatedField
            ? `does not contain an element with key ${fieldPostfix} and value`
            : `contains an element with key ${fieldPostfix} and value`
          : isArray && !isExactMatchType
            ? isNegatedField
              ? 'does not contain an element containing'
              : 'contains an element containing'
            : isNegatedField
              ? 'does not contain'
              : 'contains'
      } ${formattedTerm}`;
    }
  }

  async range(
    field: string,
    start: string,
    end: string,
    isNegatedField: boolean,
    context: SerializerContext,
    inclusive: lucene.NodeRangedTerm['inclusive'] = 'both',
  ) {
    const startBound =
      inclusive === 'both' || inclusive === 'left'
        ? start
        : `${start} (exclusive)`;
    const endBound =
      inclusive === 'both' || inclusive === 'right'
        ? end
        : `${end} (exclusive)`;
    return `${field} ${
      isNegatedField ? 'is not' : 'is'
    } between ${startBound} and ${endBound}`;
  }
}

async function nodeTerm(
  node: lucene.Node,
  serializer: Serializer,
  context: SerializerContext,
): Promise<string> {
  const field = node.field[0] === '-' ? node.field.slice(1) : node.field;
  let isNegatedField = node.field[0] === '-';
  const isImplicitField = node.field === IMPLICIT_FIELD;

  // NodeTerm
  if (isNodeTerm(node)) {
    const nodeTerm = node;
    let term = decodeSpecialTokens(nodeTerm.term);
    // We should only negate the search for negated bare terms (ex. '-5')
    // This means the field is implicit and the prefix is -
    if (isImplicitField && nodeTerm.prefix === '-') {
      isNegatedField = true;
    }
    // Otherwise, if we have a negated term for a field (ex. 'level:-5')
    // we should not negate the search, and search for -5
    if (!isImplicitField && nodeTerm.prefix === '-') {
      term = nodeTerm.prefix + decodeSpecialTokens(nodeTerm.term);
    }

    // TODO: Decide if this is good behavior
    // If the term is quoted, we should search for the exact term in a property (ex. foo:"bar")
    // Implicit field searches should still use substring matching (ex. "foo bar")
    if (nodeTerm.quoted && !isImplicitField) {
      return serializer.eq(field, term, isNegatedField, context);
    }

    if (!nodeTerm.quoted && term === '*') {
      return serializer.isNotNull(field, isNegatedField, context);
    }

    if (!nodeTerm.quoted && term.substring(0, 2) === '>=') {
      if (isNegatedField) {
        return serializer.lt(field, term.slice(2), context);
      }
      return serializer.gte(field, term.slice(2), context);
    }
    if (!nodeTerm.quoted && term.substring(0, 2) === '<=') {
      if (isNegatedField) {
        return serializer.gt(field, term.slice(2), context);
      }
      return serializer.lte(field, term.slice(2), context);
    }
    if (!nodeTerm.quoted && term[0] === '>') {
      if (isNegatedField) {
        return serializer.lte(field, term.slice(1), context);
      }
      return serializer.gt(field, term.slice(1), context);
    }
    if (!nodeTerm.quoted && term[0] === '<') {
      if (isNegatedField) {
        return serializer.gte(field, term.slice(1), context);
      }
      return serializer.lt(field, term.slice(1), context);
    }

    let prefixWildcard = false;
    let suffixWildcard = false;
    if (!nodeTerm.quoted && term[0] === '*') {
      prefixWildcard = true;
      term = term.slice(1);
    }
    if (!nodeTerm.quoted && term[term.length - 1] === '*') {
      suffixWildcard = true;
      term = term.slice(0, -1);
    }

    return serializer.fieldSearch(
      field,
      term,
      isNegatedField,
      prefixWildcard,
      suffixWildcard,
      context,
    );

    // TODO: Handle regex, similarity, boost, prefix
  }
  // NodeRangedTerm
  if (isNodeRangedTerm(node)) {
    const rangedTerm = node;
    return serializer.range(
      field,
      rangedTerm.term_min,
      rangedTerm.term_max,
      isNegatedField,
      context,
      rangedTerm.inclusive,
    );
  }

  throw new Error(`Unexpected Node type. ${node}`);
}

function createSerializerContext(
  currentContext: SerializerContext,
  ast: lucene.BinaryAST | lucene.LeftOnlyAST,
) {
  // For syntax like `foo:(bar baz)` or `foo:("bar baz")`, the implicit field for the inner expression must be `foo`
  if (ast.field && ast.parenthesized && ast.field !== IMPLICIT_FIELD) {
    const fieldWithoutNegation = ast.field?.startsWith('-')
      ? ast.field.slice(1)
      : ast.field;

    return {
      ...currentContext,
      implicitColumnExpression: fieldWithoutNegation,
      ...(isNegatedAndParenthesized(ast)
        ? { isNegatedAndParenthesized: true }
        : {}),
    };
  } else {
    return currentContext;
  }
}

/** Returns true if the AST is of the form `-[field]:([terms...])` */
function isNegatedAndParenthesized(ast: lucene.BinaryAST | lucene.LeftOnlyAST) {
  return ast.parenthesized && ast.field?.startsWith('-');
}

async function serialize(
  ast: lucene.AST | lucene.Node,
  serializer: Serializer,
  context: SerializerContext,
): Promise<string> {
  // Node Scenarios:
  // 1. NodeTerm: Single term ex. "foo:bar"
  // 2. NodeRangedTerm: Two terms ex. "foo:[bar TO qux]"
  if (isNodeTerm(ast)) {
    return await nodeTerm(ast, serializer, context);
  }
  if (isNodeRangedTerm(ast)) {
    return await nodeTerm(ast, serializer, context);
  }

  // AST Scenarios:
  // 1. BinaryAST: Two terms ex. "foo:bar AND baz:qux"
  // 2. LeftOnlyAST: Single term ex. "foo:bar"
  if (isBinaryAST(ast)) {
    const binaryAST = ast;
    const operator = serializer.operator(binaryAST.operator, context);
    const parenthesized = binaryAST.parenthesized;

    const newContext = createSerializerContext(context, binaryAST);
    const serialized = `${isNegatedAndParenthesized(binaryAST) ? 'NOT ' : ''}${parenthesized ? '(' : ''}${
      hasStart(binaryAST) ? `${binaryAST.start} ` : ''
    }${await serialize(
      binaryAST.left,
      serializer,
      newContext,
    )} ${operator} ${await serialize(binaryAST.right, serializer, newContext)}${
      parenthesized ? ')' : ''
    }`;
    return serialized;
  }

  if (isLeftOnlyAST(ast)) {
    const leftOnlyAST = ast;
    const parenthesized = leftOnlyAST.parenthesized;

    const newContext = createSerializerContext(context, leftOnlyAST);

    // start is used when ex. "NOT foo:bar"
    const serialized = `${isNegatedAndParenthesized(leftOnlyAST) ? 'NOT ' : ''}${parenthesized ? '(' : ''}${
      leftOnlyAST.start != undefined ? `${leftOnlyAST.start} ` : ''
    }${await serialize(leftOnlyAST.left, serializer, newContext)}${
      parenthesized ? ')' : ''
    }`;

    return serialized;
  }

  // Blank AST, means no text was parsed
  return '';
}

// TODO: can just inline this within getSearchQuery
export async function genWhereSQL(
  ast: lucene.AST,
  serializer: Serializer,
): Promise<string> {
  return await serialize(ast, serializer, {});
}

export class SearchQueryBuilder {
  private readonly searchQ: string;

  private readonly conditions: string[];

  private serializer: Serializer;

  constructor(searchQ: string, serializer: Serializer) {
    this.conditions = [];
    this.searchQ = searchQ;
    // init default serializer
    this.serializer = serializer;
  }

  setSerializer(serializer: Serializer) {
    this.serializer = serializer;
    return this;
  }

  getSerializer() {
    return this.serializer;
  }

  private async genSearchQuery() {
    if (!this.searchQ) {
      return '';
    }

    const parsedQ = parse(this.searchQ);

    return await genWhereSQL(parsedQ, this.serializer);
  }

  and(condition: string) {
    if (condition && condition.trim()) {
      this.conditions.push(`(${condition})`);
    }
    return this;
  }

  async build() {
    const searchQuery = await this.genSearchQuery();
    if (this.searchQ) {
      this.and(searchQuery);
    }
    return this.conditions.join(' AND ');
  }
}

export async function genEnglishExplanation({
  query,
  metadata,
  tableConnection,
}: {
  query: string;
  tableConnection: TableConnection;
  metadata: Metadata;
}): Promise<string> {
  try {
    const { tableName, databaseName, connectionId } = tableConnection;
    const parsedQ = parse(query);

    if (parsedQ && tableName && databaseName && connectionId) {
      const serializer = new EnglishSerializer({
        metadata,
        tableName,
        databaseName,
        connectionId,
      });
      return await serialize(parsedQ, serializer, {});
    }
  } catch (e) {
    console.warn('Parse failure', query, e);
  }

  return `Message containing ${query}`;
}
