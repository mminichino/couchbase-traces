import { screen } from '@testing-library/react';

import { FormatPodStatus } from '@/components/KubeComponents';
import { KubePhase } from '@/types';

// A flat stand-in for Badge, so text and props are read from one element.
jest.mock('@/components/Badge/Badge', () => ({
  ...jest.requireActual('@/components/Badge/Badge'),
  Badge: ({ text, state }: { text: React.ReactNode; state?: string }) => (
    <span data-testid="badge" data-state={state}>
      {text}
    </span>
  ),
}));

describe('FormatPodStatus', () => {
  it.each([
    [KubePhase.Pending, 'Pending', 'warning'],
    [KubePhase.Running, 'Running', 'success'],
    [KubePhase.Succeeded, 'Succeeded', 'info'],
    [KubePhase.Failed, 'Failed', 'danger'],
    [KubePhase.Unknown, 'Unknown', 'neutral'],
    [undefined, 'Unknown', 'neutral'],
  ])('renders phase %s with the %s label', (status, label, badgeState) => {
    renderWithMantine(<FormatPodStatus status={status} />);

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveAttribute('data-state', badgeState);
  });
});
