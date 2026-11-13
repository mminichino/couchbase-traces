import express from 'express';
import request from 'supertest';

import { PROMQL_UNSUPPORTED, rejectPromqlBody } from '@/utils/rejectPromql';

function app() {
  const server = express();
  server.use(express.json());
  server.post('/write', rejectPromqlBody, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return server;
}

describe('rejectPromqlBody', () => {
  it.each([
    ['source kind', { kind: 'promql', name: 'Prom' }],
    [
      'tile configType',
      { tiles: [{ config: { configType: 'promql', sourceId: 's' } }] },
    ],
    ['prometheus endpoint', { name: 'Thanos', isPrometheusEndpoint: true }],
    [
      'nested dashboard tile',
      { dashboard: { tiles: [{ configType: 'promql' }] } },
    ],
  ])('returns 400 for a %s write', async (_label, body) => {
    const response = await request(app()).post('/write').send(body).expect(400);
    expect(response.body).toEqual({ message: PROMQL_UNSUPPORTED });
  });

  it('allows a log source and a promql-named filter', async () => {
    await request(app())
      .post('/write')
      .send({
        kind: 'log',
        name: 'Logs',
        filters: [{ type: 'promql', language: 'promql' }],
        isPrometheusEndpoint: false,
      })
      .expect(200);
  });
});
