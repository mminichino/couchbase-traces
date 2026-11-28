import { screen } from '@testing-library/react';

import { ChatMessageItem } from '@/llm/components/ChatMessageItem';

// A flat stand-in for Badge, so text and props are read from one element.
jest.mock('@/components/Badge/Badge', () => ({
  ...jest.requireActual('@/components/Badge/Badge'),
  Badge: ({
    text,
    state,
    'data-testid': testId,
  }: {
    text: React.ReactNode;
    state?: string;
    'data-testid'?: string;
  }) => (
    <span data-testid={testId} data-state={state}>
      {text}
    </span>
  ),
}));

describe('ChatMessageItem', () => {
  it.each([
    ['system', 'neutral'],
    ['developer', 'neutral'],
    ['user', 'info'],
    ['Assistant', 'success'],
    ['tool', 'warning'],
    ['function', 'warning'],
    ['other', 'neutral'],
  ])('renders the %s role with the %s state', (role, badgeState) => {
    renderWithMantine(
      <ChatMessageItem
        message={{ id: 0, source: 'input', role, content: null }}
      />,
    );

    const badge = screen.getByTestId('llm-chat-message-role');
    expect(badge).toHaveTextContent(role.toLowerCase());
    expect(badge).toHaveAttribute('data-state', badgeState);
  });
});
