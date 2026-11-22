import { errorStatusPredicateSql } from '@couchbase-traces/common-utils/dist/core/spanPredicates';
import {
  TLogSource,
  TTraceSource,
} from '@couchbase-traces/common-utils/dist/types';

import { generateCostSqlExpression } from './cost';
import { buildAnyKeyExistsSql, buildLLMSpanSqlPredicate } from './detect';
import {
  LLMSql,
  llmSql,
  perServiceElectionSql,
  SqlDialect,
} from './sqlDialect';

/**
 * SQL expression derivation for the LLM dashboard, mirroring
 * `serviceDashboard.ts#getExpressions`. All expressions read span attributes
 * at query time and coalesce across the supported instrumentation dialects,
 * handling both `Map(String, String)` and JSON-typed attribute columns.
 */

type AttrCtx = { field: string; isJsonColumn: boolean; sql: LLMSql };

function fieldAccess({ field, isJsonColumn, sql }: AttrCtx, key: string) {
  return isJsonColumn && sql.dialect === 'clickhouse'
    ? `toString(${field}.\`${key}\`)`
    : sql.mapValue(field, key);
}

/** First non-empty string among the given attribute keys ('' when none). */
function coalesceString(ctx: AttrCtx, keys: readonly string[]): string {
  const [nullif, coalesce] =
    ctx.sql.dialect === 'clickhouse'
      ? ['nullif', 'coalesce']
      : ['NULLIF', 'COALESCE'];
  const args = keys.map(key => `${nullif}(${fieldAccess(ctx, key)}, '')`);
  return `${coalesce}(${args.join(', ')}, '')`;
}

/**
 * Numeric attribute across dialect key variants. `greatest` (not `+`) so a
 * span that carries the same count under several conventions (e.g. Vercel AI
 * emitting both `gen_ai.usage.*` and `ai.usage.*`) isn't double-counted.
 */
function greatestNumber(ctx: AttrCtx, keys: readonly string[]): string {
  const args = keys.map(key => ctx.sql.numberOrZero(fieldAccess(ctx, key)));
  return args.length === 1 ? args[0] : ctx.sql.greatest(args);
}

const MODEL_KEYS = [
  'gen_ai.response.model',
  'gen_ai.request.model',
  'llm.model_name',
  'ai.model.id',
];

const PROVIDER_KEYS = [
  'gen_ai.provider.name',
  'gen_ai.system',
  'ai.model.provider',
  'llm.provider',
];

const OPERATION_KEYS = ['gen_ai.operation.name', 'ai.operationId'];

const INPUT_TOKEN_KEYS = [
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.prompt_tokens',
  'llm.token_count.prompt',
  'ai.usage.inputTokens',
  'ai.usage.promptTokens',
  'input_tokens', // flat form (Claude Code spans, opencode logs)
];

const OUTPUT_TOKEN_KEYS = [
  'gen_ai.usage.output_tokens',
  'gen_ai.usage.completion_tokens',
  'llm.token_count.completion',
  'ai.usage.outputTokens',
  'ai.usage.completionTokens',
  'output_tokens',
];

const PROVIDED_COST_KEYS = ['gen_ai.usage.cost', 'llm.cost.total', 'cost_usd'];

const CACHED_INPUT_TOKEN_KEYS = [
  'gen_ai.usage.cache_read.input_tokens', // current semconv registry
  'gen_ai.usage.cached_input_tokens',
  'gen_ai.usage.input_cached_tokens',
  'gen_ai.usage.cache_read_input_tokens',
  'llm.token_count.prompt_details.cache_read',
  'ai.usage.cachedInputTokens',
  'ai.usage.inputTokenDetails.cacheReadTokens',
  'cache_read_tokens',
];

/** Prompt-cache write/creation tokens (billed at a premium by Anthropic). */
const CACHE_WRITE_TOKEN_KEYS = [
  'gen_ai.usage.cache_creation_input_tokens',
  'llm.token_count.prompt_details.cache_write',
  'ai.usage.inputTokenDetails.cacheWriteTokens',
  'cache_write_tokens',
  'cache_creation_tokens',
];

const REASONING_TOKEN_KEYS = [
  'gen_ai.usage.reasoning.output_tokens', // current semconv registry
  'gen_ai.usage.output_reasoning_tokens',
  'gen_ai.usage.reasoning_tokens',
  'llm.token_count.completion_details.reasoning',
  'ai.usage.reasoningTokens',
  'reasoning_tokens',
];

/**
 * Time-to-first-token in ms (Claude Code flat key, Vercel AI SDK, GitHub
 * Copilot Chat — verified ms in vscode-copilot-chat's chatMLFetcher).
 */
const TTFT_MS_KEYS = [
  'ttft_ms',
  'ai.response.msToFirstChunk',
  'copilot_chat.time_to_first_token',
];

const TOOL_NAME_KEYS = ['gen_ai.tool.name', 'ai.toolCall.name', 'tool_name'];

/** Agent attribution (semconv; opencode/Claude Code stamp agent.name). */
const AGENT_NAME_KEYS = ['gen_ai.agent.name', 'agent.name'];

const FINISH_REASON_KEYS = [
  'gen_ai.response.finish_reasons',
  'stop_reason',
  'llm.finish_reason',
  'ai.response.finishReason',
];

/** End-user attribution across instrumentations. */
const USER_ID_KEYS = [
  'user.email',
  'enduser.id',
  'user.id',
  'ai.telemetry.metadata.userId',
];

const SESSION_ID_KEYS = [
  'gen_ai.conversation.id',
  'session.id',
  'ai.telemetry.metadata.sessionId',
];

/**
 * Keys that identify a span as the authoritative usage reporter for a call.
 * SDK wrapper spans (e.g. Vercel's `ai.streamText` around
 * `ai.streamText.doStream`) duplicate usage under `ai.usage.*` only; gating
 * token/cost aggregations on these keys keeps each call counted once.
 */
const REPORTED_TOKEN_KEYS = [
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.prompt_tokens',
  'gen_ai.usage.output_tokens',
  'gen_ai.usage.completion_tokens',
  'llm.token_count.prompt',
  'llm.token_count.completion',
  'llm.token_count.total',
  // Flat form: primary reporters like Claude Code's llm_request spans.
  // SDK wrapper spans never use the flat form, so this stays double-count safe.
  'input_tokens',
  'output_tokens',
];

/** Every attribute key the dashboard derives meaning from. */
const ALL_LLM_ATTRIBUTE_KEYS = new Set([
  ...MODEL_KEYS,
  ...PROVIDER_KEYS,
  ...OPERATION_KEYS,
  ...INPUT_TOKEN_KEYS,
  ...OUTPUT_TOKEN_KEYS,
  ...PROVIDED_COST_KEYS,
  ...CACHED_INPUT_TOKEN_KEYS,
  ...CACHE_WRITE_TOKEN_KEYS,
  ...REASONING_TOKEN_KEYS,
  ...TTFT_MS_KEYS,
  ...TOOL_NAME_KEYS,
  ...AGENT_NAME_KEYS,
  ...FINISH_REASON_KEYS,
  ...SESSION_ID_KEYS,
]);

/** AI instrumentation namespaces (as a dot-segment prefix within a key). */
const LLM_KEY_NAMESPACE_PATTERN =
  /(^|\.)(gen_ai|llm|ai|openinference|copilot_chat)\./;

/**
 * Whether a flattened property key (e.g. `SpanAttributes.gen_ai.request.model`
 * from the delta chart's `select *` sampling) is an AI-relevant attribute:
 * any key the dashboard derives meaning from, or anything under an AI
 * instrumentation namespace. Used to pin these attributes to the top of the
 * Latency tab's delta breakdown.
 */
export function isLLMAttributeKey(flattenedKey: string): boolean {
  if (LLM_KEY_NAMESPACE_PATTERN.test(flattenedKey)) return true;
  if (ALL_LLM_ATTRIBUTE_KEYS.has(flattenedKey)) return true;
  // Claude Code's flat `model` key, only directly under an attribute map
  // column — bare `model` is too generic for suffix matching (device.model).
  if (/^[A-Za-z0-9_]+\.model$/.test(flattenedKey)) return true;
  // Flat dialect keys (opencode/Claude Code) appear nested under the
  // attribute map column, e.g. `SpanAttributes.input_tokens`.
  for (const key of ALL_LLM_ATTRIBUTE_KEYS) {
    if (flattenedKey.endsWith(`.${key}`)) return true;
  }
  return false;
}

/**
 * Attribute-derived expressions shared by trace spans and log events: both
 * carry LLM instrumentation in an attribute map column (SpanAttributes /
 * LogAttributes), just under a different field.
 */
function getLLMAttributeExpressions({
  attributeField,
  isJsonColumn,
  dialect,
}: {
  attributeField: string;
  isJsonColumn: boolean;
  dialect: SqlDialect;
}) {
  const sql = llmSql(dialect);
  const ctx: AttrCtx = { field: attributeField, isJsonColumn, sql };
  const str = (keys: readonly string[]) => coalesceString(ctx, keys);
  const num = (keys: readonly string[]) => greatestNumber(ctx, keys);

  /** Rows carrying any of these keys. Index-friendly — see buildKeyExistsSql. */
  const anyKeyExists = (keys: readonly string[]) =>
    buildAnyKeyExistsSql({ attributeField, keys, isJsonColumn, dialect });

  /**
   * Wrap a presence term that exists only to prune granules.
   *
   * `indexHint` feeds its argument to skip-index analysis but returns true at
   * execution, so the keys are never re-tested per surviving row. This is the
   * same thing queryParser.ts does with `mapKeyIndexExpression`.
   *
   * Only safe when a value term follows that already implies presence. A bare
   * presence filter must not be wrapped — `indexHint` alone matches every row.
   */
  const prunableKeys = (keys: readonly string[], hint: (x: string) => string) =>
    hint(anyKeyExists(keys));

  /**
   * Pair a value term with a pruning hint over the keys it reads.
   *
   * `valueTerm` alone defines the result; the hint only lets the index drop
   * granules, so it must be implied by `valueTerm` to be sound.
   *
   * Only worth adding in WHERE position — skip-index analysis does not look at
   * the select list, so a gate used solely inside an aggregate should pass its
   * value term through unhinted rather than pay the query-length cost.
   *
   * On JSON columns there is no key index to prune with, so the value term is
   * emitted alone. Same on Couchbase, which has no skip-index hint.
   */
  const withKeyPruning = (keys: readonly string[], valueTerm: string) =>
    isJsonColumn || !sql.indexHint
      ? valueTerm
      : `(${prunableKeys(keys, sql.indexHint)} AND ${valueTerm})`;

  /** "Any of these keys holds a non-empty value", before any pruning hint. */
  const anyKeyNonEmpty = (keys: readonly string[]) => `${str(keys)} != ''`;

  /**
   * Gate for "any of these keys holds a non-empty value".
   *
   * Presence alone would admit a key explicitly set to '', and every caller
   * pairs this gate with a coalesced value expression it groups by, so such a
   * row would show up as a blank bar/row whose drill-in link goes nowhere.
   *
   * The value term costs no extra per-part size lookups during planning: it
   * reads the same keys the paired group-by expression already reads.
   */
  const anyKeyHasValue = (keys: readonly string[]) =>
    withKeyPruning(keys, anyKeyNonEmpty(keys));

  // Derived from TOOL_NAME_KEYS rather than restated: a span whose tool name
  // resolves is a tool call, so the two must not drift. gen_ai.tool.call.id is
  // the one addition — it marks a tool call without naming it.
  //
  // Deriving currently changes nothing observable: the flat `tool_name` it
  // picks up is not in LLM_MARKER_ATTRIBUTE_KEYS, and every caller ANDs
  // isLLMSpan, so a span carrying only that key is dropped before this gate is
  // reached. Widening LLM detection to a key that generic is its own decision.
  const TOOL_SPAN_KEYS = [...TOOL_NAME_KEYS, 'gen_ai.tool.call.id'];
  const isToolSpanMatch = `(${fieldAccess(
    ctx,
    'openinference.span.kind',
  )} = 'TOOL' OR ${anyKeyNonEmpty(TOOL_SPAN_KEYS)})`;

  const model = str(MODEL_KEYS);
  const inputTokens = num(INPUT_TOKEN_KEYS);
  const outputTokens = num(OUTPUT_TOKEN_KEYS);
  const providedCost = num(PROVIDED_COST_KEYS);
  const cachedInput = num(CACHED_INPUT_TOKEN_KEYS);
  const cacheWriteInput = num(CACHE_WRITE_TOKEN_KEYS);
  /**
   * Total prompt context per convention: OpenAI/Vercel-style report cache
   * reads/writes as subsets of input_tokens; Anthropic/OpenInference-style
   * report input_tokens excluding both. Heuristic: when reads + writes
   * exceed input the row must be exclusive-style, so add them.
   */
  const isExclusiveStyle = `${cachedInput} + ${cacheWriteInput} > ${inputTokens}`;
  const effectiveInputTokens = sql.ifElse(
    isExclusiveStyle,
    `${inputTokens} + ${cachedInput} + ${cacheWriteInput}`,
    inputTokens,
  );
  const uncachedInputTokens = sql.greatest([
    sql.ifElse(
      isExclusiveStyle,
      inputTokens,
      `${inputTokens} - ${cachedInput} - ${cacheWriteInput}`,
    ),
    '0',
  ]);

  return {
    dialect,
    model,
    provider: str(PROVIDER_KEYS),
    operation: str(OPERATION_KEYS),
    conversationId: fieldAccess(ctx, 'gen_ai.conversation.id'),
    /** Session/conversation grouping id across dialects ('' when absent). */
    sessionId: str(SESSION_ID_KEYS),
    inputTokens,
    outputTokens,
    /** Full context processed + output (see effectiveInputTokens). */
    totalTokens: `${effectiveInputTokens} + ${outputTokens}`,
    cachedInputTokens: cachedInput,
    cacheWriteInputTokens: cacheWriteInput,
    effectiveInputTokens,
    uncachedInputTokens,
    reasoningTokens: num(REASONING_TOKEN_KEYS),
    ttftMs: num(TTFT_MS_KEYS),
    toolName: str(TOOL_NAME_KEYS),
    agentName: str(AGENT_NAME_KEYS),
    hasAgentName: anyKeyHasValue(AGENT_NAME_KEYS),
    // Emitters disagree on encoding ('stop' vs '["stop"]'); strip the JSON
    // array wrapper so the group-by buckets align.
    // The char class is written backslash-free (leading ] in an RE2 class
    // is literal) so it survives legacy store string-literal escape decoding
    // verbatim.
    finishReason: sql.regexpReplaceAll(
      str(FINISH_REASON_KEYS),
      `'[]["]'`,
      `''`,
    ),
    userId: str(USER_ID_KEYS),
    /** Estimated USD cost per row (provided cost wins over the catalog). */
    costUsd: generateCostSqlExpression({
      modelExpr: model,
      uncachedInputTokensExpr: uncachedInputTokens,
      cachedInputTokensExpr: cachedInput,
      cacheWriteInputTokensExpr: cacheWriteInput,
      outputTokensExpr: outputTokens,
      providedCostExpr: providedCost,
      dialect,
    }),
    isLLMSpan: buildLLMSpanSqlPredicate({
      attributeField,
      isJsonColumn,
      dialect,
    }),
    /**
     * Rows carrying a cost stamped by the instrumentation itself. These are
     * an app's own authoritative per-call reporters — see llmGatedSumExpr.
     */
    hasProvidedCost: `(${providedCost} > 0)`,
    /**
     * See REPORTED_TOKEN_KEYS: gates sums so wrapper spans don't double count.
     * Unhinted — perServiceElectionExpr only ever embeds this inside select-list
     * aggregates, where a hint cannot prune and would just lengthen a query this
     * file already keeps under max_query_size (see LLM_COST_SQL_ALIAS).
     */
    hasReportedTokens: anyKeyNonEmpty(REPORTED_TOKEN_KEYS),
    hasSessionId: anyKeyHasValue(SESSION_ID_KEYS),
    // Numeric rather than non-empty: it feeds a latency percentile, and a
    // zero would drag p50/p95 down. Same shape as anyKeyHasValue otherwise —
    // `> 0` implies the key is present, so presence is pruning only.
    hasTtft: withKeyPruning(TTFT_MS_KEYS, `${num(TTFT_MS_KEYS)} > 0`),
    hasUserId: anyKeyHasValue(USER_ID_KEYS),
    hasFinishReason: anyKeyHasValue(FINISH_REASON_KEYS),
    /**
     * Tool-call rows, for WHERE position.
     *
     * The `= 'TOOL'` term stays a value comparison — it discriminates one
     * OpenInference span kind from the others, and the query builder already
     * rewrites equality onto the attribute-items index. The remaining terms
     * gate a group-by on toolName, so they keep their value check too.
     *
     * The hint sits above the OR, not inside it: a skip index can only drop a
     * granule when every arm of an OR is decidable by that same index, and the
     * span-kind arm is not. Hoisting is sound because both arms imply one of
     * the hinted keys.
     */
    isToolSpan: withKeyPruning(
      ['openinference.span.kind', ...TOOL_SPAN_KEYS],
      isToolSpanMatch,
    ),
    /**
     * isToolSpan for select-list aggregate positions (`aggCondition`), which
     * renderChartConfig emits inside countIf/sumIf. Skip-index analysis never
     * reaches the select list, so the hint would fold to a constant while
     * lengthening every query — see withKeyPruning.
     */
    isToolSpanUnhinted: isToolSpanMatch,
  };
}

export function getLLMExpressions(
  source: TTraceSource,
  jsonColumns: string[],
  dialect: SqlDialect = 'clickhouse',
) {
  const attributeField = source.eventAttributesExpression || 'SpanAttributes';
  const isJsonColumn = jsonColumns.includes(attributeField);

  const duration = source.durationExpression || 'Duration';
  const durationPrecision = source.durationPrecision ?? 9;

  const attributeExpressions = getLLMAttributeExpressions({
    attributeField,
    isJsonColumn,
    dialect,
  });

  const fieldExpressions = {
    duration,
    durationPrecision,
    traceId: source.traceIdExpression || 'TraceId',
    service: source.serviceNameExpression || 'ServiceName',
    spanName: source.spanNameExpression || 'SpanName',
    severityText: source.statusCodeExpression || 'StatusCode',
    statusMessage: source.statusMessageExpression || 'StatusMessage',
  };

  const auxExpressions = {
    /** Span duration in ms (see serviceDashboard.ts for the MV rationale). */
    durationInMillis: `${duration}/1e${durationPrecision - 3}`,
    durationDivisorForMillis: `1e${durationPrecision - 3}`,
  };

  return {
    ...attributeExpressions,
    ...fieldExpressions,
    ...auxExpressions,
    isError: errorStatusPredicateSql(fieldExpressions.severityText),
    hasTokens: `${attributeExpressions.totalTokens} > 0`,
  };
}

export type LLMExpressions = ReturnType<typeof getLLMExpressions>;

/**
 * Expressions for LLM-related log events (e.g. opencode's `api_request`
 * logs). Session/detection expressions read the log source's attribute map.
 */
export function getLLMLogExpressions(
  source: TLogSource,
  jsonColumns: string[],
  dialect: SqlDialect = 'clickhouse',
) {
  const attributeField = source.eventAttributesExpression || 'LogAttributes';
  const isJsonColumn = jsonColumns.includes(attributeField);

  const attributeExpressions = getLLMAttributeExpressions({
    attributeField,
    isJsonColumn,
    dialect,
  });

  const severityText = source.severityTextExpression || 'SeverityText';

  return {
    ...attributeExpressions,
    service: source.serviceNameExpression || 'ServiceName',
    severityText,
    /**
     * Error log events. Severity text has its own vocabulary, so this keeps a
     * predicate of its own rather than reusing the span-status one: the extra
     * status value that predicate matches cannot appear in a severity-text
     * column, and the values severity text does use for errors are a
     * different set.
     */
    isError: `lower(${severityText}) = 'error'`,
    /**
     * Log events that belong to LLM activity: explicit LLM markers or any
     * session id (covers tool_result / lifecycle events that carry a
     * session.id without gen_ai attributes).
     */
    isLLMRelated: `(${attributeExpressions.isLLMSpan} OR ${attributeExpressions.hasSessionId})`,
  };
}

export type LLMLogExpressions = ReturnType<typeof getLLMLogExpressions>;

/**
 * Query-level alias for the per-row cost expression. The full `costUsd`
 * expression embeds the model price catalog (~70 KiB of SQL); referencing it
 * more than once per query risks legacy store's 256 KiB max_query_size, so
 * `baseLLMChartConfig` binds it once as a WITH expression alias and charts
 * reference this name instead.
 */
export const LLM_COST_SQL_ALIAS = '__llm_cost_usd';

type GateExpressions = Pick<
  LLMExpressions,
  'hasProvidedCost' | 'hasReportedTokens' | 'service'
> &
  Partial<Pick<LLMExpressions, 'dialect'>>;

/**
 * Per-service election over an aggregation scope: for each service, when
 * any of its rows carries an instrumentation-provided cost, sum only those
 * rows; otherwise sum all its usage-reporting rows. The per-service results
 * are then added up.
 *
 * `Map[k]` defaults to 0 for absent keys and sumMap keeps zero totals, so
 * iterating the union of keys is safe. legacy store computes syntactically
 * identical aggregate expressions once, so the repeated sumMaps don't
 * re-scan.
 */
function perServiceElectionExpr(
  expressions: GateExpressions,
  valueExpression: string,
): string {
  return perServiceElectionSql(
    llmSql(expressions.dialect),
    expressions,
    valueExpression,
  );
}

/**
 * Election-gated sum for token/cost aggregations, used as a raw select
 * expression (no aggFn). When a service has spans with an
 * instrumentation-provided cost, those are that app's own authoritative
 * per-call reporters and its other dialects' usage rows describe the same
 * calls again — e.g. opencode emits an OpenInference span (with `cost_usd`)
 * *and* Vercel AI SDK spans (with `gen_ai.usage.*`) for each call, in
 * separate traces, so no row-local gate can dedupe them. Summing only that
 * service's provided-cost rows counts each call once, while services
 * without provided costs keep all their usage-reporting rows — a scope-wide
 * election would silently drop token-only apps whenever any other app in
 * scope reports costs.
 *
 * Residual limitation: an app that stamps provided cost on only some of its
 * own calls still undercounts — indistinguishable from duplicate reporting
 * without row-level call identity.
 *
 * Note: rendered as raw SQL, so sample-weight correction does not apply.
 */
export function llmGatedSumExpr(
  expressions: GateExpressions,
  valueExpression: string,
): string {
  return perServiceElectionExpr(expressions, valueExpression);
}

/** Election-gated call count (see llmGatedSumExpr). */
export function llmGatedCountExpr(expressions: GateExpressions): string {
  return perServiceElectionExpr(expressions, '1');
}
