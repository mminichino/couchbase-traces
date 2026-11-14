import React from 'react';
import type { CouchbaseConnection } from '@couchbase-traces/common-utils/dist/types';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { ConnectionForm } from '@/components/ConnectionForm';

import '@testing-library/jest-dom';

declare function renderWithMantine(
  ui: React.ReactElement,
): ReturnType<typeof import('@testing-library/react').render>;

const mockCreateMutate = jest.fn();
const mockUpdateMutate = jest.fn();
jest.mock('@/connection', () => ({
  ...jest.requireActual('@/connection'),
  useCreateConnection: () => ({
    mutate: mockCreateMutate,
    isPending: false,
  }),
  useUpdateConnection: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
  useDeleteConnection: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  testConnectionByKind: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@mantine/notifications', () => ({
  notifications: {
    show: jest.fn(),
  },
}));

const baseConnection: CouchbaseConnection = {
  id: '',
  kind: 'couchbase',
  name: 'Test Connection',
  host: 'couchbase://localhost',
  username: 'Administrator',
  password: '',
};

describe('ConnectionForm', () => {
  beforeEach(() => {
    mockCreateMutate.mockClear();
    mockUpdateMutate.mockClear();
    (
      jest.requireMock('@mantine/notifications') as any
    ).notifications.show.mockClear();
  });

  it('creates a Couchbase connection', async () => {
    renderWithMantine(
      <ConnectionForm connection={baseConnection} isNew={true} />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Create/i }),
      ).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('My Couchbase cluster'), {
      target: { value: 'My cluster' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalled();
    });
    const arg = mockCreateMutate.mock.calls[0][0];
    expect(arg.connection.kind).toBe('couchbase');
    expect(arg.connection.host).toBe('couchbase://localhost');
  });
});
