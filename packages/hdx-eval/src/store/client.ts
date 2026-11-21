import type { ResponseJSON } from '@couchbase-traces/common-utils/dist/query';
import { CodedQueryError } from '@couchbase-traces/common-utils/dist/query';
import ms from 'ms';

export type EvalStoreConfig = {
  url: string;
  username?: string;
  password?: string;
};

type QueryParams = {
  query: string;
  query_params?: Record<string, unknown>;
  format?: 'JSON' | 'JSONEachRow';
};

export type EvalQueryResultSet = {
  json<T = unknown>(): Promise<T[] | ResponseJSON<T>>;
};

export type EvalStoreClient = {
  query(params: QueryParams): Promise<EvalQueryResultSet>;
  command(params: { query: string }): Promise<void>;
  insert(params: {
    table: string;
    values: Record<string, unknown>[];
    format: 'JSONEachRow';
  }): Promise<void>;
  close(): Promise<void>;
};

function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function parseEvalStoreErrorBody(text: string): Error {
  const match = text.match(
    /Code: (?<code>\d+)\. DB::Exception: (?<message>[^\n]+)\. \((?<type>[A-Z0-9_]+)\)/,
  );
  if (match?.groups) {
    return new CodedQueryError({
      message: match.groups.message,
      code: match.groups.code,
      type: match.groups.type,
    });
  }
  return new Error(text.trim() || 'ClickHouse request failed');
}

export function createEvalStoreClient(
  cfg: EvalStoreConfig,
  application = 'hdx-eval',
): EvalStoreClient {
  const baseUrl = new URL(cfg.url);
  const username = cfg.username ?? 'default';
  const password = cfg.password ?? '';
  const timeoutMs = ms('2m');

  async function request(
    query: string,
    options?: {
      body?: string;
      query_params?: Record<string, unknown>;
      format?: 'JSON' | 'JSONEachRow';
    },
  ): Promise<string> {
    const url = new URL(baseUrl.href);
    const search = new URLSearchParams();
    search.set('query', query);
    if (options?.format) {
      search.set('default_format', options.format);
    }
    if (options?.query_params) {
      for (const [key, value] of Object.entries(options.query_params)) {
        search.set(`param_${key}`, String(value));
      }
    }
    search.set('date_time_input_format', 'best_effort');
    search.set('date_time_output_format', 'iso');
    search.set('max_execution_time', String(timeoutMs / 1000));
    url.search = search.toString();

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authHeader(username, password),
          'User-Agent': application,
          ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options?.body,
        signal: ac.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw parseEvalStoreErrorBody(text);
      }
      return text;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Timeout error.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async query(params) {
      const format = params.format ?? 'JSON';
      const text = await request(params.query, {
        query_params: params.query_params,
        format,
      });
      return {
        async json<T>() {
          if (format === 'JSON') {
            return JSON.parse(text) as ResponseJSON<T>;
          }
          const lines = text
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);
          return lines.map(line => JSON.parse(line) as T);
        },
      };
    },
    async command(params) {
      await request(params.query);
    },
    async insert({ table, values, format }) {
      if (format !== 'JSONEachRow') {
        throw new Error(`Unsupported insert format: ${format}`);
      }
      const body = `${values.map(v => JSON.stringify(v)).join('\n')}\n`;
      const query = `INSERT INTO ${table} FORMAT JSONEachRow`;
      await request(query, { body });
    },
    async close() {},
  };
}

export function defaultEvalStoreUrl(): string {
  if (process.env.CBT_EVAL_CH_URL) return process.env.CBT_EVAL_CH_URL;
  if (process.env.CBT_DEV_CH_HTTP_PORT) {
    return `http://localhost:${process.env.CBT_DEV_CH_HTTP_PORT}`;
  }
  return 'http://localhost:8123';
}
