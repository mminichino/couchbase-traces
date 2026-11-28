import { screen } from '@testing-library/react';

import { WhatsNewHighlightRow } from '@/components/AppNav/WhatsNewHighlightRow';

// A flat stand-in for Badge, so text and props are read from one element.
jest.mock('@/components/Badge/Badge', () => ({
  ...jest.requireActual('@/components/Badge/Badge'),
  Badge: ({ text, state }: { text: React.ReactNode; state?: string }) => (
    <span data-testid="badge" data-state={state}>
      {text}
    </span>
  ),
}));

describe('WhatsNewHighlightRow', () => {
  it.each([
    ['breaking', 'Breaking', 'danger'],
    ['feature', 'New', 'info'],
  ] as const)(
    'renders a %s headline with the %s badge',
    (kind, label, state) => {
      renderWithMantine(
        <WhatsNewHighlightRow headline={{ kind, text: 'A headline' }} />,
      );

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveTextContent(label);
      expect(badge).toHaveAttribute('data-state', state);
      expect(screen.getByTestId('whats-new-headline')).toHaveTextContent(
        'A headline',
      );
    },
  );
});
