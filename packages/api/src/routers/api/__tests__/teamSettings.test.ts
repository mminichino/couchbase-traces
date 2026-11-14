import { TeamClickHouseSettingsUpdateSchema } from '@couchbase-traces/common-utils/dist/types';
import express from 'express';
import request from 'supertest';
import { processRequest } from 'zod-express-middleware';

function app() {
  const server = express();
  server.use(express.json());
  server.patch(
    '/team/query-settings',
    processRequest({ body: TeamClickHouseSettingsUpdateSchema }),
    (req, res) => {
      res.json(req.body);
    },
  );
  return server;
}

describe('PATCH /team/query-settings', () => {
  it('accepts scan consistency and max parallelism', async () => {
    const response = await request(app())
      .patch('/team/query-settings')
      .send({ queryScanConsistency: 'request_plus', queryMaxParallelism: 8 })
      .expect(200);

    expect(response.body).toEqual({
      queryScanConsistency: 'request_plus',
      queryMaxParallelism: 8,
    });
  });

  it('returns 400 naming queryScanConsistency when the value is invalid', async () => {
    const response = await request(app())
      .patch('/team/query-settings')
      .send({ queryScanConsistency: 'at_plus' })
      .expect(400);

    expect(JSON.stringify(response.body)).toContain('queryScanConsistency');
  });

  it('returns 400 naming queryMaxParallelism when the value is out of range', async () => {
    const response = await request(app())
      .patch('/team/query-settings')
      .send({ queryMaxParallelism: 0 })
      .expect(400);

    expect(JSON.stringify(response.body)).toContain('queryMaxParallelism');
  });
});
