import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';

import AuthPage from '@/AuthPage';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    query: {},
    pathname: '/login',
  }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

jest.mock('next-seo', () => ({
  NextSeo: () => null,
}));

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    useTeam: () => ({ data: undefined, isLoading: false }),
    useInstallation: () => ({ data: { isTeamExisting: true } }),
    useRegisterPassword: () => ({ mutateAsync: jest.fn(), isPending: false }),
  },
}));

jest.mock('@/brand', () => ({
  useBrandDisplayName: () => 'Couchbase Traces',
  usePageTitle: (t: string) => t,
}));

jest.mock('@/LandingHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-header" />,
}));

jest.mock('@/config', () => ({
  IS_LOCAL_MODE: false,
  IS_OSS: true,
}));

function renderAuth(action: 'login' | 'register') {
  return render(
    <MantineProvider>
      <AuthPage action={action} />
    </MantineProvider>,
  );
}

describe('AuthPage', () => {
  it('renders the login form', () => {
    renderAuth('login');
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('renders the register form with confirm password', () => {
    renderAuth('register');
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/confirm password/i)).toBeInTheDocument();
  });
});
