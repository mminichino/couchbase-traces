import { anyValueToString, formatFloatGo, nanosToIso } from '@/otlp/values';

describe('formatFloatGo', () => {
  it('matches the collector double encoding', () => {
    expect(formatFloatGo(0.1)).toBe('0.1');
    expect(formatFloatGo(1e21)).toBe('1e+21');
    expect(formatFloatGo(1e-7)).toBe('1e-7');
    expect(formatFloatGo(123456789.125)).toBe('123456789.125');
    expect(formatFloatGo(-0)).toBe('-0');
    expect(formatFloatGo(Number.NaN)).toBe('NaN');
    expect(formatFloatGo(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(formatFloatGo(Number.NEGATIVE_INFINITY)).toBe('-Infinity');
  });
});

describe('anyValueToString', () => {
  it('covers every AnyValue kind', () => {
    expect(anyValueToString(undefined)).toBe('');
    expect(anyValueToString({})).toBe('');
    expect(anyValueToString({ stringValue: 'hi' })).toBe('hi');
    expect(anyValueToString({ intValue: '42' })).toBe('42');
    expect(anyValueToString({ doubleValue: 0.1 })).toBe('0.1');
    expect(anyValueToString({ boolValue: true })).toBe('true');
    expect(anyValueToString({ boolValue: false })).toBe('false');
    expect(anyValueToString({ bytesValue: 'YQ==' })).toBe('YQ==');
    expect(
      anyValueToString({
        arrayValue: { values: [{ stringValue: 'a' }, { intValue: '2' }] },
      }),
    ).toBe('["a",2]');
    expect(
      anyValueToString({
        kvlistValue: {
          values: [
            { key: 'b', value: { stringValue: '2' } },
            { key: 'a', value: { boolValue: true } },
          ],
        },
      }),
    ).toBe('{"a":true,"b":"2"}');
  });
});

describe('nanosToIso', () => {
  it('formats nanoseconds and seconds, including past 2038', () => {
    expect(nanosToIso(undefined, 'ns')).toBeNull();
    expect(nanosToIso('0', 'ns')).toBeNull();
    expect(nanosToIso(0, 's')).toBeNull();
    expect(nanosToIso('1000000000', 'ns')).toBe(
      '1970-01-01T00:00:01.000000000Z',
    );
    expect(nanosToIso('1000000000', 's')).toBe(
      '1970-01-01T00:00:01.000000000Z',
    );
    expect(nanosToIso('1500000001', 'ns')).toBe(
      '1970-01-01T00:00:01.500000001Z',
    );
    const past2038 = String(2_200_000_000n * 1_000_000_000n);
    expect(nanosToIso(past2038, 'ns')).toBe('2039-09-18T23:06:40.000000000Z');
  });
});
