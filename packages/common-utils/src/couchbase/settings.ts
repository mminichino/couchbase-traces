import type { QueryAttribution } from '@/clickhouse/attribution';
import type { TeamClickHouseSettings } from '@/types';

import { CouchbaseQueryError } from './errors';
import { quoteIdent } from './sqlpp';
import { isReadOnlyExempt } from './statement';
import type {
  CouchbaseLogger,
  CouchbaseQueryInputs,
  ScanConsistency,
} from './types';

export type ResolvedQueryOptions = {
  timeoutMs: number;
  scanConsistency: ScanConsistency;
  maxParallelism?: number;
  scanCap?: number;
  pipelineBatch?: number;
  pipelineCap?: number;
  queryContext?: string;
  clientContextId: string;
  readOnly: boolean;
};

export const SOURCE_SETTING_NAMES = [
  'scan_consistency',
  'timeout_ms',
  'max_parallelism',
  'scan_cap',
  'pipeline_batch',
  'pipeline_cap',
] as const;

export type SourceSettingName = (typeof SOURCE_SETTING_NAMES)[number];

const SCAN_CONSISTENCIES: readonly ScanConsistency[] = [
  'not_bounded',
  'request_plus',
];

function isScanConsistency(v: unknown): v is ScanConsistency {
  return SCAN_CONSISTENCIES.some(c => c === v);
}

const POSITIVE_INT_RE = /^[1-9]\d*$/;

/** Returns an error message for the first invalid source setting, or null. */
export function validateSourceSettings(
  settings: { setting: string; value: string }[] | undefined,
): string | null {
  for (const { setting, value } of settings ?? []) {
    if (!SOURCE_SETTING_NAMES.some(n => n === setting)) {
      return `Unsupported Couchbase query setting "${setting}"; allowed: ${SOURCE_SETTING_NAMES.join(', ')}`;
    }
    if (setting === 'scan_consistency') {
      if (!isScanConsistency(value)) {
        return `scan_consistency must be one of ${SCAN_CONSISTENCIES.join(', ')}`;
      }
    } else if (!POSITIVE_INT_RE.test(String(value).trim())) {
      return `${setting} must be a positive integer`;
    }
  }
  return null;
}

function sourceSetting(
  settings: { setting: string; value: string }[] | undefined,
  name: SourceSettingName,
): string | undefined {
  return settings?.find(s => s.setting === name)?.value;
}

function positive(n: unknown): number | undefined {
  const v = typeof n === 'string' ? Number(n) : n;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

function randomHex(chars: number): string {
  const bytes = new Uint8Array(Math.ceil(chars / 2));
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, chars);
}

const MAX_CLIENT_CONTEXT_ID = 64;

export function buildClientContextId(
  queryId: string | undefined,
  attribution: QueryAttribution | undefined,
): string {
  const id =
    queryId != null && queryId !== ''
      ? queryId
      : `cbt:${attribution?.source || 'adhoc'}:${randomHex(12)}`;
  return id.slice(0, MAX_CLIENT_CONTEXT_ID);
}

const loggedIgnoredSettings = new Set<string>();

export function resolveQueryOptions(args: {
  inputs: CouchbaseQueryInputs<any>;
  team: TeamClickHouseSettings | null;
  config: { defaultTimeoutMs: number; maxTimeoutMs: number };
  logger?: CouchbaseLogger;
}): ResolvedQueryOptions {
  const { inputs, team, config, logger } = args;
  const settings = inputs.sourceSettings;

  const invalid = validateSourceSettings(settings);
  if (invalid != null) {
    throw new CouchbaseQueryError('PARSING_FAILED', invalid, inputs.query);
  }

  const chSettings = inputs.clickhouse_settings ?? {};
  for (const key of Object.keys(chSettings)) {
    if (key !== 'max_execution_time' && !loggedIgnoredSettings.has(key)) {
      loggedIgnoredSettings.add(key);
      logger?.debug(
        { setting: key },
        'Ignoring ClickHouse setting on a Couchbase query',
      );
    }
  }

  const maxExec = positive(chSettings.max_execution_time);
  const teamTimeout = positive(team?.queryTimeout);
  const timeoutCandidates = [
    positive(inputs.timeoutMs),
    maxExec != null ? maxExec * 1000 : undefined,
    positive(sourceSetting(settings, 'timeout_ms')),
    teamTimeout != null ? teamTimeout * 1000 : undefined,
    positive(config.defaultTimeoutMs),
  ];
  const timeout = timeoutCandidates.find(t => t != null) ?? 60000;

  const settingConsistency = sourceSetting(settings, 'scan_consistency');
  const teamConsistency = isScanConsistency(team?.queryScanConsistency)
    ? team.queryScanConsistency
    : undefined;
  const scanConsistency: ScanConsistency =
    inputs.scanConsistency ??
    (settingConsistency === 'request_plus' ||
    settingConsistency === 'not_bounded'
      ? settingConsistency
      : undefined) ??
    teamConsistency ??
    'not_bounded';

  const out: ResolvedQueryOptions = {
    timeoutMs: Math.min(timeout, config.maxTimeoutMs),
    scanConsistency,
    clientContextId: buildClientContextId(inputs.queryId, inputs.attribution),
    readOnly: !isReadOnlyExempt(inputs.query),
  };

  const num = (name: SourceSettingName) => {
    const v = sourceSetting(settings, name);
    return v != null ? Number(v) : undefined;
  };
  const sourceParallelism = num('max_parallelism');
  const teamParallelism = team?.queryMaxParallelism;
  const maxParallelism =
    sourceParallelism ??
    (Number.isInteger(teamParallelism) &&
    teamParallelism != null &&
    teamParallelism >= 1 &&
    teamParallelism <= 64
      ? teamParallelism
      : undefined);
  const scanCap = num('scan_cap');
  const pipelineBatch = num('pipeline_batch');
  const pipelineCap = num('pipeline_cap');
  if (maxParallelism != null) out.maxParallelism = maxParallelism;
  if (scanCap != null) out.scanCap = scanCap;
  if (pipelineBatch != null) out.pipelineBatch = pipelineBatch;
  if (pipelineCap != null) out.pipelineCap = pipelineCap;

  if (inputs.queryContext) {
    out.queryContext = `default:${quoteIdent(inputs.queryContext.bucket)}.${quoteIdent(inputs.queryContext.scope)}`;
  }

  return out;
}
