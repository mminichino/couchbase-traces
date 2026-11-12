import { CouchbaseQueryError, deserialize } from './errors';
import { encodeRow } from './inferMeta';
import type {
  ColumnMeta,
  CouchbaseFormat,
  CouchbaseResultSet,
  Frame,
  ResponseJSON,
  Row,
  Statistics,
} from './types';

type Entry = { meta: ColumnMeta[]; row: Record<string, unknown> };

type Collected = {
  meta: ColumnMeta[];
  entries: Entry[];
  rows: number;
  statistics: Statistics;
};

const EMPTY_STATS: Statistics = { elapsed: 0, rows_read: 0, bytes_read: 0 };

function formatPlain(v: unknown): string {
  if (v === null || v === undefined) return '\\N';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function formatCsv(v: unknown): string {
  const s = formatPlain(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowValues(
  meta: ColumnMeta[],
  row: Record<string, unknown>,
): unknown[] {
  const encoded = encodeRow(meta, row);
  return meta.map(m => encoded[m.name]);
}

/** Text of one row in a line-oriented format, without the line terminator. */
function rowText(
  format: CouchbaseFormat,
  meta: ColumnMeta[],
  row: Record<string, unknown>,
): string {
  switch (format) {
    case 'TabSeparatedRaw':
      return rowValues(meta, row).map(formatPlain).join('\t');
    case 'CSV':
      return rowValues(meta, row).map(formatCsv).join(',');
    case 'JSONCompactEachRowWithNamesAndTypes':
      return JSON.stringify(rowValues(meta, row));
    default:
      return JSON.stringify(encodeRow(meta, row));
  }
}

function headerRows(meta: ColumnMeta[]): Row[] {
  const names = meta.map(m => m.name);
  const types = meta.map(m => m.type);
  return [
    makeRow(JSON.stringify(names), names),
    makeRow(JSON.stringify(types), types),
  ];
}

/** Rows take whatever type the caller names, as ClickHouse result sets do. */
function callerTyped(value: unknown): any {
  return value;
}

function makeRow(text: string, value?: unknown): Row {
  return {
    text,
    json<T>(): T {
      return callerTyped(value !== undefined ? value : JSON.parse(text));
    },
  };
}

class FramesResultSet<F extends CouchbaseFormat>
  implements CouchbaseResultSet<F>
{
  private consumer: 'buffer' | 'stream' | null = null;
  private iterator: AsyncIterator<Frame> | null = null;
  private closed = false;
  private collected: Promise<Collected> | null = null;

  constructor(
    private readonly frames: AsyncIterable<Frame>,
    private readonly format: CouchbaseFormat,
    readonly query_id: string,
    private readonly opts: { maxBufferedBytes: number; statement?: string },
  ) {}

  private get statement(): string {
    return this.opts.statement ?? '';
  }

  private error(
    code: 'INTERNAL' | 'RESULT_TOO_LARGE' | 'CANCELED',
    msg: string,
  ) {
    return new CouchbaseQueryError(code, msg, this.statement);
  }

  private claim(kind: 'buffer' | 'stream') {
    if (
      this.consumer != null &&
      !(this.consumer === 'buffer' && kind === 'buffer')
    ) {
      throw this.error('INTERNAL', 'The result set has already been consumed');
    }
    this.consumer = kind;
  }

  private async nextFrame(): Promise<Frame | null> {
    if (this.closed) throw this.error('CANCELED', 'The result set was closed');
    if (this.iterator == null) {
      this.iterator = this.frames[Symbol.asyncIterator]();
    }
    const { value, done } = await this.iterator.next();
    if (this.closed) throw this.error('CANCELED', 'The result set was closed');
    return done ? null : value;
  }

  private release() {
    const it = this.iterator;
    if (it?.return) {
      void Promise.resolve(it.return()).catch(() => {});
    }
  }

  private collect(): Promise<Collected> {
    if (this.collected == null) {
      this.collected = this.doCollect();
    }
    return this.collected;
  }

  private async doCollect(): Promise<Collected> {
    let meta: ColumnMeta[] = [];
    const entries: Entry[] = [];
    let bytes = 0;
    for (;;) {
      const frame = await this.nextFrame();
      if (frame == null) {
        throw this.error('INTERNAL', 'Query stream ended unexpectedly');
      }
      switch (frame.type) {
        case 'meta':
          meta = frame.meta;
          break;
        case 'rows':
          for (const row of frame.rows) {
            bytes += JSON.stringify(row).length;
            if (bytes > this.opts.maxBufferedBytes) {
              this.release();
              throw this.error(
                'RESULT_TOO_LARGE',
                `Result exceeds ${this.opts.maxBufferedBytes} bytes; narrow the query or add a LIMIT`,
              );
            }
            entries.push({ meta, row });
          }
          break;
        case 'end':
          return {
            meta,
            entries,
            rows: frame.rows,
            statistics: frame.statistics ?? EMPTY_STATS,
          };
        case 'error':
          throw deserialize(frame.error, this.statement);
      }
    }
  }

  async json<T = unknown>(): Promise<F extends 'JSON' ? ResponseJSON<T> : T[]> {
    this.claim('buffer');
    if (this.format !== 'JSON' && this.format !== 'JSONEachRow') {
      throw this.error(
        'INTERNAL',
        `json() is not supported for format ${this.format}`,
      );
    }
    const c = await this.collect();
    if (this.format === 'JSON') {
      // JSON output describes every row with the final meta.
      const data: T[] = callerTyped(
        c.entries.map(e => encodeRow(c.meta, e.row)),
      );
      const out: ResponseJSON<T> = {
        meta: c.meta,
        data,
        rows: c.rows,
        statistics: c.statistics,
      };
      return callerTyped(out);
    }
    return callerTyped(c.entries.map(e => encodeRow(e.meta, e.row)));
  }

  async text(): Promise<string> {
    this.claim('buffer');
    const c = await this.collect();
    if (this.format === 'JSON') {
      return JSON.stringify({
        meta: c.meta,
        data: c.entries.map(e => encodeRow(c.meta, e.row)),
        rows: c.rows,
        statistics: c.statistics,
      });
    }
    const lines: string[] = [];
    if (this.format === 'JSONCompactEachRowWithNamesAndTypes') {
      const headerMeta = c.entries[0]?.meta ?? c.meta;
      lines.push(...headerRows(headerMeta).map(r => r.text));
    }
    for (const e of c.entries) {
      lines.push(rowText(this.format, e.meta, e.row));
    }
    return lines.map(l => `${l}\n`).join('');
  }

  stream(): ReadableStream<Row[]> {
    if (this.format === 'JSON') {
      throw this.error('INTERNAL', 'stream() is not supported for format JSON');
    }
    this.claim('stream');
    let meta: ColumnMeta[] = [];
    let headerSent = this.format !== 'JSONCompactEachRowWithNamesAndTypes';
    const format = this.format;
    return new ReadableStream<Row[]>({
      pull: async controller => {
        try {
          for (;;) {
            const frame = await this.nextFrame();
            if (frame == null) {
              throw this.error('INTERNAL', 'Query stream ended unexpectedly');
            }
            if (frame.type === 'meta') {
              meta = frame.meta;
              continue;
            }
            if (frame.type === 'error') {
              throw deserialize(frame.error, this.statement);
            }
            if (frame.type === 'end') {
              if (!headerSent) {
                headerSent = true;
                controller.enqueue(headerRows(meta));
              }
              controller.close();
              return;
            }
            const batch: Row[] = [];
            if (!headerSent) {
              headerSent = true;
              batch.push(...headerRows(meta));
            }
            for (const row of frame.rows) {
              const text = rowText(format, meta, row);
              batch.push(
                format === 'JSONEachRow'
                  ? makeRow(text, encodeRow(meta, row))
                  : format === 'JSONCompactEachRowWithNamesAndTypes'
                    ? makeRow(text)
                    : {
                        text,
                        json: () => {
                          throw this.error(
                            'INTERNAL',
                            `Row.json() is not supported for format ${format}`,
                          );
                        },
                      },
              );
            }
            controller.enqueue(batch);
            return;
          }
        } catch (e) {
          controller.error(e);
        }
      },
      cancel: () => {
        this.close();
      },
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.release();
  }
}

export function fromFrames<F extends CouchbaseFormat>(
  frames: AsyncIterable<Frame>,
  format: F,
  queryId: string,
  opts: { maxBufferedBytes: number; statement?: string },
): CouchbaseResultSet<F>;
/** For callers whose format is only known at run time; they name `F`. */
export function fromFrames<F extends CouchbaseFormat>(
  frames: AsyncIterable<Frame>,
  format: CouchbaseFormat,
  queryId: string,
  opts: { maxBufferedBytes: number; statement?: string },
): CouchbaseResultSet<F>;
export function fromFrames<F extends CouchbaseFormat>(
  frames: AsyncIterable<Frame>,
  format: CouchbaseFormat,
  queryId: string,
  opts: { maxBufferedBytes: number; statement?: string },
): CouchbaseResultSet<F> {
  return new FramesResultSet<F>(frames, format, queryId, opts);
}

export const DEFAULT_MAX_BUFFERED_BYTES = 268435456;
