import { type SqlPP, sqlpp } from './sqlpp';

export const COMPLETED_REQUESTS_NOTE =
  "Completed requests include only what this server's threshold and size settings keep. If the server shows only the current user's requests, this list is limited to this connection's user.";

const NS_PER_MS = 1_000_000;

export type ActiveRequestRow = {
  requestId: string;
  statement: string;
  state: string;
  elapsedTime: string;
  users: string;
  node: string;
};

export type CompletedBucket = { t: number; count: number; errors: number };

export type TopStatementRow = {
  statement: string;
  count: number;
  avgMs: number;
  maxMs: number;
};

export type RecentRequestRow = {
  statement: string;
  elapsedTime: string;
  resultCount: number | null;
  errorCount: number | null;
  users: string;
  node: string;
};

export type IndexRow = {
  name: string;
  keyspace: string;
  state: string;
  using: string;
  primary: boolean;
};

/** Width that keeps a range to at most 300 buckets. */
export function bucketWidthMs(fromMs: number, toMs: number): number {
  const span = Math.max(1, toMs - fromMs);
  const raw = Math.ceil(span / 300);
  const choices = [
    1_000, 5_000, 15_000, 60_000, 300_000, 3_600_000, 86_400_000,
  ];
  const found = choices.find(choice => choice >= raw);
  return found == null ? raw : found;
}

export function activeRequestsQuery(): SqlPP {
  return sqlpp`SELECT requestId, statement, state, elapsedTime, users, node FROM system:active_requests LIMIT 200`;
}

export function completedOverTimeQuery(
  fromMs: number,
  toMs: number,
  widthMs: number,
): SqlPP {
  // The group key repeats $p0. A second parameter is not equal to the first.
  return sqlpp`SELECT (STR_TO_MILLIS(requestTime) - (STR_TO_MILLIS(requestTime) % ${{ Param: widthMs }})) AS bucketMs, COUNT(*) AS count, SUM(IFMISSINGORNULL(errorCount, 0)) AS errors FROM system:completed_requests WHERE STR_TO_MILLIS(requestTime) >= ${{ Param: fromMs }} AND STR_TO_MILLIS(requestTime) < ${{ Param: toMs }} GROUP BY (STR_TO_MILLIS(requestTime) - (STR_TO_MILLIS(requestTime) % $p0)) ORDER BY bucketMs`;
}

export function topStatementsQuery(fromMs: number, toMs: number): SqlPP {
  return sqlpp`SELECT statement, COUNT(*) AS count, AVG(STR_TO_DURATION(elapsedTime) / ${{ Param: NS_PER_MS }}) AS avgMs, MAX(STR_TO_DURATION(elapsedTime) / ${{ Param: NS_PER_MS }}) AS maxMs FROM system:completed_requests WHERE STR_TO_MILLIS(requestTime) >= ${{ Param: fromMs }} AND STR_TO_MILLIS(requestTime) < ${{ Param: toMs }} GROUP BY statement ORDER BY count DESC LIMIT 20`;
}

export function recentRequestsQuery(fromMs: number, toMs: number): SqlPP {
  return sqlpp`SELECT statement, elapsedTime, resultCount, errorCount, users, node FROM system:completed_requests WHERE STR_TO_MILLIS(requestTime) >= ${{ Param: fromMs }} AND STR_TO_MILLIS(requestTime) < ${{ Param: toMs }} ORDER BY STR_TO_DURATION(elapsedTime) DESC LIMIT 100`;
}

export function indexesQuery(): SqlPP {
  return sqlpp`SELECT name, keyspace_id, state, ${{ Raw: '`using`' }} AS indexUsing, is_primary FROM system:indexes`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function flag(value: unknown): boolean {
  return value === true || value === 'true';
}

export function mapActiveRequest(value: unknown): ActiveRequestRow {
  const row = isRecord(value) ? value : {};
  return {
    requestId: text(row.requestId),
    statement: text(row.statement),
    state: text(row.state),
    elapsedTime: text(row.elapsedTime),
    users: text(row.users),
    node: text(row.node),
  };
}

export function mapCompletedBucket(value: unknown): CompletedBucket | null {
  const row = isRecord(value) ? value : {};
  const t = num(row.bucketMs);
  if (t == null) return null;
  return { t, count: num(row.count) ?? 0, errors: num(row.errors) ?? 0 };
}

export function mapTopStatement(value: unknown): TopStatementRow {
  const row = isRecord(value) ? value : {};
  return {
    statement: text(row.statement),
    count: num(row.count) ?? 0,
    avgMs: num(row.avgMs) ?? 0,
    maxMs: num(row.maxMs) ?? 0,
  };
}

export function mapRecentRequest(value: unknown): RecentRequestRow {
  const row = isRecord(value) ? value : {};
  return {
    statement: text(row.statement),
    elapsedTime: text(row.elapsedTime),
    resultCount: num(row.resultCount),
    errorCount: num(row.errorCount),
    users: text(row.users),
    node: text(row.node),
  };
}

export function mapIndex(value: unknown): IndexRow {
  const row = isRecord(value) ? value : {};
  return {
    name: text(row.name),
    keyspace: text(row.keyspace_id),
    state: text(row.state),
    using: text(row.indexUsing ?? row.using),
    primary: flag(row.is_primary),
  };
}
