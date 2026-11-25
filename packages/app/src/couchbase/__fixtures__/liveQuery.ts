/**
 * Query REST client for the app's live-cluster tests (port/couchbase-test).
 * HTTP rather than the Couchbase SDK: the SDK is a native addon and stays out
 * of packages/app (AGENTS.md rule 3).
 */
import http from 'node:http';
import { z } from 'zod';

export const LIVE = process.env.CBT_TEST_COUCHBASE_REQUIRED === '1';
const QUERY_URL = `http://127.0.0.1:${8093 + Number(process.env.CBT_TEST_COUCHBASE_PORT_OFFSET || 0)}/query/service`;
const AUTH = Buffer.from(
  `${process.env.CBT_TEST_COUCHBASE_ADMIN_USER || 'Administrator'}:${process.env.CBT_TEST_COUCHBASE_ADMIN_PASSWORD || 'cbt-test-admin'}`,
).toString('base64');

const QueryResponse = z.object({
  status: z.string().optional(),
  errors: z.unknown(),
  results: z.array(z.unknown()).optional(),
});

export async function liveQuery(
  statement: string,
  params: Record<string, unknown> = {},
): Promise<any[]> {
  // node:http rather than fetch: the jsdom test environment hides fetch.
  const raw = await new Promise<string>((resolve, reject) => {
    const req = http.request(
      QUERY_URL,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${AUTH}`,
          'content-type': 'application/json',
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.end(
      JSON.stringify({
        statement,
        ...Object.fromEntries(
          Object.entries(params).map(([k, v]) => [`$${k}`, v]),
        ),
      }),
    );
  });
  const body = QueryResponse.parse(JSON.parse(raw));
  if (body.status !== 'success') {
    throw new Error(`query failed: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.results ?? [];
}
