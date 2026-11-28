import { screen } from '@testing-library/react';

import { LLMSpanSubpanel } from '@/llm/components/LLMSpanSubpanel';

// A flat stand-in for Badge, so text and props are read from one element.
jest.mock('@/components/Badge/Badge', () => ({
  ...jest.requireActual('@/components/Badge/Badge'),
  Badge: ({ text, state }: { text: React.ReactNode; state?: string }) => (
    <span data-testid="badge" data-state={state}>
      {text}
    </span>
  ),
}));

describe('LLMSpanSubpanel', () => {
  it('renders a badge with a distinct state for each span attribute', () => {
    renderWithMantine(
      <LLMSpanSubpanel
        info={{
          model: 'claude-fable-5',
          provider: 'anthropic',
          operation: 'chat',
          toolName: 'get_weather',
          agentName: 'planner',
          usage: {},
          params: {},
        }}
      />,
    );

    const badges = screen.getAllByTestId('badge');
    expect(
      badges.map(b => [b.textContent, b.getAttribute('data-state')]),
    ).toEqual([
      ['claude-fable-5', 'info'],
      ['anthropic', 'neutral'],
      ['chat', null],
      ['get_weather', 'warning'],
      ['planner', 'success'],
    ]);
  });

  it('omits badges for missing attributes', () => {
    renderWithMantine(
      <LLMSpanSubpanel
        info={{ model: 'claude-fable-5', usage: {}, params: {} }}
      />,
    );

    expect(screen.getAllByTestId('badge')).toHaveLength(1);
  });
});
