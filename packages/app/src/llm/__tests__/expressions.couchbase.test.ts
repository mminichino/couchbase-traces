import { findClickhouseOnlyConstructs } from '@couchbase-traces/common-utils/dist/couchbase/clickhouseOnly';

import { makeLogSource, makeTraceSource } from '@/llm/__fixtures__/sources';
import { generateCostSqlExpression } from '@/llm/lib/cost';
import { buildLLMSpanSqlPredicate } from '@/llm/lib/detect';
import {
  getLLMExpressions,
  getLLMLogExpressions,
  llmGatedCountExpr,
  llmGatedSumExpr,
} from '@/llm/lib/expressions';

// ClickHouse-only forms the LLM dashboard emitted before D10. SQL++ has none
// of them (`if` is a reserved word; the rest are not functions).
const CLICKHOUSE_FORMS =
  /\b(mapContains|indexHint|toFloat64OrZero|toFloat64|toUInt64|sumMap|arrayMap|arraySum|arrayDistinct|arrayConcat|mapKeys|replaceRegexpAll|multiIf|match|if)\(/;

function expectSqlpp(sql: string) {
  expect(sql).not.toMatch(CLICKHOUSE_FORMS);
  expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
}

describe('getLLMExpressions (couchbase)', () => {
  const expressions = getLLMExpressions(makeTraceSource(), [], 'couchbase');

  it.each(
    Object.entries(expressions).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  )('emits only SQL++ functions in %s', (_name, value) => {
    expectSqlpp(value);
  });

  it('tests key presence with IS NOT MISSING', () => {
    expect(expressions.isLLMSpan).toContain(
      'SpanAttributes.`gen_ai.operation.name` IS NOT MISSING',
    );
  });

  it('reads numbers with TONUMBER defaulting to zero', () => {
    expect(expressions.inputTokens).toContain(
      'IFMISSINGORNULL(TONUMBER(SpanAttributes.`gen_ai.usage.input_tokens`), 0)',
    );
    expect(expressions.inputTokens.startsWith('GREATEST(')).toBe(true);
  });

  it('coalesces strings across dialect keys', () => {
    expect(expressions.model).toBe(
      "COALESCE(NULLIF(SpanAttributes.`gen_ai.response.model`, ''), NULLIF(SpanAttributes.`gen_ai.request.model`, ''), NULLIF(SpanAttributes.`llm.model_name`, ''), NULLIF(SpanAttributes.`ai.model.id`, ''), '')",
    );
  });

  it('drops the ClickHouse skip-index hint and keeps the value term', () => {
    expect(expressions.hasSessionId).toBe(`${expressions.sessionId} != ''`);
  });

  it('strips JSON array wrappers from finish reasons with REGEXP_REPLACE', () => {
    expect(expressions.finishReason).toMatch(
      /^REGEXP_REPLACE\(COALESCE\(.*\), '\[\]\["\]', ''\)$/,
    );
  });

  it('uses CASE for the effective input token heuristic', () => {
    expect(expressions.effectiveInputTokens.startsWith('CASE WHEN ')).toBe(
      true,
    );
  });

  it('elects per service over one ARRAY_AGG bound with FIRST', () => {
    const sql = llmGatedSumExpr(expressions, 'x');
    expectSqlpp(sql);
    expect(sql).toMatch(/^FIRST IFNULL\(ARRAY_SUM\(ARRAY CASE WHEN /);
    expect(sql).toContain(`"s": ${expressions.service}`);
    expect(sql).toContain('"v": TONUMBER(x)');
    expect(sql.match(/ARRAY_AGG\(/g)).toHaveLength(1);
    expect(llmGatedCountExpr(expressions)).toBe(
      llmGatedSumExpr(expressions, '1'),
    );
  });
});

describe('getLLMLogExpressions (couchbase)', () => {
  it('emits only SQL++ functions over LogAttributes', () => {
    const expressions = getLLMLogExpressions(makeLogSource(), [], 'couchbase');
    expectSqlpp(expressions.isLLMRelated);
    expect(expressions.isLLMRelated).toContain(
      'LogAttributes.`gen_ai.system` IS NOT MISSING',
    );
  });
});

describe('buildLLMSpanSqlPredicate (couchbase)', () => {
  it('ORs IS NOT MISSING over the marker keys', () => {
    const sql = buildLLMSpanSqlPredicate({
      attributeField: 'SpanAttributes',
      isJsonColumn: false,
      dialect: 'couchbase',
    });
    expectSqlpp(sql);
    expect(sql.startsWith('(SpanAttributes.`gen_ai.operation.name`')).toBe(
      true,
    );
  });
});

describe('generateCostSqlExpression (couchbase)', () => {
  it('prices with REGEXP_CONTAINS inside CASE', () => {
    const sql = generateCostSqlExpression({
      modelExpr: 'm',
      uncachedInputTokensExpr: 'u',
      cachedInputTokensExpr: 'c',
      cacheWriteInputTokensExpr: 'w',
      outputTokensExpr: 'o',
      providedCostExpr: 'p',
      maxModels: 2,
      dialect: 'couchbase',
    });
    expectSqlpp(sql);
    expect(sql).toMatch(/^CASE WHEN \(p\) > 0 THEN p ELSE /);
    expect(sql).toContain("REGEXP_CONTAINS(m, '(?i)");
  });
});
