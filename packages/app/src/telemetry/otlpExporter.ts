/**
 * OTLP/JSON exporter for browser spans and log records.
 *
 * Ported from @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see
 * NOTICE.
 */
import type { ISerializer } from '@opentelemetry/otlp-transformer';

import { compress, FireAndForgetExporter, post } from './transport';

// Over this, a batch sent while the page is hidden is split in halves.
const KEEPALIVE_PART_BYTES = 16_384;

/**
 * Sends gzip-compressed OTLP/JSON bodies with `fetch`.
 *
 * The upstream browser transport sets `keepalive` on every request, which
 * Chromium counts against the page's 64 KiB budget until the response is
 * read; a burst of small exports then leaves no room for the final flush.
 * This exporter uses keepalive only while the page is hidden, and splits a
 * batch over 16 KiB compressed so the parts that fit still arrive. Failed
 * exports are not retried.
 */
export class OtlpJsonExporter<T> extends FireAndForgetExporter<T> {
  readonly #serializer: ISerializer<T[], unknown>;

  constructor(
    url: string,
    apiKey: string | undefined,
    serializer: ISerializer<T[], unknown>,
  ) {
    super('export', url, apiKey);
    this.#serializer = serializer;
  }

  protected async send(items: T[]): Promise<void> {
    const body = await this.#compress(items);
    if (body === undefined) return;
    const hidden = document.visibilityState === 'hidden';
    const bodies = hidden ? await this.#split(items, body) : [body];
    await Promise.all(bodies.map(part => this.#post(part, hidden)));
  }

  async #compress(items: T[]): Promise<Uint8Array | undefined> {
    const json = this.#serializer.serializeRequest(items);
    return json === undefined ? undefined : compress(json);
  }

  async #split(items: T[], body: Uint8Array): Promise<Uint8Array[]> {
    if (body.byteLength <= KEEPALIVE_PART_BYTES || items.length < 2) {
      return [body];
    }
    const half = Math.ceil(items.length / 2);
    const bodies: Uint8Array[] = [];
    for (const part of [items.slice(0, half), items.slice(half)]) {
      const partBody = await this.#compress(part);
      if (partBody !== undefined) {
        bodies.push(...(await this.#split(part, partBody)));
      }
    }
    return bodies;
  }

  async #post(body: Uint8Array, hidden: boolean): Promise<void> {
    try {
      const response = await post(this.url, this.headers, body, hidden);
      if (!response.ok) this.warn(`HTTP ${String(response.status)}`);
    } catch (error) {
      this.warn(error);
    }
  }
}
