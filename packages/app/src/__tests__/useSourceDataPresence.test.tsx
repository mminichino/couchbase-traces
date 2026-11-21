import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useSourceDataPresence } from '@/OnboardingChecklist/useSourceDataPresence';

const mockQuery = jest.fn();
jest.mock('@/query', () => ({
  useDataClient: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));

function respond(answer: (query: string) => unknown[]) {
  mockQuery.mockImplementation(async ({ query }: { query: string }) => ({
    json: async () => ({ data: answer(query) }),
  }));
}

const LISTING = [['otel', 'default', 'otel_logs']];
const logs = { databaseName: 'otel', tableName: 'otel_logs' };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const queries = () =>
  mockQuery.mock.calls.map(([inputs]: [{ query: string }]) => inputs.query);

beforeEach(() => mockQuery.mockReset());

describe('useSourceDataPresence', () => {
  it('reports data when a source collection has documents', async () => {
    respond(q => (q.includes('system:all_keyspaces') ? LISTING : ['4']));
    const { result } = renderHook(
      () =>
        useSourceDataPresence({
          connectionId: 'c1',
          keyspaces: [logs],
          enabled: true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasData).toBe(true);
    // SQL++ only: no ClickHouse system.tables probe.
    expect(queries().join('\n')).not.toMatch(/system\.tables|total_rows/);
    expect(queries()).toContain(
      'SELECT RAW COUNT(*) FROM `otel`.`default`.`otel_logs`',
    );
  });

  it('reports no data for empty collections', async () => {
    respond(q => (q.includes('system:all_keyspaces') ? LISTING : ['0']));
    const { result } = renderHook(
      () =>
        useSourceDataPresence({
          connectionId: 'c1',
          keyspaces: [logs],
          enabled: true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasData).toBe(false);
  });

  it('does not query when disabled', () => {
    const { result } = renderHook(
      () =>
        useSourceDataPresence({
          connectionId: 'c1',
          keyspaces: [logs],
          enabled: false,
        }),
      { wrapper },
    );
    expect(mockQuery).not.toHaveBeenCalled();
    expect(result.current.hasData).toBeUndefined();
  });

  it('settles to no data when the probe fails', async () => {
    mockQuery.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(
      () =>
        useSourceDataPresence({
          connectionId: 'c1',
          keyspaces: [logs],
          enabled: true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasData).toBe(false);
  });
});
