import { buildSessionEventFilters, sessionRowSchema } from '@/utils/sessions';

const traceSource = { spanNameExpression: 'SpanName' };

describe('buildSessionEventFilters', () => {
  const filters = buildSessionEventFilters({
    traceSource,
    sessionId: 'abc',
    sessionIdKey: 'session.id',
  });

  it('highlights failed requests from either HTTP key set', () => {
    expect(filters.highlighted[0]).toEqual({
      type: 'lucene',
      condition: 'SpanAttributes.session.id:"abc"',
    });
    expect(filters.highlighted[1].condition).toContain(
      'SpanAttributes.http.status_code:>299',
    );
    expect(filters.highlighted[1].condition).toContain(
      'SpanAttributes.http.response.status_code:>299',
    );
    expect(filters.highlighted[1].condition).toContain(
      'SpanAttributes.error.type:*',
    );
  });

  it('lists every request, including ones without a status code', () => {
    expect(filters.all[0]).toEqual(filters.highlighted[0]);
    expect(filters.all[1].condition).toContain(
      'SpanAttributes.http.status_code:*',
    );
    expect(filters.all[1].condition).toContain('SpanAttributes.url.full:*');
  });
});

describe('sessionRowSchema', () => {
  const row = {
    id: 'a::b',
    'otel.library.name': '@opentelemetry/instrumentation-fetch',
    parent_span_id: '',
    severity_text: 'Error',
    span_id: 'b',
    span_name: 'GET',
    timestamp: '2026-01-01T00:00:00.000000000Z',
    trace_id: 'a',
  };

  it('accepts a whole-number duration sent as a quoted Int64', () => {
    const parsed = sessionRowSchema.safeParse({ ...row, durationInMs: '12' });
    expect(parsed.success && parsed.data.durationInMs).toBe(12);
  });

  it('keeps the Couchbase document key for the row lookup', () => {
    const parsed = sessionRowSchema.safeParse({
      ...row,
      durationInMs: 1.5,
      __cbt_id: 'a:b',
    });
    expect(parsed.success && parsed.data.__cbt_id).toBe('a:b');
  });
});
