import { fireEvent, screen } from '@testing-library/react';

import CouchbaseClusterPage from '@/CouchbaseClusterPage';

const connections = [
  {
    id: '65f0b0b0b0b0b0b0b0b0b0b0',
    name: 'Local cluster',
    kind: 'couchbase' as const,
    host: 'couchbase://localhost',
    username: 'cbt_query',
  },
];

let connectionData: typeof connections | [] = connections;
let statusResult: { isLoading: boolean; isError: boolean; data?: unknown } = {
  isLoading: false,
  isError: false,
};
let infrastructureResult: {
  isLoading: boolean;
  isError: boolean;
  data?: unknown;
} = {
  isLoading: false,
  isError: false,
};
let queriesResult: { isLoading: boolean; isError: boolean; data?: unknown } = {
  isLoading: false,
  isError: false,
};

jest.mock('next/head', () => ({ __esModule: true, default: () => null }));
jest.mock('@/connection', () => ({
  useConnections: () => ({ data: connectionData }),
}));
jest.mock('@/source', () => ({
  useSources: () => ({
    data: [{ kind: 'log', connection: connections[0].id }],
  }),
}));
jest.mock('@/clusterApi', () => ({
  useClusterStatus: () => statusResult,
  useClusterInfrastructure: () => infrastructureResult,
  useClusterQueries: () => queriesResult,
}));

const restricted = {
  available: false,
  reason: 'restricted' as const,
  detail: { httpStatus: 403, code: 'permission', message: 'not allowed' },
};
const notConfigured = {
  available: false,
  reason: 'not_configured' as const,
  detail: {
    code: 'not_configured',
    message: 'Monitoring credentials are not set',
  },
};

beforeEach(() => {
  connectionData = connections;
  statusResult = { isLoading: false, isError: false, data: undefined };
  infrastructureResult = { isLoading: false, isError: false, data: undefined };
  queriesResult = { isLoading: true, isError: false };
});

describe('Couchbase cluster page', () => {
  it('links to Connections when the team has no Couchbase connection', () => {
    connectionData = [];
    renderWithMantine(<CouchbaseClusterPage />);
    expect(screen.getByTestId('cluster-empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connections' })).toHaveAttribute(
      'href',
      '/team',
    );
  });

  it('shows a skeleton while a tab is loading', () => {
    renderWithMantine(<CouchbaseClusterPage />);
    expect(screen.getByTestId('cluster-skeleton')).toBeInTheDocument();
  });

  it('shows query data, the completed-requests note, and a truncated statement', () => {
    const statement = `${'SELECT '.padEnd(520, 'x')}`;
    queriesResult = {
      isLoading: false,
      isError: false,
      data: {
        note: 'Completed requests include only what this server keeps.',
        active: {
          available: true,
          fetchedAt: '2026-11-12T00:00:00.000Z',
          data: [
            {
              requestId: 'r1',
              statement,
              state: 'running',
              elapsedTime: '1ms',
              users: 'cbt_query',
              node: 'n1',
            },
          ],
        },
        completedOverTime: {
          available: true,
          fetchedAt: '2026-11-12T00:00:00.000Z',
          data: [],
        },
        topStatements: {
          available: true,
          fetchedAt: '2026-11-12T00:00:00.000Z',
          data: [],
        },
        recent: {
          available: true,
          fetchedAt: '2026-11-12T00:00:00.000Z',
          data: [],
        },
        indexes: {
          available: true,
          fetchedAt: '2026-11-12T00:00:00.000Z',
          data: [],
        },
      },
    };
    renderWithMantine(<CouchbaseClusterPage />);
    expect(
      screen.getByText(/Completed requests include only/),
    ).toBeInTheDocument();
    expect(screen.getByText(/SELECT /)).toHaveTextContent('…');
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('shows the monitoring notice and the restricted notice with details', () => {
    queriesResult = {
      isLoading: false,
      isError: false,
      data: {
        note: 'note',
        active: restricted,
        completedOverTime: restricted,
        topStatements: restricted,
        recent: restricted,
        indexes: restricted,
      },
    };
    statusResult = {
      isLoading: false,
      isError: false,
      data: {
        cluster: notConfigured,
        nodes: notConfigured,
        buckets: notConfigured,
        tasks: notConfigured,
      },
    };
    infrastructureResult = {
      isLoading: false,
      isError: false,
      data: {
        cpu: {
          available: true,
          fetchedAt: '2026-11-12T00:00:00.000Z',
          data: {
            measure: 'CPU utilization per node',
            unit: 'percent',
            series: [],
          },
        },
      },
    };
    renderWithMantine(<CouchbaseClusterPage />);
    expect(
      screen.getAllByText(/Not available for this cluster/).length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    expect(screen.getAllByText(/403/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not allowed/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Status' }));
    expect(
      screen.getAllByText(
        'Add a monitoring user to this connection to see cluster status and infrastructure metrics.',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', { name: 'Connection settings' })[0],
    ).toHaveAttribute('href', '/team');

    fireEvent.click(screen.getByRole('tab', { name: 'Infrastructure' }));
    expect(screen.getByText('No data in this range.')).toBeInTheDocument();
  });

  it('uses the standard error display when the request fails', () => {
    queriesResult = { isLoading: false, isError: true };
    renderWithMantine(<CouchbaseClusterPage />);
    expect(screen.getByTestId('cluster-error')).toHaveTextContent(
      'Something went wrong fetching this page.',
    );
  });
});
