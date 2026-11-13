import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { BaseResultSet } from '@clickhouse/client';

import {
  primeConnectionKind,
  resetConnectionKindState,
} from '@couchbase-traces/common-utils/dist/dataLayer/kind';

import {
  ApiClient,
  CliRoutingClient,
  ProxyClickhouseClient,
} from '@/api/client';

const fakeResult = {
  query_id: 'cb',
  async json() {
    return { data: [], meta: [], rows: 0, statistics: {} };
  },
  async text() {
    return '';
  },
  stream() {
    return new ReadableStream();
  },
  close() {
    return undefined;
  },
} as unknown as BaseResultSet<ReadableStream, 'JSON'>;

function routingClient(): CliRoutingClient {
  const api = new ApiClient({ appUrl: 'http://127.0.0.1:8080' });
  return new CliRoutingClient(api, { host: 'http://127.0.0.1:8080/api' });
}

beforeEach(() => {
  resetConnectionKindState();
});

describe('CliRoutingClient', () => {
  it('keeps clickhouse traffic on the proxy client', async () => {
    primeConnectionKind('ch-conn', 'clickhouse');
    const routing = routingClient();
    const proxySpy = jest
      .spyOn(ProxyClickhouseClient.prototype, 'query')
      .mockResolvedValue(fakeResult);

    await routing.query({
      query: 'SELECT 1',
      format: 'JSON',
      connectionId: 'ch-conn',
    });

    expect(proxySpy).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'SELECT 1', connectionId: 'ch-conn' }),
    );
    proxySpy.mockRestore();
  });

  it('routes couchbase traffic through CouchbaseClient', async () => {
    primeConnectionKind('cb-conn', 'couchbase');
    const routing = routingClient();
    const proxySpy = jest
      .spyOn(ProxyClickhouseClient.prototype, 'query')
      .mockResolvedValue(fakeResult);
    const cbSpy = jest
      .spyOn(routing.couchbaseDataClient(), 'query')
      .mockResolvedValue(fakeResult);

    await routing.query({
      query: 'SELECT 1',
      format: 'JSON',
      connectionId: 'cb-conn',
    });

    expect(cbSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'cb-conn',
        query: 'SELECT 1',
      }),
    );
    expect(proxySpy).not.toHaveBeenCalled();
    proxySpy.mockRestore();
    cbSpy.mockRestore();
  });
});
