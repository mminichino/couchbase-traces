import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';

import { hasSignalPath, resolveUrl, signalUrl } from '@/telemetry/endpoints';
import { MutationLimiter, type RrwebEvent } from '@/telemetry/mutationLimiter';
import {
  MAX_CHUNK_BYTES,
  splitIntoChunks,
  toOtlpJson,
} from '@/telemetry/replayExport';

describe('collector endpoints', () => {
  it.each([
    ['https://c.example:4318', 'https://c.example:4318/v1/traces'],
    ['https://c.example:4318/', 'https://c.example:4318/v1/traces'],
    ['https://c.example/otel', 'https://c.example/otel/v1/traces'],
    ['https://c.example/otel/v1/logs', 'https://c.example/otel/v1/traces'],
    ['https://c.example/v1/traces//', 'https://c.example/v1/traces'],
  ])('builds the traces URL from %s', (endpoint, expected) => {
    expect(signalUrl(endpoint, 'traces')).toBe(expected);
  });

  it('resolves a relative proxy path against the page', () => {
    expect(signalUrl('/otel', 'logs')).toBe(`${location.origin}/otel/v1/logs`);
  });

  it.each([undefined, '', 'ftp://c.example', 'http://[bad'])(
    'rejects %p',
    endpoint => {
      expect(signalUrl(endpoint, 'logs')).toBeUndefined();
    },
  );

  it('drops the fragment', () => {
    expect(resolveUrl('https://c.example/v1/logs#x')?.href).toBe(
      'https://c.example/v1/logs',
    );
  });

  it('detects an endpoint that already names a signal', () => {
    expect(hasSignalPath('https://c.example/v1/logs')).toBe(true);
    expect(hasSignalPath('https://c.example/otel')).toBe(false);
  });
});

describe('splitIntoChunks', () => {
  const utf8 = (s: string) => new TextEncoder().encode(s).byteLength;

  it('keeps a small event whole', () => {
    expect(splitIntoChunks('{"a":1}')).toEqual(['{"a":1}']);
  });

  it('cuts only between code points and round-trips exactly', () => {
    const json = 'a€😀'.repeat(50);
    const chunks = splitIntoChunks(json, 16);
    expect(chunks.join('')).toBe(json);
    for (const chunk of chunks) {
      expect(utf8(chunk)).toBeLessThanOrEqual(16);
      expect(chunk).not.toMatch(/\uFFFD/);
      // No chunk may start or end inside a surrogate pair.
      expect(chunk.charCodeAt(0)).not.toBeGreaterThanOrEqual(0xdc00);
    }
  });

  it('defaults to 950 KiB chunks', () => {
    const json = 'x'.repeat(MAX_CHUNK_BYTES + 1);
    expect(splitIntoChunks(json).map(c => c.length)).toEqual([
      MAX_CHUNK_BYTES,
      1,
    ]);
  });
});

describe('toOtlpJson', () => {
  it('writes the replay record layout the session player reads', () => {
    // A record as the SDK hands it to the exporter.
    const exporter = new InMemoryLogRecordExporter();
    const provider = new LoggerProvider({
      resource: resourceFromAttributes({ 'service.name': 'app' }),
      processors: [new SimpleLogRecordProcessor({ exporter })],
    });
    provider.getLogger('rum.rr-web', '1.0.0').emit({
      timestamp: [1, 5],
      observedTimestamp: [2, 0],
      body: '{"type":2}',
      attributes: {
        'session.id': 's1',
        'rr-web.event': 7,
        'rr-web.chunk': 1,
        'rr-web.total-chunks': 1,
        'rr-web.offset': 12,
        ratio: 0.5,
        ok: true,
        roles: ['a'],
        gone: undefined,
      },
    });
    const [record] = exporter.getFinishedLogRecords();
    expect(JSON.parse(toOtlpJson([record]))).toEqual({
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'app' } },
            ],
          },
          scopeLogs: [
            {
              scope: { name: 'rum.rr-web', version: '1.0.0' },
              logRecords: [
                {
                  timeUnixNano: '1000000005',
                  observedTimeUnixNano: '2000000000',
                  body: { stringValue: '{"type":2}' },
                  attributes: [
                    { key: 'session.id', value: { stringValue: 's1' } },
                    { key: 'rr-web.event', value: { intValue: '7' } },
                    { key: 'rr-web.chunk', value: { intValue: '1' } },
                    { key: 'rr-web.total-chunks', value: { intValue: '1' } },
                    { key: 'rr-web.offset', value: { intValue: '12' } },
                    { key: 'ratio', value: { doubleValue: 0.5 } },
                    { key: 'ok', value: { boolValue: true } },
                    {
                      key: 'roles',
                      value: {
                        arrayValue: { values: [{ stringValue: 'a' }] },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});

describe('MutationLimiter', () => {
  const mutation = (ids: number[], extra = {}): RrwebEvent => ({
    type: 3,
    timestamp: 0,
    data: {
      source: 0,
      attributes: ids.map(id => ({ id, attributes: {} })),
      adds: [],
      removes: [],
      texts: [],
      ...extra,
    },
  });

  it('passes events that are not attribute mutations', () => {
    const limiter = new MutationLimiter(jest.fn());
    const event = { type: 2, timestamp: 0, data: {} };
    expect(limiter.filter(event, () => null, 0)).toBe(event);
  });

  it('allows a burst of 100 per node, then about 10 a second', () => {
    const onBlocked = jest.fn();
    const limiter = new MutationLimiter(onBlocked);
    const node = document.createElement('div');
    const getNode = () => node;
    for (let i = 0; i < 100; i++) {
      expect(limiter.filter(mutation([1]), getNode, 0)).toBeDefined();
    }
    expect(onBlocked).not.toHaveBeenCalled();
    expect(limiter.filter(mutation([1]), getNode, 0)).toBeUndefined();
    expect(onBlocked).toHaveBeenCalledTimes(1);
    // 100 ms refills one token.
    expect(limiter.filter(mutation([1]), getNode, 100)).toBeDefined();
  });

  it('keeps the rest of an event whose attribute changes were dropped', () => {
    const limiter = new MutationLimiter(jest.fn());
    const node = document.createElement('div');
    for (let i = 0; i < 100; i++) limiter.filter(mutation([1]), () => node, 0);
    const kept = limiter.filter(
      mutation([1], { adds: [{ parentId: 1 }] }),
      () => node,
      0,
    );
    expect(kept?.data).toMatchObject({
      attributes: [],
      adds: [{ parentId: 1 }],
    });
  });

  it('shares one bucket across an svg', () => {
    const limiter = new MutationLimiter(jest.fn());
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const a = svg.appendChild(
      document.createElementNS('http://www.w3.org/2000/svg', 'circle'),
    );
    const b = svg.appendChild(
      document.createElementNS('http://www.w3.org/2000/svg', 'rect'),
    );
    const nodes: Record<number, Node> = { 1: a, 2: b };
    for (let i = 0; i < 50; i++) {
      limiter.filter(mutation([1, 2]), id => nodes[id], 0);
    }
    expect(limiter.filter(mutation([2]), id => nodes[id], 0)).toBeUndefined();
  });

  it('keeps mutations of nodes rrweb no longer knows', () => {
    const limiter = new MutationLimiter(jest.fn());
    for (let i = 0; i < 200; i++) {
      expect(limiter.filter(mutation([9]), () => null, 0)).toBeDefined();
    }
  });
});
