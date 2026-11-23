import { connectCluster } from '@/couchbase/nodeCluster';

const connect = jest.fn();
jest.mock('couchbase', () => ({
  ...jest.requireActual('couchbase'),
  connect: (...args: unknown[]) => connect(...args),
}));

describe('connectCluster DNS SRV budget (D18)', () => {
  const prev = process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS;
  afterEach(() => {
    connect.mockReset();
    if (prev == null) delete process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS;
    else process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS = prev;
  });

  const conn = {
    host: 'couchbases://cb.example.cloud.couchbase.com',
    username: 'u',
    password: 'p',
  };

  it('passes the shared 2 s SRV budget to the SDK', async () => {
    delete process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS;
    connect.mockResolvedValue({ close: jest.fn() });
    await connectCluster(conn, 10000, undefined);
    expect(connect).toHaveBeenCalledWith(
      conn.host,
      expect.objectContaining({ dnsConfig: { dnsSrvTimeout: 2000 } }),
    );
  });

  it('honors CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS', async () => {
    process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS = '4000';
    connect.mockResolvedValue({ close: jest.fn() });
    await connectCluster(conn, 10000, undefined);
    expect(connect.mock.calls[0][1].dnsConfig).toEqual({ dnsSrvTimeout: 4000 });
  });
});
