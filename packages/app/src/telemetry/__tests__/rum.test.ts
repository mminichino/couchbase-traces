import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';

import {
  attributesLogRecordProcessor,
  attributesSpanProcessor,
  consoleExceptionProcessor,
  exceptionAttributes,
  serializeConsoleArgs,
  setAttributes,
  setUser,
  userLogRecordProcessor,
  userSpanProcessor,
} from '@/telemetry/rum';

// Real providers with in-memory exporters, so each processor runs where the
// SDK calls it and the test reads what would be exported.
const logExporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  processors: [
    consoleExceptionProcessor,
    userLogRecordProcessor,
    attributesLogRecordProcessor,
    new SimpleLogRecordProcessor({ exporter: logExporter }),
  ],
});
const spanExporter = new InMemorySpanExporter();
const tracerProvider = new TracerProvider({
  spanProcessors: [
    userSpanProcessor,
    attributesSpanProcessor,
    new SimpleSpanProcessor({ exporter: spanExporter }),
  ],
});

function emitLog(eventName?: string, attributes = {}) {
  logExporter.reset();
  loggerProvider.getLogger('test').emit({ eventName, attributes, body: 'x' });
  return logExporter.getFinishedLogRecords()[0].attributes;
}

function endSpan(attributes = {}) {
  spanExporter.reset();
  tracerProvider.getTracer('test').startSpan('s', { attributes }).end();
  return spanExporter.getFinishedSpans()[0].attributes;
}

describe('exceptionAttributes', () => {
  it('records a string as the message', () => {
    expect(exceptionAttributes('boom')).toEqual({
      'exception.message': 'boom',
    });
  });

  it('records name, message, and the cause chain', () => {
    const root = new TypeError('root');
    const error = new Error('outer', { cause: root });
    const attrs = exceptionAttributes(error);
    expect(attrs['exception.type']).toBe('Error');
    expect(attrs['exception.message']).toBe('outer');
    expect(attrs['exception.stacktrace']).toMatch(
      /^Error: outer[\s\S]*\nCaused by: TypeError: root/,
    );
  });

  it('stops at five causes and at cycles', () => {
    const error: { message: string; stack: string; cause?: unknown } = {
      message: 'loop',
      stack: 'S',
    };
    error.cause = error;
    expect(exceptionAttributes(error)['exception.stacktrace']).toBe('S');
    let deep: unknown = 'bottom';
    for (let i = 0; i < 8; i++) deep = new Error(`e${i}`, { cause: deep });
    const text = String(exceptionAttributes(deep)['exception.stacktrace']);
    expect(text.match(/Caused by:/g)).toHaveLength(5);
  });

  it('records other values as JSON', () => {
    expect(exceptionAttributes({ code: 1 })).toEqual({
      'exception.message': '{"code":1}',
    });
  });
});

describe('serializeConsoleArgs', () => {
  it.each([
    [['a', 1, { b: 2 }], 'a 1 {"b":2}'],
    [['%s=%d', 'n', '42.9'], 'n=42'],
    [['%f%%', '1.5'], '1.5%'],
    [['%c styled', 'color: red'], ' styled'],
    [['%s %s', 'only'], 'only %s'],
    [['%x', 1], '%x 1'],
    [[Symbol.for('s')], 'Symbol(s)'],
  ])('formats %p', (args, expected) => {
    expect(serializeConsoleArgs(args)).toBe(expected);
  });

  it('writes errors as message and stack', () => {
    const error = new Error('bad');
    expect(serializeConsoleArgs(['failed:', error])).toContain(
      'failed: Error: bad',
    );
  });

  it('adds exception attributes to the next browser.console record', () => {
    serializeConsoleArgs(['x', new Error('bad')]);
    expect(emitLog('browser.console')['exception.message']).toBe('bad');
    // The remembered error is consumed by that record.
    expect(emitLog('browser.console')).toEqual({});
  });
});

describe('user and custom attributes', () => {
  afterEach(() => {
    setUser(null);
    setAttributes(null);
  });

  it('adds the user to spans and logs, leaving out empty fields', () => {
    setUser({ id: 'u1', email: '', name: 'n', roles: [] });
    expect(endSpan()).toEqual({ 'user.id': 'u1', 'user.name': 'n' });
    expect(emitLog()).toEqual({ 'user.id': 'u1', 'user.name': 'n' });
  });

  it('never overwrites attributes already set', () => {
    setAttributes({ 'app.team': 't', 'session.id': 'custom' });
    expect(endSpan({ 'session.id': 'sdk' })).toEqual({
      'session.id': 'sdk',
      'app.team': 't',
    });
    expect(emitLog()).toEqual({ 'app.team': 't', 'session.id': 'custom' });
  });

  it('clears both with null', () => {
    setUser({ id: 'u1' });
    setAttributes({ a: 1 });
    setUser(null);
    setAttributes(null);
    expect(endSpan()).toEqual({});
  });
});
