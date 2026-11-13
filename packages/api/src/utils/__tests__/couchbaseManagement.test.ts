import http from 'node:http';

import {
  classifyManagementError,
  managementCall,
  managementHostProblem,
} from '@/utils/couchbaseManagement';

function listen(
  handler: http.RequestListener,
): Promise<{ server: http.Server; url: string }> {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        throw new Error('no port');
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

describe('management calls', () => {
  it('classifies refused, DNS, TLS, and timeout failures', () => {
    expect(classifyManagementError({ code: 'ECONNREFUSED' })).toMatchObject({
      code: 'connection_refused',
    });
    expect(classifyManagementError({ code: 'ENOTFOUND' })).toMatchObject({
      code: 'dns',
    });
    expect(
      classifyManagementError({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }),
    ).toMatchObject({ code: 'tls' });
    expect(classifyManagementError({ code: 'ETIMEDOUT' })).toMatchObject({
      code: 'timeout',
    });
  });

  it('reports HTTP 401, 403, 404, and 500 as those statuses', async () => {
    for (const status of [401, 403, 404, 500]) {
      const { server, url } = await listen((_req, res) => {
        res.writeHead(status);
        res.end('nope');
      });
      const result = await managementCall({
        url,
        username: 'u',
        password: 'secret',
      });
      server.close();
      expect(result).toEqual({
        ok: false,
        detail: { httpStatus: status, message: `HTTP ${status}` },
      });
      if (!result.ok) {
        expect(result.detail.message).not.toContain('secret');
      }
    }
  });

  it('does not follow redirects', async () => {
    let hits = 0;
    const { server, url } = await listen((_req, res) => {
      hits += 1;
      res.writeHead(302, { Location: `${url}/elsewhere` });
      res.end();
    });
    const result = await managementCall({ url, username: 'u', password: 'p' });
    server.close();
    expect(hits).toBe(1);
    expect(result).toMatchObject({
      ok: false,
      detail: { httpStatus: 302, code: 'redirect' },
    });
  });

  it('times out and reports a refused connection', async () => {
    const { server, url } = await listen(() => {
      /* never respond */
    });
    const timedOut = await managementCall({
      url,
      username: 'u',
      password: 'p',
      timeoutMs: 30,
    });
    server.close();
    expect(timedOut).toMatchObject({ ok: false, detail: { code: 'timeout' } });

    const refused = await managementCall({
      url: 'http://127.0.0.1:1',
      username: 'u',
      password: 'p',
      timeoutMs: 500,
    });
    expect(refused).toMatchObject({
      ok: false,
      detail: { code: 'connection_refused' },
    });
  });

  it('rejects a private IP literal before any request', () => {
    expect(managementHostProblem('couchbase://10.1.2.3')).toBe('Invalid host');
    expect(managementHostProblem('couchbase://cb.example.com')).toBeNull();
  });
});
