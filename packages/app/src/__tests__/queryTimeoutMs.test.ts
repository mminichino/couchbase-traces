import { queryTimeoutToRequestTimeoutMs } from '@/dataClient';

describe('queryTimeoutToRequestTimeoutMs', () => {
  it('converts team timeout seconds to client milliseconds', () => {
    expect(queryTimeoutToRequestTimeoutMs(60)).toBe(60_000);
    expect(queryTimeoutToRequestTimeoutMs(1)).toBe(1000);
  });

  it('treats 0 as unlimited and leaves nullish undefined', () => {
    expect(queryTimeoutToRequestTimeoutMs(0)).toBe(0);
    expect(queryTimeoutToRequestTimeoutMs(null)).toBeUndefined();
    expect(queryTimeoutToRequestTimeoutMs(undefined)).toBeUndefined();
  });
});
