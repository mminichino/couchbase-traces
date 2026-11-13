#!/usr/bin/env node
/**
 * Seeded OTLP dataset for query parity: 10,000 logs, 5,000 spans, and
 * 2,000 gauge points, posted through the collector into both stores.
 * Event times sit in a closed window an hour ago so the TTL does not drop them.
 */
const LOGS = 10_000;
const SPANS = 5_000;
const METRICS = 2_000;
const SESSIONS = 200;
const SERVICES = ['api', 'web', 'worker'];
const REGIONS = ['us', 'eu'];

const fromSec = Math.floor(Date.now() / 1000) - 7200;
const toSec = fromSec + 3600;

function ns(sec, frac = 0) {
  return (BigInt(sec) * 1_000_000_000n + BigInt(frac)).toString();
}

function hex(n, width) {
  return n.toString(16).padStart(width, '0');
}

function logRecord(i) {
  const sec = fromSec + (i % 3600);
  const service = SERVICES[i % SERVICES.length];
  return {
    service,
    record: {
      timeUnixNano: ns(sec, i),
      severityText: i % 5 === 0 ? 'WARN' : 'INFO',
      severityNumber: 5,
      body: { stringValue: `log-${String(i).padStart(6, '0')}` },
      traceId: hex(i + 1, 32),
      spanId: hex(i + 1, 16),
      attributes: [
        { key: 'host', value: { stringValue: `h${i % 10}` } },
        { key: 'region', value: { stringValue: REGIONS[i % REGIONS.length] } },
      ],
    },
  };
}

function spanRecord(i) {
  const sec = fromSec + (i % 3600);
  const start = ns(sec, i);
  return {
    traceId: hex(i + 1, 32),
    spanId: hex(10_000_000 + i, 16),
    name: `span-${i}`,
    kind: 1,
    startTimeUnixNano: start,
    endTimeUnixNano: ns(sec, i + 1_000_000),
    attributes: [
      { key: 'host', value: { stringValue: `h${i % 10}` } },
    ],
  };
}

function gaugePoint(i) {
  return {
    timeUnixNano: ns(fromSec + (i % 3600), i),
    asDouble: (i % 100) + 0.5,
    attributes: [{ key: 'host', value: { stringValue: `h${i % 10}` } }],
  };
}

function resource(service) {
  return {
    attributes: [{ key: 'service.name', value: { stringValue: service } }],
  };
}

async function post(port, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} ${res.status} ${await res.text()}`);
  }
}

async function postLogs(port) {
  const byService = new Map();
  for (let i = 0; i < LOGS; i++) {
    const row = logRecord(i);
    const list = byService.get(row.service) ?? [];
    list.push(row.record);
    byService.set(row.service, list);
  }
  for (const [service, records] of byService) {
    for (let i = 0; i < records.length; i += 250) {
      await post(port, '/v1/logs', {
        resourceLogs: [
          {
            resource: resource(service),
            scopeLogs: [{ logRecords: records.slice(i, i + 250) }],
          },
        ],
      });
    }
  }
}

async function postSpans(port) {
  const spans = [];
  for (let i = 0; i < SPANS; i++) spans.push(spanRecord(i));
  for (let i = 0; i < spans.length; i += 250) {
    await post(port, '/v1/traces', {
      resourceSpans: [
        {
          resource: resource('api'),
          scopeSpans: [{ spans: spans.slice(i, i + 250) }],
        },
      ],
    });
  }
}

async function postMetrics(port) {
  const points = [];
  for (let i = 0; i < METRICS; i++) points.push(gaugePoint(i));
  for (let i = 0; i < points.length; i += 200) {
    await post(port, '/v1/metrics', {
      resourceMetrics: [
        {
          resource: resource('api'),
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'parity.gauge',
                  gauge: { dataPoints: points.slice(i, i + 200) },
                },
              ],
            },
          ],
        },
      ],
    });
  }
}

/** rrweb-shaped logs that the collector routes into hyperdx_sessions. */
function sessionRecord(i) {
  const sessionId = `parity-session-${i % 20}`;
  const sec = fromSec + (i % 3600);
  return {
    timeUnixNano: ns(sec, i),
    severityText: 'INFO',
    severityNumber: 9,
    body: {
      stringValue: JSON.stringify({ type: i % 3 === 0 ? 2 : 3, data: { i } }),
    },
    attributes: [
      { key: 'rr-web.event', value: { stringValue: String((i % 50) + 1) } },
      { key: 'rr-web.offset', value: { stringValue: String(i + 1) } },
      { key: 'rr-web.chunk', value: { stringValue: '1' } },
      { key: 'rr-web.total-chunks', value: { stringValue: '1' } },
      { key: 'session.id', value: { stringValue: sessionId } },
    ],
  };
}

async function postSessions(port) {
  const records = [];
  for (let i = 0; i < SESSIONS; i++) records.push(sessionRecord(i));
  for (let i = 0; i < records.length; i += 50) {
    await post(port, '/v1/logs', {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'browser' } },
              {
                key: 'rum.sessionId',
                value: { stringValue: `parity-session-${i % 20}` },
              },
            ],
          },
          scopeLogs: [{ logRecords: records.slice(i, i + 50) }],
        },
      ],
    });
  }
}

export const window = {
  from: new Date(fromSec * 1000).toISOString(),
  to: new Date(toSec * 1000).toISOString(),
  fromSec,
  toSec,
  logs: LOGS,
  spans: SPANS,
  metrics: METRICS,
  sessions: SESSIONS,
};

const isMain = process.argv[1] && process.argv[1].endsWith('dataset.mjs');
if (isMain) {
  const port = process.env.OTLP_PORT;
  if (!port) {
    console.error('OTLP_PORT is required');
    process.exit(1);
  }
  await postLogs(port);
  await postSpans(port);
  await postMetrics(port);
  await postSessions(port);
  process.stdout.write(`${JSON.stringify(window)}\n`);
}
