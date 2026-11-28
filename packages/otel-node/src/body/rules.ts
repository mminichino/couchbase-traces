import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';

import { diag } from '@opentelemetry/api';

import { warnOnce } from '../env';
import {
  ATTR_HTTP_REQUEST_BODY_CONTENT,
  ATTR_HTTP_REQUEST_BODY_SIZE,
  ATTR_HTTP_RESPONSE_BODY_CONTENT,
  ATTR_HTTP_RESPONSE_BODY_SIZE,
} from '../semconv';

/** Bytes kept per body and direction. */
export const MAX_BYTES = 8192;

/** Key substrings whose values are redacted, matched case-insensitively. */
export const REDACT_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'api-key',
  'authorization',
  'cookie',
  'session',
];
const REDACTED = '[REDACTED]';
const FORM = 'application/x-www-form-urlencoded';

export type HeaderValue = string | number | string[] | undefined | null;

export type BodyMeta = {
  contentType: HeaderValue;
  contentEncoding: HeaderValue;
  contentLength: HeaderValue;
  /** Whether the body was sent or received to its end. */
  complete: boolean;
};

/** Reports a failure in capture code: one warning per thread, then debug lines. */
export function reportFailure(err: unknown): void {
  warnOnce('capture-failed', 'HTTP body capture failed and was skipped', err);
  diag.debug('otel-node: HTTP body capture failed', err);
}

/** HEAD requests and 1xx, 204 and 304 responses carry no body on the wire. */
export function responseHasNoBody(
  method: string | undefined,
  status: number | undefined,
): boolean {
  return (
    method?.toUpperCase() === 'HEAD' ||
    status === 204 ||
    status === 304 ||
    (status ?? 200) < 200
  );
}

/**
 * Collects a flat `[name, value, name, value]` header list, as undici and
 * `writeHead` pass them, into lowercased names; repeats join with `, `.
 */
export function headerMap(headers: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const list = Array.isArray(headers) ? headers : [];
  for (let i = 0; i + 1 < list.length; i += 2) {
    const name = String(list[i]).toLowerCase();
    const value = String(list[i + 1]);
    const previous = map.get(name);
    map.set(name, previous === undefined ? value : `${previous}, ${value}`);
  }
  return map;
}

function headerString(value: HeaderValue): string {
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

function isTextualUtf8(contentType: HeaderValue): boolean {
  const [essence = '', ...params] = headerString(contentType)
    .toLowerCase()
    .split(';');
  const type = essence.trim();
  const charset = params.map(p => p.trim()).find(p => p.startsWith('charset='));
  if (type === '' || type.startsWith('multipart/')) return false;
  if (charset !== undefined) return /^charset="?utf-?8"?$/.test(charset);
  return (
    type.startsWith('text/') ||
    /[/+](json|xml|yaml)$/.test(type) ||
    type === FORM
  );
}

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEYS.some(k => lower.includes(k));
}

function skipSpace(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text.charAt(i))) i++;
  return i;
}

/** Index just past the string token at `from`, or -1 when the cap cut it. */
function endOfString(text: string, from: number): number {
  for (let i = from + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '"') return i + 1;
  }
  return -1;
}

/** Index just past the JSON value at `from`; the text length when cut. */
function endOfValue(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === '"') {
      const end = endOfString(text, i);
      if (end === -1) return text.length;
      if (depth === 0) return end;
      i = end - 1;
    } else if (c === '{' || c === '[') {
      depth++;
    } else if (c === '}' || c === ']') {
      if (depth === 0) return i;
      if (--depth === 0) return i + 1;
    } else if (depth === 0 && (c === ',' || /\s/.test(c))) {
      return i;
    }
  }
  return text.length;
}

const ESCAPES: Record<string, string> = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

function unescapeJson(token: string): string {
  return token
    .slice(1, -1)
    .replace(
      /\\(?:u([0-9a-fA-F]{4})|([^]))/g,
      (_match, hex: string | undefined, char: string | undefined) =>
        hex !== undefined
          ? String.fromCharCode(parseInt(hex, 16))
          : (ESCAPES[char ?? ''] ?? char ?? ''),
    );
}

/**
 * Replaces the values of sensitive keys with `[REDACTED]`. Works on text
 * the 8 KiB cap may have cut, so it scans tokens instead of parsing; JSON
 * encoded inside a string value is redacted one level deep.
 */
export function redactJson(text: string, nested = false): string {
  let out = '';
  let copied = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '"') {
      i++;
      continue;
    }
    const end = endOfString(text, i);
    if (end === -1) break;
    const token = text.slice(i, end);
    const colon = skipSpace(text, end);
    if (text[colon] !== ':') {
      if (!nested && token.includes('\\"')) {
        const inner = unescapeJson(token);
        const redacted = redactJson(inner, true);
        if (redacted !== inner) {
          out += text.slice(copied, i) + JSON.stringify(redacted);
          copied = end;
        }
      }
      i = end;
      continue;
    }
    const start = skipSpace(text, colon + 1);
    if (start === text.length || !isSensitive(unescapeJson(token))) {
      i = end;
      continue;
    }
    out += `${text.slice(copied, start)}"${REDACTED}"`;
    i = copied = endOfValue(text, start);
  }
  return out + text.slice(copied);
}

function formKey(raw: string): string {
  return raw
    .replaceAll('+', ' ')
    .replace(/%([0-9a-fA-F]{2})/g, (_match, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

export function redactForm(text: string): string {
  return text
    .split('&')
    .map(pair => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      return isSensitive(formKey(key)) ? `${key}=${REDACTED}` : pair;
    })
    .join('&');
}

/** Copies the first {@link MAX_BYTES} bytes of one body and counts every byte. */
export class BodyCapture {
  /** Bytes seen, including those past the cap. */
  seen = 0;
  #kept = 0;
  #buffer: Buffer | undefined;

  /** Adds a `Buffer`, `Uint8Array` or string chunk; other values are ignored. */
  add(chunk: unknown, encoding?: unknown): void {
    if (typeof chunk === 'string') {
      const enc =
        typeof encoding === 'string' && Buffer.isEncoding(encoding)
          ? encoding
          : 'utf8';
      this.seen += Buffer.byteLength(chunk, enc);
      if (this.#kept >= MAX_BYTES) return;
      // Hex and base64 cannot be cut at an arbitrary character.
      const head = /^(hex|base64(url)?)$/i.test(enc)
        ? chunk
        : chunk.slice(0, MAX_BYTES - this.#kept + 1);
      this.#copy(Buffer.from(head, enc));
    } else if (chunk instanceof Uint8Array) {
      this.seen += chunk.byteLength;
      this.#copy(chunk);
    }
  }

  #copy(bytes: Uint8Array): void {
    const n = Math.min(MAX_BYTES - this.#kept, bytes.byteLength);
    if (n <= 0) return;
    const need = this.#kept + n;
    if (this.#buffer === undefined || this.#buffer.length < need) {
      const size = Math.max(need, 2 * (this.#buffer?.length ?? 0));
      const grown = Buffer.alloc(Math.min(size, MAX_BYTES));
      this.#buffer?.copy(grown, 0, 0, this.#kept);
      this.#buffer = grown;
    }
    this.#buffer.set(bytes.subarray(0, n), this.#kept);
    this.#kept = need;
  }

  /** The size and content attributes of this body; empty for an empty body. */
  attributes(
    direction: 'request' | 'response',
    meta: BodyMeta,
  ): Record<string, string | number> {
    const length = headerString(meta.contentLength);
    const size =
      /^\d+$/.test(length) && (meta.complete || this.seen === 0)
        ? Number(length)
        : this.seen;
    if (size === 0) return {};
    const request = direction === 'request';
    const attributes: Record<string, string | number> = {
      [request ? ATTR_HTTP_REQUEST_BODY_SIZE : ATTR_HTTP_RESPONSE_BODY_SIZE]:
        size,
    };
    const coding = headerString(meta.contentEncoding).toLowerCase();
    if (
      this.#buffer === undefined ||
      (coding !== '' && coding !== 'identity')
    ) {
      return attributes;
    }
    if (!isTextualUtf8(meta.contentType)) return attributes;
    let text = new TextDecoder().decode(this.#buffer.subarray(0, this.#kept), {
      stream: this.seen > this.#kept,
    });
    if (headerString(meta.contentType).toLowerCase().startsWith(FORM)) {
      text = redactForm(text);
    }
    attributes[
      request ? ATTR_HTTP_REQUEST_BODY_CONTENT : ATTR_HTTP_RESPONSE_BODY_CONTENT
    ] = redactJson(text);
    return attributes;
  }
}
