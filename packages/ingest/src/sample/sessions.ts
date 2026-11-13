import { attr, logsBody, nsFromMs, str, tracesBody } from './otlp';
import type { Rng } from './rng';
import type { Topology } from './topology';

const BROWSER = 'browser';

export function sessionHour(
  t: Topology,
  rng: Rng,
  hourStartMs: number,
): { signal: 'logs' | 'traces'; body: object }[] {
  const sessionId = `sample-session-${rng.hex(4)}`;
  const rumId = sessionId;
  const baseMs = hourStartMs + rng.int(0, 30 * 60_000);
  const resource = [
    attr('service.name', str(BROWSER)),
    attr('rum.sessionId', str(rumId)),
    attr('deployment.environment.name', str('development')),
  ];

  const rrEvents = [
    {
      type: 4,
      data: { href: 'http://localhost:8080/', width: 1280, height: 720 },
    },
    {
      type: 2,
      data: {
        node: {
          type: 0,
          id: 1,
          childNodes: [
            {
              type: 2,
              tagName: 'html',
              attributes: {},
              id: 2,
              childNodes: [],
            },
          ],
        },
      },
    },
    { type: 3, data: { source: 1, x: 120, y: 40 } },
  ];

  const logRecords = rrEvents.map((event, i) => ({
    timeUnixNano: nsFromMs(baseMs + i * 500),
    severityText: 'INFO',
    severityNumber: 9,
    body: {
      stringValue: JSON.stringify({ ...event, timestamp: baseMs + i * 500 }),
    },
    attributes: [
      attr('rr-web.event', str(String(i + 1))),
      attr('rr-web.offset', str(String(i + 1))),
      attr('rr-web.chunk', str('1')),
      attr('rr-web.total-chunks', str('1')),
      attr('session.id', str(sessionId)),
    ],
  }));

  const traceId = rng.hex(16);
  const spanId = rng.hex(8);
  const span = {
    traceId,
    spanId,
    name: 'documentFetch',
    kind: 1,
    startTimeUnixNano: nsFromMs(baseMs),
    endTimeUnixNano: nsFromMs(baseMs + 1200),
    attributes: [
      attr('rum.sessionId', str(rumId)),
      attr('session.id', str(sessionId)),
      attr('url.full', str('http://localhost:8080/')),
      attr('browser.document.url.full', str('http://localhost:8080/')),
    ],
  };

  return [
    { signal: 'logs', body: logsBody(logRecords, resource) },
    {
      signal: 'traces',
      body: tracesBody(
        [span],
        [attr('service.name', str(BROWSER)), attr('rum.sessionId', str(rumId))],
      ),
    },
  ];
}

/** Lightweight live session tick (logs only). */
export function sessionTick(
  rng: Rng,
  nowMs: number,
): { signal: 'logs'; body: object } {
  const sessionId = `live-${rng.hex(3)}`;
  return {
    signal: 'logs',
    body: logsBody(
      [
        {
          timeUnixNano: nsFromMs(nowMs),
          severityText: 'INFO',
          severityNumber: 9,
          body: { stringValue: JSON.stringify({ type: 3, data: {} }) },
          attributes: [
            attr('rr-web.event', str('1')),
            attr('rr-web.offset', str('1')),
            attr('rr-web.chunk', str('1')),
            attr('rr-web.total-chunks', str('1')),
            attr('session.id', str(sessionId)),
          ],
        },
      ],
      [
        attr('service.name', str(BROWSER)),
        attr('rum.sessionId', str(sessionId)),
      ],
    ),
  };
}
