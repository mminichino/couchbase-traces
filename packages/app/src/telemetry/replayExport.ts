/**
 * Session replay export: rrweb events as OTLP log records.
 *
 * Ported from @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see
 * NOTICE. The record
 * layout (scope `rum.rr-web`, `rr-web.*` attributes) is what the session
 * player in `src/sessions.ts` reads; do not change it.
 */
import type { Attributes, HrTime } from '@opentelemetry/api';
import {
  defaultResource,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  type ReadableLogRecord,
} from '@opentelemetry/sdk-logs';

import { compress, FireAndForgetExporter, post } from './transport';

export const REPLAY_SCOPE_NAME = 'rum.rr-web';
export const ATTR_SESSION_ID = 'session.id';
export const ATTR_RRWEB_EVENT = 'rr-web.event';
export const ATTR_RRWEB_CHUNK = 'rr-web.chunk';
export const ATTR_RRWEB_TOTAL_CHUNKS = 'rr-web.total-chunks';
export const ATTR_RRWEB_OFFSET = 'rr-web.offset';

/** Largest chunk body in UTF-8 bytes (950 KiB). */
export const MAX_CHUNK_BYTES = 972_800;
const MAX_REQUEST_CHARS = 4_194_304;
const KEEPALIVE_MAX_BYTES = 32_768;

function codePointBytes(value: string, index: number): number {
  const code = value.charCodeAt(index);
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  const next = value.charCodeAt(index + 1);
  return code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff
    ? 4
    : 3;
}

/**
 * Splits a serialized event into substrings of at most `maxBytes` UTF-8
 * bytes. Cuts fall only between code points, so joining the chunks in order
 * gives back `json` exactly.
 */
export function splitIntoChunks(
  json: string,
  maxBytes = MAX_CHUNK_BYTES,
): string[] {
  if (json.length * 3 <= maxBytes) return [json];
  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;
  for (let i = 0; i < json.length; ) {
    const size = codePointBytes(json, i);
    if (bytes + size > maxBytes && i > start) {
      chunks.push(json.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += size;
    i += size === 4 ? 2 : 1;
  }
  chunks.push(json.slice(start));
  return chunks;
}

type AnyValue =
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { stringValue: string }
  | { arrayValue: { values: AnyValue[] } };

function toAnyValue(value: unknown): AnyValue {
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === 'boolean') return { boolValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toAnyValue) } };
  }
  return { stringValue: String(value) };
}

function toKeyValues(attributes: Record<string, unknown>) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: toAnyValue(value) }));
}

function toNanoseconds([seconds, nanoseconds]: HrTime): string {
  return (BigInt(seconds) * 1_000_000_000n + BigInt(nanoseconds)).toString();
}

/** One OTLP/JSON logs request; all records share one resource and scope. */
export function toOtlpJson(records: ReadableLogRecord[]): string {
  const [{ resource, instrumentationScope }] = records;
  return JSON.stringify({
    resourceLogs: [
      {
        resource: { attributes: toKeyValues(resource.attributes) },
        scopeLogs: [
          {
            scope: {
              name: instrumentationScope.name,
              version: instrumentationScope.version,
            },
            logRecords: records.map(record => ({
              timeUnixNano: toNanoseconds(record.hrTime),
              observedTimeUnixNano: toNanoseconds(record.hrTimeObserved),
              body: toAnyValue(record.body),
              attributes: toKeyValues(record.attributes),
            })),
          },
        ],
      },
    ],
  });
}

function bodyLength(record: ReadableLogRecord): number {
  return typeof record.body === 'string' ? record.body.length : 0;
}

function* bySize(records: ReadableLogRecord[]) {
  let group: ReadableLogRecord[] | undefined;
  let chars = 0;
  for (const record of records) {
    const size = bodyLength(record);
    if (group !== undefined && chars + size <= MAX_REQUEST_CHARS) {
      group.push(record);
      chars += size;
    } else {
      if (group !== undefined) yield group;
      group = [record];
      chars = size;
    }
  }
  if (group !== undefined) yield group;
}

function halves(batch: ReadableLogRecord[]) {
  if (batch.length < 2) return undefined;
  const mid = Math.ceil(batch.length / 2);
  return [batch.slice(0, mid), batch.slice(mid)] as const;
}

const encode = (batch: ReadableLogRecord[]) =>
  compress(new TextEncoder().encode(toOtlpJson(batch)));

async function keepaliveBodies(
  batch: ReadableLogRecord[],
): Promise<Uint8Array[]> {
  const body = await encode(batch);
  const split =
    body.byteLength > KEEPALIVE_MAX_BYTES ? halves(batch) : undefined;
  if (split === undefined) return [body];
  return [
    ...(await keepaliveBodies(split[0])),
    ...(await keepaliveBodies(split[1])),
  ];
}

/** Sends replay records as gzip-compressed OTLP/JSON with bounded bodies. */
export class ReplayExporter extends FireAndForgetExporter<ReadableLogRecord> {
  #keepaliveBytes = 0;

  constructor(url: string, apiKey: string | undefined) {
    super('replay export', url, apiKey);
  }

  protected async send(records: ReadableLogRecord[]): Promise<void> {
    for (const batch of bySize(records)) {
      if (document.visibilityState === 'hidden') {
        const bodies = await keepaliveBodies(batch);
        await Promise.all(bodies.map(body => this.#post(body, true)));
      } else {
        await this.#post(await encode(batch), false);
      }
    }
  }

  async #post(body: Uint8Array, hidden: boolean): Promise<void> {
    const withinShare =
      hidden && this.#keepaliveBytes + body.byteLength <= KEEPALIVE_MAX_BYTES;
    if (withinShare) this.#keepaliveBytes += body.byteLength;
    try {
      const response = await post(this.url, this.headers, body, withinShare);
      if (!response.ok) this.warn(`HTTP ${String(response.status)}`);
    } catch (error) {
      this.warn(error);
    } finally {
      if (withinShare) this.#keepaliveBytes -= body.byteLength;
    }
  }
}

/**
 * The provider that batches replay records. It carries the RUM resource
 * attributes, so replay has the same `service.name` the session list finds
 * it by.
 */
export function createReplayProvider(
  url: string,
  apiKey: string | undefined,
  resourceAttributes: Attributes,
): LoggerProvider {
  return new LoggerProvider({
    resource: defaultResource().merge(
      resourceFromAttributes(resourceAttributes),
    ),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new ReplayExporter(url, apiKey),
        scheduledDelayMillis: 5_000,
      }),
    ],
  });
}
