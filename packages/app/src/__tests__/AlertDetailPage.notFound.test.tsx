import { screen } from '@testing-library/react';

import AlertDetailPage from '@/AlertDetailPage';

const mockQuery: { alertId?: string } = {};

jest.mock('next/router', () => ({
  useRouter: () => ({ query: mockQuery, replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/config', () => ({
  ...jest.requireActual('@/config'),
  IS_ALERT_DETAILS_ENABLED: true,
}));

// The not-found state renders none of the detail widgets; stubbing them keeps
// their (chart editor) import graph out of this test.
jest.mock('@/components/alerts/AckAlert', () => ({ AckAlert: () => null }));
jest.mock('@/components/alerts/AlertDetailChart', () => ({
  AlertDetailChart: () => null,
}));
jest.mock('@/components/alerts/AlertDetailProperties', () => ({
  AlertDetailProperties: () => null,
}));
jest.mock('@/components/alerts/AlertDetails', () => ({
  AlertNote: () => null,
}));
jest.mock('@/components/alerts/AlertEvaluationsTable', () => ({
  AlertEvaluationsTable: () => null,
}));
jest.mock('@/components/alerts/AlertHistoryCards', () => ({
  AlertHistoryCardList: () => null,
}));
jest.mock('@/components/alerts/AlertRowMenu', () => ({
  AlertRowMenu: () => null,
}));

/** The slice of the alert query the page reads before it has an alert. */
type AlertQueryState = {
  data: undefined;
  isLoading: boolean;
  isError?: boolean;
};
const mockUseAlert = jest.fn<AlertQueryState, [string | undefined]>();

jest.mock('@/api', () => ({
  __esModule: true,
  default: { useAlert: (id: string | undefined) => mockUseAlert(id) },
}));

const useAlert = mockUseAlert;

describe('AlertDetailPage not-found state', () => {
  beforeEach(() => {
    useAlert.mockReset();
  });

  it('shows "Alert not found" for an id that is not a metadata id', () => {
    mockQuery.alertId = 'smoke-alert';
    useAlert.mockReturnValue({ data: undefined, isLoading: false });
    renderWithMantine(<AlertDetailPage />);
    expect(screen.getByText('Alert not found')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to alerts' }),
    ).toHaveAttribute('href', '/alerts');
  });

  it('shows "Alert not found" when the API has no such alert', () => {
    mockQuery.alertId = '0123456789abcdef01234567';
    useAlert.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    renderWithMantine(<AlertDetailPage />);
    expect(screen.getByText('Alert not found')).toBeInTheDocument();
  });

  it('shows the loading skeleton, not the not-found state, while loading', () => {
    mockQuery.alertId = '0123456789abcdef01234567';
    useAlert.mockReturnValue({ data: undefined, isLoading: true });
    renderWithMantine(<AlertDetailPage />);
    expect(screen.queryByText('Alert not found')).not.toBeInTheDocument();
  });
});
