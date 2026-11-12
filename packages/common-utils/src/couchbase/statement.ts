import { CouchbaseQueryError } from './errors';

export const ALLOWED_KEYWORDS = [
  'SELECT',
  'WITH',
  'INFER',
  'EXPLAIN',
  'ADVISE',
] as const;

/** Index just past a comment starting at `i`, or `i` when there is none. */
function skipComment(s: string, i: number): number {
  if (s.startsWith('--', i)) {
    const nl = s.indexOf('\n', i + 2);
    return nl < 0 ? s.length : nl + 1;
  }
  if (s.startsWith('/*', i)) {
    const end = s.indexOf('*/', i + 2);
    return end < 0 ? s.length : end + 2;
  }
  return i;
}

/** Upper-case leading keyword, after whitespace, comments, and opening parentheses. */
export function leadingKeyword(statement: string): string | null {
  const s = statement ?? '';
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (/\s/.test(c) || c === '(') {
      i++;
      continue;
    }
    const next = skipComment(s, i);
    if (next !== i) {
      i = next;
      continue;
    }
    break;
  }
  const m = /^[A-Za-z_]+/.exec(s.slice(i));
  return m ? m[0].toUpperCase() : null;
}

/**
 * Position of the first `;` outside quotes and comments that is followed by
 * anything other than whitespace or comments, or -1.
 */
function extraStatementIndex(s: string): number {
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    const afterComment = skipComment(s, i);
    if (afterComment !== i) {
      i = afterComment;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < s.length) {
        if (s.charAt(i) === '\\') {
          i += 2;
          continue;
        }
        if (s.charAt(i) === c) {
          if (s.charAt(i + 1) === c) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      continue;
    }
    if (c === ';') {
      let j = i + 1;
      while (j < s.length) {
        if (/\s/.test(s.charAt(j))) {
          j++;
          continue;
        }
        const k = skipComment(s, j);
        if (k !== j) {
          j = k;
          continue;
        }
        return i;
      }
      return -1;
    }
    i++;
  }
  return -1;
}

export function assertAllowedStatement(statement: string): void {
  if (typeof statement !== 'string' || statement.trim() === '') {
    throw new CouchbaseQueryError(
      'STATEMENT_NOT_ALLOWED',
      'Statement is empty',
      statement ?? '',
    );
  }
  if (extraStatementIndex(statement) >= 0) {
    throw new CouchbaseQueryError(
      'MULTIPLE_STATEMENTS',
      'Only one statement can be executed per request',
      statement,
    );
  }
  const kw = leadingKeyword(statement);
  if (kw == null || !ALLOWED_KEYWORDS.some(k => k === kw)) {
    throw new CouchbaseQueryError(
      'STATEMENT_NOT_ALLOWED',
      `Only read-only statements are allowed (${ALLOWED_KEYWORDS.join(', ')}); got ${kw ?? 'no keyword'}`,
      statement,
    );
  }
}

/** INFER samples documents through the data service and is rejected by readOnly. */
export function isReadOnlyExempt(statement: string): boolean {
  return leadingKeyword(statement) === 'INFER';
}
