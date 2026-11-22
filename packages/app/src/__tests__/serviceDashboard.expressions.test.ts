import { makeTraceSource } from '@/llm/__fixtures__/sources';
import { getExpressions } from '@/serviceDashboard';

const source = makeTraceSource();

describe('getExpressions endpoint filter (D10 /services)', () => {
  it('keeps the upstream ClickHouse form', () => {
    expect(getExpressions(source, [], []).isEndpointNonEmpty).toBe(
      'NOT empty(SpanName)',
    );
  });

  it('uses SQL++ on a Couchbase connection, which has no empty()', () => {
    const { isEndpointNonEmpty } = getExpressions(source, [], [], 'couchbase');
    expect(isEndpointNonEmpty).toBe("IFMISSINGORNULL(SpanName, '') != ''");
    expect(isEndpointNonEmpty).not.toMatch(/\bempty\(/);
  });
});
