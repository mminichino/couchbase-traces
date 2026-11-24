/**
 * Field references in SQL++ text, for the MCP unknown-column check (Q53).
 *
 * SQL++ reads a field no document has as MISSING, so a misspelled column
 * returns empty values where upstream's ClickHouse failed with
 * UNKNOWN_IDENTIFIER. The MCP tools reject such a query before sending it,
 * against the declared OTel schema. This module only finds the names: the
 * root of every field path the text reads. It fails open (returns null) on
 * any construct it cannot scope with certainty, so a valid query is never
 * rejected because of the parser.
 *
 * Not scanned: function names, path segments after the root
 * (`SpanAttributes.\`http.route\``, `ResourceAttributes['service.name']`),
 * named parameters and macros (`$x`, `$__fromTime`), string literals,
 * aliases (`AS x`, or a bare name after an operand), and range variables
 * (`FOR v IN`, `ANY v IN … SATISFIES`).
 */
import { SQLPP_RESERVED_WORDS } from './reservedWords';

type Token =
  | { kind: 'ident'; text: string; quoted: boolean }
  | { kind: 'param' | 'string' | 'number'; text: string }
  | { kind: 'punct'; text: string };

/** A FROM keyspace written as bucket.scope.collection. */
export type KeyspacePath = {
  bucket: string;
  scope: string;
  collection: string;
};

export type FieldReferences = {
  /** Root names of the field paths read, in first-seen order. */
  roots: string[];
  /** The single FROM keyspace (statements only). */
  keyspace?: KeyspacePath;
};

/** Constructs whose names this scanner cannot scope: fail open. */
const UNSCOPED = new Set([
  'JOIN',
  'NEST',
  'UNNEST',
  'LET',
  'LETTING',
  'WITH',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'MINUS',
  'USE',
  'INFER',
  'EXPLAIN',
  'ADVISE',
  'PREPARE',
  'EXECUTE',
]);

/** Keywords followed by a range variable or window name, not a field. */
const BINDERS = new Set([
  'FOR',
  'ANY',
  'EVERY',
  'SOME',
  'AS',
  'OVER',
  'WINDOW',
]);

/** Keywords that end an operand (`CASE … END x` aliases x). */
const OPERAND_KEYWORDS = new Set(['END', 'NULL', 'TRUE', 'FALSE', 'MISSING']);

/** The upper-cased reserved word `t` is, if it is an unescaped one. */
function keywordOf(t: Token | undefined): string | undefined {
  if (!t || t.kind !== 'ident' || t.quoted) return undefined;
  const upper = t.text.toUpperCase();
  return SQLPP_RESERVED_WORDS.has(upper) ? upper : undefined;
}

function isKeyword(t: Token | undefined, word?: string): boolean {
  const kw = keywordOf(t);
  return word ? kw === word : kw != null;
}

/** Token at `i`, or undefined outside the list (no wrap-around from -1). */
function tokenAt(tokens: Token[], i: number): Token | undefined {
  return i >= 0 ? tokens.at(i) : undefined;
}

function isPunct(t: Token | undefined, text: string): boolean {
  return t?.kind === 'punct' && t.text === text;
}

/** Tokenizes SQL++; null when the text has an unterminated literal. */
export function tokenizeSqlpp(text: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (/\s/.test(c)) {
      i++;
    } else if (c === '-' && text.charAt(i + 1) === '-') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl + 1;
    } else if (c === '/' && text.charAt(i + 1) === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) return null;
      i = end + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= text.length) return null;
        const ch = text.charAt(j);
        if (ch === '\\' && c !== '`') {
          value += text.charAt(j + 1);
          j += 2;
        } else if (ch === c && text.charAt(j + 1) === c) {
          value += c;
          j += 2;
        } else if (ch === c) {
          break;
        } else {
          value += ch;
          j++;
        }
      }
      out.push(
        c === '`'
          ? { kind: 'ident', text: value, quoted: true }
          : { kind: 'string', text: value },
      );
      i = j + 1;
    } else if (
      /[0-9]/.test(c) ||
      (c === '.' && /[0-9]/.test(text.charAt(i + 1)))
    ) {
      // Digits, dots, letters (hex, exponent) and an exponent sign: the exact
      // shape does not matter, only that the literal is one token.
      let len = 1;
      while (/[0-9a-z.]/i.test(text.charAt(i + len))) {
        const sign = /[+-]/.test(text.charAt(i + len + 1));
        len += /e/i.test(text.charAt(i + len)) && sign ? 2 : 1;
      }
      out.push({ kind: 'number', text: text.slice(i, i + len) });
      i += len;
    } else if (c === '$' || /[A-Za-z_]/.test(c)) {
      const m = /^\$?[A-Za-z0-9_]*/.exec(text.slice(i));
      const word = m?.[0] || c;
      out.push(
        c === '$'
          ? { kind: 'param', text: word }
          : { kind: 'ident', text: word, quoted: false },
      );
      i += word.length;
    } else {
      out.push({ kind: 'punct', text: c });
      i++;
    }
  }
  return out;
}

/** True when `t` ends an operand, so a bare name after it is an alias. */
function endsOperand(t: Token | undefined): boolean {
  if (!t) return false;
  if (t.kind === 'string' || t.kind === 'number' || t.kind === 'param') {
    return true;
  }
  if (t.kind === 'punct') return t.text === ')' || t.text === ']';
  const kw = keywordOf(t);
  return kw ? OPERAND_KEYWORDS.has(kw) : true;
}

/** Reads `a.b.c` at `start`; returns its names and the index after it. */
function readPath(tokens: Token[], start: number) {
  const names: string[] = [];
  let i = start;
  for (;;) {
    const t = tokens.at(i);
    if (t?.kind !== 'ident' || isKeyword(t)) break;
    names.push(t.text);
    i++;
    if (!isPunct(tokens.at(i), '.')) break;
    i++;
  }
  return { names, next: i };
}

/**
 * Field roots of a statement (`statement: true`, one FROM keyspace) or of a
 * source-relative expression, where `rowAlias.X` reads as field X. Null when
 * the text cannot be scoped.
 */
export function fieldReferences(
  text: string,
  opts: { statement: boolean; rowAlias?: string },
): FieldReferences | null {
  const tokens = tokenizeSqlpp(text);
  if (!tokens) return null;
  if (tokens.some(t => isPunct(t, '{') || isPunct(t, ':'))) return null;
  // Raw words: JOIN is not a reserved word in the 8.0 list.
  const word = (t: Token) =>
    t.kind === 'ident' && !t.quoted ? t.text.toUpperCase() : '';
  if (tokens.some(t => UNSCOPED.has(word(t)))) return null;
  const selects = tokens.filter(t => isKeyword(t, 'SELECT')).length;
  if (opts.statement ? selects !== 1 : selects !== 0) return null;

  const skip = new Set<number>();
  const bound = new Set<string>();
  let keyspace: KeyspacePath | undefined;
  // An expression may qualify fields with the renderer's keyspace alias.
  let keyspaceAlias: string | undefined = opts.rowAlias;

  if (opts.statement) {
    const froms = tokens.flatMap((t, i) => (isKeyword(t, 'FROM') ? [i] : []));
    if (froms.length !== 1) return null;
    const from = froms[0] ?? 0;
    const path = readPath(tokens, from + 1);
    if (path.names.length !== 3) return null;
    for (let k = from + 1; k < path.next; k++) skip.add(k);
    let next = path.next;
    if (isKeyword(tokens.at(next), 'AS')) next++;
    const [bucket, scope, collection] = path.names;
    keyspaceAlias = collection;
    const alias = tokens.at(next);
    if (alias?.kind === 'ident' && !isKeyword(alias)) {
      keyspaceAlias = alias.text;
      skip.add(next);
      next++;
    }
    if (isPunct(tokens.at(next), ',')) return null;
    keyspace = { bucket, scope, collection };
  }

  tokens.forEach((t, i) => {
    if (t.kind !== 'ident' || isKeyword(t) || skip.has(i)) return;
    const prev = tokenAt(tokens, i - 1);
    if (BINDERS.has(keywordOf(prev) ?? '')) {
      bound.add(t.text);
    } else if (!isPunct(prev, '.') && endsOperand(prev)) {
      bound.add(t.text);
    }
  });

  const roots: string[] = [];
  tokens.forEach((t, i) => {
    if (t.kind !== 'ident' || isKeyword(t) || skip.has(i)) return;
    if (isPunct(tokenAt(tokens, i - 1), '.')) return;
    if (!t.quoted && isPunct(tokens.at(i + 1), '(')) return;
    let name = t.text;
    if (name === keyspaceAlias) {
      // `d.Body` (FROM ks d) or `otel_logs.Body`: the field is the next segment.
      const after = tokens.at(i + 2);
      if (!isPunct(tokens.at(i + 1), '.') || after?.kind !== 'ident') return;
      name = after.text;
    } else if (bound.has(name)) {
      return;
    }
    if (!roots.includes(name)) roots.push(name);
  });
  return { roots, keyspace };
}
