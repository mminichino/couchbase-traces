/**
 * D10: the app-side SQL++ builders behind /llm, /sessions and /services, run
 * on the cluster started by port/couchbase-test/run.sh. Rows come from inline
 * array literals, so the suite needs no collections. Talks to the query REST
 * endpoint over HTTP: the Couchbase SDK is a native addon and stays out of
 * packages/app (AGENTS.md rule 3). Skipped unless CBT_TEST_COUCHBASE_REQUIRED=1.
 */
import { disjointSqlParams } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';

import { LIVE, liveQuery as query } from '@/couchbase/__fixtures__/liveQuery';
import { elapsedMinutesExpr } from '@/couchbase/dialectExpr';
import { buildSessionsCtesCouchbase } from '@/couchbase/sessionsList';
import { makeTraceSource } from '@/llm/__fixtures__/sources';
import {
  getLLMExpressions,
  llmGatedCountExpr,
  llmGatedSumExpr,
} from '@/llm/lib/expressions';

const rows = (docs: object[]) => JSON.stringify(docs);
const itLive = LIVE ? it : it.skip;

const SPANS = rows([
  // opencode stamps a provided cost on one call and duplicates it through
  // a token-only wrapper span; chatbot only reports tokens.
  {
    ServiceName: 'opencode',
    SpanAttributes: {
      'gen_ai.system': 'anthropic',
      'gen_ai.response.model': 'claude-3-5-sonnet',
      'gen_ai.usage.input_tokens': '100',
      'gen_ai.response.finish_reasons': '["stop"]',
      cost_usd: '0.5',
      'session.id': 'sess-a',
    },
  },
  {
    ServiceName: 'opencode',
    SpanAttributes: {
      'gen_ai.system': 'anthropic',
      'gen_ai.response.model': 'claude-3-5-sonnet',
      'gen_ai.usage.input_tokens': '100',
    },
  },
  {
    ServiceName: 'chatbot',
    SpanAttributes: {
      'gen_ai.system': 'openai',
      'gen_ai.request.model': 'gpt-4o',
      'gen_ai.usage.input_tokens': '40',
    },
  },
  { ServiceName: 'chatbot', SpanAttributes: { 'http.method': 'GET' } },
]);

describe('D10 /llm expressions on a live cluster', () => {
  const e = getLLMExpressions(makeTraceSource(), [], 'couchbase');

  itLive('derives per-row attributes and the LLM span filter', async () => {
    const result = await query(
      `SELECT ${e.model} AS model, ${e.sessionId} AS sid, ${e.finishReason} AS fin, ${e.inputTokens} AS tok, ${e.hasProvidedCost} AS paid FROM ${SPANS} AS d WHERE ${e.isLLMSpan}`,
    );
    expect(result).toEqual([
      {
        model: 'claude-3-5-sonnet',
        sid: 'sess-a',
        fin: 'stop',
        tok: 100,
        paid: true,
      },
      { model: 'claude-3-5-sonnet', sid: '', fin: '', tok: 100, paid: false },
      { model: 'gpt-4o', sid: '', fin: '', tok: 40, paid: false },
    ]);
  });

  itLive('elects provided-cost rows per service', async () => {
    const [all] = await query(
      `SELECT ${llmGatedSumExpr(e, e.inputTokens)} AS tokens, ${llmGatedCountExpr(e)} AS calls FROM ${SPANS} AS d WHERE ${e.isLLMSpan}`,
    );
    // opencode: only its provided-cost row (100); chatbot: all usage (40).
    expect(all).toEqual({ tokens: 140, calls: 2 });
    const grouped = await query(
      `SELECT ServiceName AS svc, ${llmGatedSumExpr(e, e.inputTokens)} AS tokens FROM ${SPANS} AS d WHERE ${e.isLLMSpan} GROUP BY ServiceName ORDER BY svc`,
    );
    expect(grouped).toEqual([
      { svc: 'chatbot', tokens: 40 },
      { svc: 'opencode', tokens: 100 },
    ]);
  });

  itLive('elects zero over an empty scope', async () => {
    const [empty] = await query(
      `SELECT ${llmGatedCountExpr(e)} AS calls FROM ${SPANS} AS d WHERE FALSE`,
    );
    expect(empty).toEqual({ calls: 0 });
  });
});

describe('D10 /sessions CTE merge on a live cluster', () => {
  const span = (sid: string, interactions: number) => ({
    serviceName: 'web',
    sessionId: sid,
    maxTimestamp: '2026-03-01T10:05:00Z',
    minTimestamp: '2026-03-01T10:00:00Z',
    sessionCount: 3,
    errorCount: 1,
    interactionCount: interactions,
    recordingCount: 0,
    rumRows: 0,
    userEmail: 'a@example.com',
    userName: 'A',
    teamId: 't',
    teamName: 'T',
  });

  itLive.each([true, false])(
    'runs with aliased FROM subqueries (recordings: %s)',
    async withRecordings => {
      const recording = {
        serviceName: 'web',
        sessionId: 's2',
        maxTimestamp: '2026-03-01T10:09:00Z',
        minTimestamp: '2026-03-01T10:08:00Z',
        rumRows: 1,
      };
      const cte = buildSessionsCtesCouchbase({
        name: 'sessions',
        spans: {
          sql: `SELECT x.* FROM ${rows([span('s1', 2), span('s3', 0)])} AS x`,
          params: {},
        },
        recordings: withRecordings
          ? { sql: `SELECT x.* FROM ${rows([recording])} AS x`, params: {} }
          : undefined,
        withActivityFilter: true,
      });
      const result = await query(
        `${cte.sql} SELECT RAW s.sessionId FROM sessions AS s`,
      );
      expect(result).toEqual(withRecordings ? ['s2', 's1'] : ['s1']);
    },
  );

  // Every render numbers its parameters from $p0. Spliced together unrenamed,
  // the recordings window bound the spans' bounds and the page got rows with
  // MISSING timestamps ("Invalid time value").
  itLive('binds each fragment to its own parameters', async () => {
    const [spans, recordings] = disjointSqlParams([
      {
        sql: `SELECT x.* FROM ${rows([span('s1', 2)])} AS x WHERE x.maxTimestamp >= $p0`,
        params: { p0: '2026-03-01T10:00:00Z' },
      },
      {
        sql: `SELECT x.* FROM ${rows([
          {
            serviceName: 'web',
            sessionId: 's2',
            maxTimestamp: '2026-03-01T10:09:00Z',
            minTimestamp: '2026-03-01T10:08:00Z',
            rumRows: 1,
          },
        ])} AS x WHERE x.serviceName = $p0`,
        params: { p0: 'web' },
      },
    ] as const);
    const cte = buildSessionsCtesCouchbase({
      name: 'sessions',
      spans: spans,
      recordings,
      withActivityFilter: true,
    });
    const result = await query(
      `${cte.sql} SELECT sessions.* FROM sessions`,
      cte.params,
    );
    // Flat rows (`sessions.*`, not `*`) are what the page reads.
    expect(
      result.map(r => ({
        sessionId: r.sessionId,
        maxTimestamp: r.maxTimestamp,
      })),
    ).toEqual([
      { sessionId: 's2', maxTimestamp: '2026-03-01T10:09:00Z' },
      { sessionId: 's1', maxTimestamp: '2026-03-01T10:05:00Z' },
    ]);
  });
});

describe('D10 /services request rate on a live cluster', () => {
  itLive('divides by the searched range in whole minutes', async () => {
    const minutes = elapsedMinutesExpr(
      new Date('2026-03-01T10:00:00Z'),
      new Date('2026-03-01T10:04:30Z'),
      'couchbase',
    );
    const [r] = await query(
      `SELECT ROUND(COUNT(*) / ${minutes}, 1) AS rate FROM ${rows([{}, {}, {}, {}, {}, {}])} AS d`,
    );
    expect(r).toEqual({ rate: 1.5 });
  });
});
