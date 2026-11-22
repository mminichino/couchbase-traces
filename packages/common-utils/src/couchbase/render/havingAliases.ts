export type HavingPiece = { text: string } | { alias: string };

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/** Index just past a quoted run starting at `start`; doubled quotes escape. */
function skipQuoted(text: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '\\' && quote !== '`') {
      i += 2;
      continue;
    }
    if (ch === quote) {
      if (text.charAt(i + 1) === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return text.length;
}

function prevNonSpace(text: string, i: number): string {
  let j = i - 1;
  while (j >= 0 && /\s/.test(text.charAt(j))) j -= 1;
  return j >= 0 ? text.charAt(j) : '';
}

function nextNonSpace(text: string, i: number): string {
  let j = i;
  while (j < text.length && /\s/.test(text.charAt(j))) j += 1;
  return j < text.length ? text.charAt(j) : '';
}

/**
 * Splits a SQL `having` condition around references to select aliases.
 * An alias reference is a bare or backtick-quoted identifier equal to an
 * alias, not part of a path (`d.n`), not a function call (`n(1)`), and not
 * inside a string literal or a `$param`. With `doubleQuoted`, a `"name"`
 * equal to an alias is a reference too: ClickHouse expressions quote
 * identifiers that way, and only an exact alias match is taken.
 */
export function splitOnAliasRefs(
  text: string,
  aliases: ReadonlySet<string>,
  opts?: { doubleQuoted?: boolean },
): HavingPiece[] {
  const pieces: HavingPiece[] = [];
  let textStart = 0;
  let i = 0;
  const emitAlias = (start: number, end: number, alias: string) => {
    if (start > textStart) pieces.push({ text: text.slice(textStart, start) });
    pieces.push({ alias });
    textStart = end;
  };
  const isStandalone = (start: number, end: number) =>
    prevNonSpace(text, start) !== '.' &&
    nextNonSpace(text, end) !== '.' &&
    nextNonSpace(text, end) !== '(';

  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '"' && opts?.doubleQuoted) {
      const end = skipQuoted(text, i, '"');
      const name = text.slice(i + 1, end - 1).replace(/""/g, '"');
      if (aliases.has(name) && isStandalone(i, end)) emitAlias(i, end, name);
      i = end;
    } else if (ch === "'" || ch === '"') {
      i = skipQuoted(text, i, ch);
    } else if (ch === '`') {
      const end = skipQuoted(text, i, '`');
      const name = text.slice(i + 1, end - 1).replace(/``/g, '`');
      if (aliases.has(name) && isStandalone(i, end)) emitAlias(i, end, name);
      i = end;
    } else if (ch === '$' || /[0-9]/.test(ch)) {
      // `$name` parameters and numeric literals (`1e5`) are never aliases.
      i += 1;
      while (i < text.length && IDENT_PART.test(text.charAt(i))) i += 1;
    } else if (IDENT_START.test(ch)) {
      const start = i;
      while (i < text.length && IDENT_PART.test(text.charAt(i))) i += 1;
      const name = text.slice(start, i);
      if (aliases.has(name) && isStandalone(start, i)) {
        emitAlias(start, i, name);
      }
    } else {
      i += 1;
    }
  }
  if (textStart < text.length) pieces.push({ text: text.slice(textStart) });
  return pieces;
}
