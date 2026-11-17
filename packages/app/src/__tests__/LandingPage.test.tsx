import { render } from '@testing-library/react';

import LandingPage from '@/LandingPage';

const push = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    useInstallation: () => ({ data: undefined }),
    useTeam: () => ({ data: undefined, isLoading: true }),
  },
}));

jest.mock('@/config', () => ({
  IS_LOCAL_MODE: false,
}));

jest.mock('@/AuthLoadingBlocker', () => ({
  __esModule: true,
  default: () => <div data-testid="auth-loading" />,
}));

describe('LandingPage', () => {
  it('shows the auth loading blocker while installation state loads', () => {
    const { getByTestId } = render(<LandingPage />);
    expect(getByTestId('auth-loading')).toBeInTheDocument();
  });
});
