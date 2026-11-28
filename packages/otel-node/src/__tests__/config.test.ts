import { applyOptions } from '../config';
import { exceptionAttributes } from '../exception';

const KEYS = [
  'OTEL_SERVICE_NAME',
  'OTEL_RESOURCE_ATTRIBUTES',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_HEADERS',
  'CBT_CAPTURE_HTTP_BODY',
];

describe('applyOptions', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const key of KEYS) delete process.env[key];
  });
  afterAll(() => {
    process.env = saved;
  });

  it('writes options to unset variables', () => {
    applyOptions({
      serviceName: 'api',
      endpoint: 'http://c:4318',
      apiKey: ' k/1 ',
      httpBodyCapture: true,
    });
    expect(process.env.OTEL_SERVICE_NAME).toBe('api');
    expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://c:4318');
    expect(process.env.OTEL_EXPORTER_OTLP_HEADERS).toBe('authorization=k%2F1');
    expect(process.env.CBT_CAPTURE_HTTP_BODY).toBe('true');
  });

  it('never overwrites what the operator set', () => {
    process.env.OTEL_SERVICE_NAME = 'ops';
    process.env.OTEL_EXPORTER_OTLP_HEADERS = 'x=y';
    applyOptions({ serviceName: 'api', apiKey: 'k' });
    expect(process.env.OTEL_SERVICE_NAME).toBe('ops');
    expect(process.env.OTEL_EXPORTER_OTLP_HEADERS).toBe('x=y');
  });

  it('leaves the service name to OTEL_RESOURCE_ATTRIBUTES when it sets one', () => {
    process.env.OTEL_RESOURCE_ATTRIBUTES = 'a=b, service.name=r';
    applyOptions({ serviceName: 'api' });
    expect(process.env.OTEL_SERVICE_NAME).toBeUndefined();
  });

  it('ignores a blank key', () => {
    applyOptions({ apiKey: '  ' });
    expect(process.env.OTEL_EXPORTER_OTLP_HEADERS).toBeUndefined();
  });
});

describe('exceptionAttributes', () => {
  it('leaves strings and plain errors to the SDK', () => {
    expect(exceptionAttributes('boom')).toEqual({});
    expect(exceptionAttributes(new Error('x'))).toEqual({});
  });

  it('records non-errors as JSON', () => {
    expect(exceptionAttributes({ code: 1 })).toEqual({
      'exception.message': '{"code":1}',
    });
    expect(exceptionAttributes(10n)).toEqual({ 'exception.message': '10' });
  });

  it('appends up to five causes as Caused by sections', () => {
    let error: unknown = 'root';
    for (let i = 0; i < 7; i++) error = new Error(`e${i}`, { cause: error });
    const stack = exceptionAttributes(error)['exception.stacktrace'];
    expect(stack).toMatch(/^Error: e6\n/);
    expect(stack.match(/\nCaused by: /g)).toHaveLength(5);
    expect(stack).toContain('Caused by: Error: e1');
    expect(stack).not.toContain('Caused by: Error: e0');
  });

  it('stops at a cycle', () => {
    const a: Error & { cause?: unknown } = new Error('a');
    const b = new Error('b', { cause: a });
    a.cause = b;
    const stack = exceptionAttributes(a)['exception.stacktrace'];
    expect(stack.match(/Caused by/g)).toHaveLength(1);
  });
});
