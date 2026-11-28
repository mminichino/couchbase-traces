import { AlertState } from '@couchbase-traces/common-utils/dist/types';
import { screen } from '@testing-library/react';

import { AlertStateBadge } from '@/components/alerts/AlertStateBadge';

// A flat stand-in for Badge, so text and props are read from one element.
jest.mock('@/components/Badge/Badge', () => ({
  ...jest.requireActual('@/components/Badge/Badge'),
  Badge: ({
    text,
    state,
    type,
  }: {
    text: React.ReactNode;
    state?: string;
    type?: string;
  }) => (
    <span data-testid="badge" data-state={state} data-type={type}>
      {text}
    </span>
  ),
}));

describe('AlertStateBadge', () => {
  it.each([
    [AlertState.ALERT, 'Alert', 'danger', 'solid'],
    [AlertState.PENDING, 'Pending', 'warning', undefined],
    [AlertState.ERROR, 'Error', 'danger', undefined],
    [AlertState.OK, 'Ok', 'success', undefined],
    [AlertState.DISABLED, 'Disabled', 'neutral', undefined],
    [AlertState.INSUFFICIENT_DATA, 'No data', 'neutral', undefined],
  ])('renders %s with the %s label', (state, label, badgeState, badgeType) => {
    renderWithMantine(<AlertStateBadge state={state} />);

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveAttribute('data-state', badgeState);
    if (badgeType) {
      expect(badge).toHaveAttribute('data-type', badgeType);
    } else {
      expect(badge).not.toHaveAttribute('data-type');
    }
  });
});
