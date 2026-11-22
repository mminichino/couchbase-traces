import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import api from '@/api';

const mockFetch = jest.fn();

jest.mock('ky-universal', () => {
  const instance = (...args: unknown[]) => mockFetch(...args);
  const create = () => Object.assign(instance, { extend: create });
  return { __esModule: true, default: { create } };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('api.useAlert', () => {
  beforeEach(() => mockFetch.mockReset());

  it('does not request an id that cannot be an alert id', async () => {
    const { result } = renderHook(() => api.useAlert('smoke-alert'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('requests a well-formed id', async () => {
    mockFetch.mockReturnValue({ json: async () => ({ data: { _id: 'x' } }) });
    const { result } = renderHook(
      () => api.useAlert('0123456789abcdef01234567'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      'alerts/0123456789abcdef01234567',
      expect.anything(),
    );
  });
});
