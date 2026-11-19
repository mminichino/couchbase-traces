import { SourceKind } from '@couchbase-traces/common-utils/dist/types';
import request, { SuperAgentTest } from 'supertest';

import * as config from '@/config';
import { validateConnectionId } from '@/controllers/connection';
import {
  DEFAULT_DATABASE,
  DEFAULT_LOGS_TABLE,
  getLoggedInAgent,
  getServer,
} from '@/fixtures';
import { getMetadataStore } from '@/metadata';
import { newId } from '@/metadata/ids';
import { IConnection } from '@/metadata/schemas/connection';
import type { ITeam } from '@/metadata/schemas/team';
import type { IUser } from '@/metadata/schemas/user';
import {
  findSource,
  getSourceDoc,
  listSources,
  removeSource,
  seedConnection,
  seedSource,
  sourceField,
} from '@/metadata/testing/seed';

describe('External API v2 Sources CRUD', () => {
  const server = getServer();
  let agent: SuperAgentTest;
  let team: ITeam;
  let user: IUser;
  let connection: IConnection;

  beforeAll(async () => {
    await server.start();
  });

  beforeEach(async () => {
    const result = await getLoggedInAgent(server);
    agent = result.agent;
    team = result.team;
    user = result.user;

    connection = await seedConnection({
      kind: 'couchbase',
      team: team._id,
      name: 'Default',
      host: config.CLICKHOUSE_HOST,
      username: config.CLICKHOUSE_USER,
      password: config.CLICKHOUSE_PASSWORD,
    });
  });

  afterEach(async () => {
    await server.clearDBs();
  });

  afterAll(async () => {
    await server.stop();
  });

  // Helper for authenticated requests
  const authRequest = (
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
  ) => {
    return agent[method](url).set('Authorization', `Bearer ${user?.accessKey}`);
  };

  const BASE_URL = '/api/v2/sources';

  const logSourceBody = () => ({
    kind: SourceKind.Log,
    name: 'Created Log Source',
    from: {
      databaseName: DEFAULT_DATABASE,
      tableName: DEFAULT_LOGS_TABLE,
    },
    timestampValueExpression: 'Timestamp',
    defaultTableSelectExpression: 'Timestamp, Body',
    connection: connection._id.toString(),
  });

  const traceSourceBody = () => ({
    kind: SourceKind.Trace,
    name: 'Created Trace Source',
    defaultTableSelectExpression: 'Timestamp, SpanName',
    from: {
      databaseName: DEFAULT_DATABASE,
      tableName: 'otel_traces',
    },
    timestampValueExpression: 'Timestamp',
    durationExpression: 'Duration',
    durationPrecision: 3,
    traceIdExpression: 'TraceId',
    spanIdExpression: 'SpanId',
    parentSpanIdExpression: 'ParentSpanId',
    spanNameExpression: 'SpanName',
    spanKindExpression: 'SpanKind',
    connection: connection._id.toString(),
  });

  const metricSourceBody = () => ({
    kind: SourceKind.Metric,
    name: 'Created Metric Source',
    from: { databaseName: DEFAULT_DATABASE, tableName: '' },
    timestampValueExpression: 'TimeUnix',
    resourceAttributesExpression: 'ResourceAttributes',
    metricTables: { gauge: 'otel_metrics_gauge' },
    connection: connection._id.toString(),
  });

  const createOtherTeamConnection = (otherTeamId: string) =>
    seedConnection({
      kind: 'couchbase',
      team: otherTeamId,
      name: 'Other Team Connection',
      host: config.CLICKHOUSE_HOST,
      username: config.CLICKHOUSE_USER,
      password: config.CLICKHOUSE_PASSWORD,
    });

  const createOtherTeamSource = async () => {
    const otherTeamId = newId();
    const otherConnection = await createOtherTeamConnection(otherTeamId);
    return seedSource({
      kind: SourceKind.Log,
      team: otherTeamId,
      name: 'Other Team Source',
      from: {
        databaseName: DEFAULT_DATABASE,
        tableName: DEFAULT_LOGS_TABLE,
      },
      timestampValueExpression: 'Timestamp',
      defaultTableSelectExpression: '*',
      connection: otherConnection._id,
    });
  };

  describe('GET /api/v2/sources/:id', () => {
    it('should return 401 when user is not authenticated', async () => {
      await request(server.getHttpServer())
        .get(`${BASE_URL}/${newId()}`)
        .expect(401);
    });

    it('should return a source by id', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });

      const response = await authRequest(
        'get',
        `${BASE_URL}/${logSource._id}`,
      ).expect(200);

      expect(response.body.data).toMatchObject({
        id: logSource._id.toString(),
        name: 'Created Log Source',
        kind: SourceKind.Log,
      });
    });

    it('should return 404 for a non-existent source', async () => {
      await authRequest('get', `${BASE_URL}/${newId()}`).expect(404);
    });

    it("should return 404 for another team's source", async () => {
      const otherTeamSource = await createOtherTeamSource();
      await authRequest('get', `${BASE_URL}/${otherTeamSource._id}`).expect(
        404,
      );
    });

    it('should return 400 for an invalid id', async () => {
      await authRequest('get', `${BASE_URL}/not-an-object-id`).expect(400);
    });
  });

  describe('POST /api/v2/sources', () => {
    it('should return 401 when user is not authenticated', async () => {
      await request(server.getHttpServer())
        .post(BASE_URL)
        .send(logSourceBody())
        .expect(401);
    });

    it('should create a log source', async () => {
      const response = await authRequest('post', BASE_URL)
        .send(logSourceBody())
        .expect(200);

      expect(response.body.data).toMatchObject({
        name: 'Created Log Source',
        kind: SourceKind.Log,
        connection: connection._id.toString(),
        timestampValueExpression: 'Timestamp',
        defaultTableSelectExpression: 'Timestamp, Body',
      });
      expect(typeof response.body.data.id).toBe('string');

      const persisted = await findSource(response.body.data.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.team.toString()).toBe(team._id.toString());
    });

    it('should accept external short-form granularities and store internal format', async () => {
      const response = await authRequest('post', BASE_URL)
        .send({
          ...traceSourceBody(),
          materializedViews: [
            {
              databaseName: DEFAULT_DATABASE,
              tableName: 'traces_mv',
              dimensionColumns: 'ServiceName',
              minGranularity: '5m',
              timestampColumn: 'Timestamp',
              aggregatedColumns: [{ mvColumn: 'count', aggFn: 'count' }],
            },
          ],
        })
        .expect(200);

      // Response echoes the external format
      expect(response.body.data.materializedViews[0].minGranularity).toBe('5m');

      // The database stores the internal SQL interval format
      const persisted = await findSource(response.body.data.id);
      expect(
        sourceField(persisted, 'metadataMaterializedViews')?.granularity,
      ).toBe('5 minute');
    });

    it('should map metadataMaterializedViews granularity to internal format', async () => {
      const response = await authRequest('post', BASE_URL)
        .send({
          ...logSourceBody(),
          metadataMaterializedViews: {
            keyRollupTable: 'otel_logs_key_rollup_15m',
            kvRollupTable: 'otel_logs_kv_rollup_15m',
            granularity: '15m',
          },
        })
        .expect(200);

      // Response echoes the external format
      expect(response.body.data.metadataMaterializedViews.granularity).toBe(
        '15m',
      );

      // The database stores the internal SQL interval format
      const persisted = await findSource(response.body.data.id);
      expect(
        sourceField(persisted, 'metadataMaterializedViews').granularity,
      ).toBe('15 minute');
    });

    it('should round-trip minAutoGranularity in the SQL interval format', async () => {
      const response = await authRequest('post', BASE_URL)
        .send({ ...metricSourceBody(), minAutoGranularity: '1 minute' })
        .expect(200);

      expect(response.body.data.minAutoGranularity).toBe('1 minute');

      const persisted = await findSource(response.body.data.id);
      expect(sourceField(persisted, 'minAutoGranularity')).toBe('1 minute');
    });

    it('should reject a short-form minAutoGranularity', async () => {
      // Unlike materializedViews[].minGranularity, this field is not mapped
      // from the short form, so the documented contract is the SQL interval.
      await authRequest('post', BASE_URL)
        .send({ ...metricSourceBody(), minAutoGranularity: '1m' })
        .expect(400);
    });

    it('should return 400 when connection is not a valid id', async () => {
      await authRequest('post', BASE_URL)
        .send({ ...logSourceBody(), connection: 'my-connection-name' })
        .expect(400);
    });

    it('should return 400 when connection belongs to another team', async () => {
      const otherConnection = await createOtherTeamConnection(newId());

      await authRequest('post', BASE_URL)
        .send({
          ...logSourceBody(),
          connection: otherConnection._id.toString(),
        })
        .expect(400);

      expect((await listSources(team._id))[0] ?? null).toBeNull();
    });

    it('should return 400 for an invalid body', async () => {
      await authRequest('post', BASE_URL)
        .send({ kind: SourceKind.Log, name: 'Missing required fields' })
        .expect(400);
    });
  });

  describe('PromQL sources with PromQL disabled', () => {
    const promqlSourceBody = () => ({
      kind: SourceKind.Promql,
      name: 'Prometheus Metrics',
      from: { databaseName: DEFAULT_DATABASE, tableName: 'default' },
      timestampValueExpression: 'timestamp',
      connection: connection._id.toString(),
    });

    it('rejects creating a PromQL source', async () => {
      const response = await authRequest('post', BASE_URL)
        .send(promqlSourceBody())
        .expect(400);

      // Zod drops `promql` from the kind discriminator before rejectPromqlBody.
      expect(String(response.body.message)).toMatch(
        /PromQL sources are no longer supported|Invalid discriminator value/,
      );
      expect((await listSources(team._id))[0] ?? null).toBeNull();
    });

    it('rejects updating a source to PromQL', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });

      const response = await authRequest('put', `${BASE_URL}/${logSource._id}`)
        .send(promqlSourceBody())
        .expect(400);

      expect(String(response.body.message)).toMatch(
        /PromQL sources are no longer supported|Invalid discriminator value/,
      );
      expect((await findSource(logSource._id))!.kind).toBe(SourceKind.Log);
    });

    it('still creates other source kinds', async () => {
      await authRequest('post', BASE_URL).send(logSourceBody()).expect(200);
    });
  });

  describe('PUT /api/v2/sources/:id', () => {
    it('should return 401 when user is not authenticated', async () => {
      await request(server.getHttpServer())
        .put(`${BASE_URL}/${newId()}`)
        .send(logSourceBody())
        .expect(401);
    });

    it('should update a source', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });

      const response = await authRequest('put', `${BASE_URL}/${logSource._id}`)
        .send({ ...logSourceBody(), name: 'Updated Log Source' })
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: logSource._id.toString(),
        name: 'Updated Log Source',
      });

      const persisted = await findSource(logSource._id);
      expect(persisted!.name).toBe('Updated Log Source');
    });

    it('should return 404 for a non-existent source', async () => {
      await authRequest('put', `${BASE_URL}/${newId()}`)
        .send(logSourceBody())
        .expect(404);
    });

    it("should return 404 for another team's source", async () => {
      const otherTeamSource = await createOtherTeamSource();

      await authRequest('put', `${BASE_URL}/${otherTeamSource._id}`)
        .send({ ...logSourceBody(), name: 'Hijacked' })
        .expect(404);

      const persisted = await findSource(otherTeamSource._id);
      expect(persisted!.name).toBe('Other Team Source');
    });

    it('should return 400 for an invalid body', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });

      await authRequest('put', `${BASE_URL}/${logSource._id}`)
        .send({ kind: SourceKind.Log, name: 'Missing required fields' })
        .expect(400);
    });

    it('should return 400 when connection is not a valid id', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });

      await authRequest('put', `${BASE_URL}/${logSource._id}`)
        .send({ ...logSourceBody(), connection: 'my-connection-name' })
        .expect(400);
    });

    it('should return 400 when connection belongs to another team', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });
      const otherConnection = await createOtherTeamConnection(newId());

      await authRequest('put', `${BASE_URL}/${logSource._id}`)
        .send({
          ...logSourceBody(),
          connection: otherConnection._id.toString(),
        })
        .expect(400);

      const persisted = await findSource(logSource._id);
      expect(persisted!.connection.toString()).toBe(connection._id.toString());
    });

    it('should preserve createdAt on a same-kind update', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });
      const originalCreatedAt = logSource.createdAt.toISOString();
      expect(typeof originalCreatedAt).toBe('string');

      await authRequest('put', `${BASE_URL}/${logSource._id}`)
        .send({ ...logSourceBody(), name: 'Updated Log Source' })
        .expect(200);

      const raw = await getSourceDoc(logSource._id);
      expect(raw!.createdAt).toEqual(originalCreatedAt);
    });

    it("should change a source's kind", async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });
      const originalCreatedAt = logSource.createdAt.toISOString();
      expect(typeof originalCreatedAt).toBe('string');

      const response = await authRequest('put', `${BASE_URL}/${logSource._id}`)
        .send({ ...traceSourceBody(), name: 'Now A Trace Source' })
        .expect(200);

      expect(response.body.data).toMatchObject({
        id: logSource._id.toString(),
        kind: SourceKind.Trace,
        name: 'Now A Trace Source',
      });

      const persisted = await findSource(logSource._id);
      expect(persisted!.kind).toBe(SourceKind.Trace);

      // The kind change swaps the whole document; assert on the stored one
      // that createdAt survives and connection stays a string id.
      const raw = await getSourceDoc(logSource._id);
      expect(raw!.createdAt).toEqual(originalCreatedAt);
      expect(typeof raw!.connection).toBe('string');
    });

    it('should return 404 on a kind change when the source is deleted concurrently', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });

      // Simulate a concurrent delete landing between the controller's findOne
      // and the raw replaceOne in the kind-change path: the replace matches
      // nothing, so matchedCount === 0 and the controller must report 404
      // rather than hydrating a phantom document.
      const sources = getMetadataStore().sources;
      const realReplace = sources.replace.bind(sources);
      const spy = jest
        .spyOn(sources, 'replace')
        .mockImplementationOnce(async (...args) => {
          await removeSource(logSource._id);
          return realReplace(...args);
        });

      try {
        await authRequest('put', `${BASE_URL}/${logSource._id}`)
          .send({ ...traceSourceBody(), name: 'Now A Trace Source' })
          .expect(404);
      } finally {
        spy.mockRestore();
      }

      // No phantom document was written back.
      expect(await findSource(logSource._id)).toBeNull();
    });
  });

  describe('DELETE /api/v2/sources/:id', () => {
    it('should return 401 when user is not authenticated', async () => {
      await request(server.getHttpServer())
        .delete(`${BASE_URL}/${newId()}`)
        .expect(401);
    });

    it('should delete a source', async () => {
      const logSource = await seedSource({
        ...logSourceBody(),
        team: team._id,
      });

      await authRequest('delete', `${BASE_URL}/${logSource._id}`).expect(200);

      expect(await findSource(logSource._id)).toBeNull();
    });

    it('should return 404 for a non-existent source', async () => {
      await authRequest('delete', `${BASE_URL}/${newId()}`).expect(404);
    });

    it("should return 404 for another team's source and leave it intact", async () => {
      const otherTeamSource = await createOtherTeamSource();

      await authRequest('delete', `${BASE_URL}/${otherTeamSource._id}`).expect(
        404,
      );

      expect(await findSource(otherTeamSource._id)).not.toBeNull();
    });
  });

  describe('validateConnectionId', () => {
    it('rejects a malformed connection with a 400', async () => {
      expect(
        await validateConnectionId('my-connection-name', team._id),
      ).toEqual({
        ok: false,
        status: 400,
        message: 'connection must be a valid connection id',
      });
    });

    it('rejects a missing team with a 403', async () => {
      expect(
        await validateConnectionId(connection._id.toString(), undefined),
      ).toEqual({ ok: false, status: 403, message: 'Forbidden' });
    });

    it('rejects a connection belonging to another team with a 400', async () => {
      const otherConnection = await createOtherTeamConnection(newId());

      expect(
        await validateConnectionId(otherConnection._id.toString(), team._id),
      ).toEqual({
        ok: false,
        status: 400,
        message: 'connection must be an existing connection id',
      });
    });

    it('accepts a valid connection owned by the team', async () => {
      expect(
        await validateConnectionId(connection._id.toString(), team._id),
      ).toEqual({ ok: true });
    });
  });
});
