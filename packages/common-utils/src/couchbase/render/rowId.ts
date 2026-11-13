import { quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';

export const ROW_ID_ALIAS = '__cbt_id';

export function rowIdSelect(): string {
  return `META(d).id AS ${quoteIdent(ROW_ID_ALIAS)}`;
}

export function rowIdWhere(id: string): SqlPP {
  return sqlpp`META(d).id = ${{ Param: id }}`;
}

export function rowIdUseKeys(id: string): SqlPP {
  return sqlpp`USE KEYS ${{ Param: id }}`;
}

/** URL-safe literal WHERE for Couchbase row identity (no SqlString). */
export function rowIdWhereLiteral(id: string): string {
  if (/[^\x20-\x7E]/.test(id)) {
    throw new Error('Row id contains non-printable characters');
  }
  return `META(d).id = ${JSON.stringify(id)}`;
}

export function parseRowIdWhere(where: string): string | undefined {
  const trimmed = where.trim();
  const prefix = 'META(d).id = ';
  if (!trimmed.startsWith(prefix)) return undefined;
  const rhs = trimmed.slice(prefix.length).trim();
  if (!rhs.startsWith('"')) return undefined;
  try {
    const parsed: unknown = JSON.parse(rhs);
    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}
