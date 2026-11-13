import type { OtlpBatch } from '@/sample/generate';
import { sendBatches, SendError } from '@/sample/send';

const batch: OtlpBatch = { signal: 'logs', body: { resourceLogs: [] } };

describe('sendBatches', () => {
  it('returns exit 3 on 401 without retrying', async () => {
    let calls = 0;
    const fetchImpl = jest.fn(async () => {
      calls++;
      return { ok: false, status: 401 } as Response;
    });
    await expect(
      sendBatches([batch], {
        endpoint: 'http://collector',
        fetchImpl,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ exitCode: 3 } satisfies Partial<SendError>);
    expect(calls).toBe(1);
  });

  it('retries retryable status then succeeds', async () => {
    let calls = 0;
    const fetchImpl = jest.fn(async () => {
      calls++;
      if (calls < 3) return { ok: false, status: 503 } as Response;
      return { ok: true, status: 200 } as Response;
    });
    const totals = await sendBatches([batch], {
      endpoint: 'http://collector',
      fetchImpl,
      sleep: async () => {},
    });
    expect(totals.logs).toBe(1);
    expect(calls).toBe(3);
  });

  it('retries network errors then fails with exit 2', async () => {
    let calls = 0;
    const fetchImpl = jest.fn(async () => {
      calls++;
      throw new TypeError('fetch failed');
    });
    await expect(
      sendBatches([batch], {
        endpoint: 'http://collector',
        maxAttempts: 3,
        fetchImpl,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ exitCode: 2 });
    expect(calls).toBe(3);
  });

  it('sends to /v1/<signal> with Authorization when api key set', async () => {
    const fetchImpl = jest.fn(
      async () => ({ ok: true, status: 200 }) as Response,
    );
    await sendBatches(
      [
        { signal: 'traces', body: {} },
        { signal: 'metrics', body: {} },
      ],
      {
        endpoint: 'http://collector/',
        apiKey: 'secret-key',
        fetchImpl,
        sleep: async () => {},
      },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://collector/v1/traces',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'secret-key' }),
      }),
    );
  });
});
