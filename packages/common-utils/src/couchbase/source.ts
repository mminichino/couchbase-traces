import type { ConnectionKind } from '@/types';

import { validateSourceSettings } from './settings';

/** Bucket, scope, and collection names; `_default` matches. */
export const COUCHBASE_NAME_RE = /^[A-Za-z0-9%_-]{1,251}$/;

export const COUCHBASE_ONLY_SOURCE_FIELDS = [
  'scopeName',
  'timestampFormat',
  'searchIndexName',
] as const;

type SourceLike = {
  kind?: string;
  from?: { databaseName?: string; scopeName?: string; tableName?: string };
  timestampFormat?: string;
  searchIndexName?: string;
  querySettings?: { setting: string; value: string }[];
  metricTables?: Record<string, unknown>;
};

const isSet = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * Checks the source fields that depend on the connection kind. Returns an
 * error message, or null when the source is valid for that kind.
 */
export function validateSourceForConnectionKind(
  source: SourceLike,
  kind: ConnectionKind,
): string | null {
  if (kind === 'clickhouse') {
    const values: Record<
      (typeof COUCHBASE_ONLY_SOURCE_FIELDS)[number],
      unknown
    > = {
      scopeName: source.from?.scopeName,
      timestampFormat: source.timestampFormat,
      searchIndexName: source.searchIndexName,
    };
    const present = Object.entries(values)
      .filter(([, v]) => isSet(v))
      .map(([f]) => f);
    return present.length > 0
      ? `${present.join(', ')} ${present.length > 1 ? 'are' : 'is'} only valid for Couchbase connections`
      : null;
  }

  const from = source.from ?? {};
  if (!isSet(from.scopeName)) return 'Scope is required';
  if (!isSet(source.timestampFormat)) return 'Timestamp format is required';

  const isMetric = source.kind === 'metric';
  const names: [string, unknown][] = [
    ['Bucket', from.databaseName],
    ['Scope', from.scopeName],
  ];
  if (!isMetric || isSet(from.tableName)) {
    names.push(['Collection', from.tableName]);
  }
  if (isMetric) {
    for (const [type, collection] of Object.entries(
      source.metricTables ?? {},
    )) {
      if (isSet(collection)) names.push([`Collection for ${type}`, collection]);
    }
  }
  for (const [label, value] of names) {
    if (typeof value !== 'string' || !COUCHBASE_NAME_RE.test(value)) {
      return `${label} must be 1 to 251 letters, digits, %, _ or -`;
    }
  }

  return validateSourceSettings(source.querySettings);
}
