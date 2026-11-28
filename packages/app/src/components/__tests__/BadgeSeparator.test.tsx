import { screen } from '@testing-library/react';

import { Badge } from '@/components/Badge/Badge';
import { Separator } from '@/components/Separator/Separator';

describe('Badge', () => {
  it('defaults to an opaque, medium, default badge', () => {
    renderWithMantine(<Badge text="Ok" data-testid="b" />);
    const badge = screen.getByTestId('b');
    expect(badge).toHaveTextContent('Ok');
    expect(badge).toHaveAttribute('data-state', 'default');
    expect(badge).toHaveAttribute('data-type', 'opaque');
    expect(badge).toHaveAttribute('data-size', 'md');
  });

  it('passes state, type, size, and DOM props through', () => {
    renderWithMantine(
      <Badge
        text="Alert"
        state="danger"
        type="solid"
        size="sm"
        title="t"
        data-testid="b"
      />,
    );
    const badge = screen.getByTestId('b');
    expect(badge).toHaveAttribute('data-state', 'danger');
    expect(badge).toHaveAttribute('data-type', 'solid');
    expect(badge).toHaveAttribute('data-size', 'sm');
    expect(badge).toHaveAttribute('title', 't');
  });

  it.each([
    ['start', 0],
    ['end', 1],
  ] as const)('places the dot icon at the %s', (iconDir, index) => {
    renderWithMantine(
      <Badge text="Pending" icon="dot" iconDir={iconDir} data-testid="b" />,
    );
    const children = Array.from(screen.getByTestId('b').children);
    expect(children).toHaveLength(2);
    expect(children[index]).toHaveAttribute('aria-hidden');
  });

  it('renders non-string content', () => {
    renderWithMantine(<Badge text={<strong>42</strong>} data-testid="b" />);
    expect(screen.getByText('42').tagName).toBe('STRONG');
  });
});

describe('Separator', () => {
  it('is a horizontal separator with no spacing by default', () => {
    renderWithMantine(<Separator data-testid="s" />);
    const sep = screen.getByTestId('s');
    expect(sep).toHaveAttribute('role', 'separator');
    expect(sep).not.toHaveAttribute('aria-orientation');
    expect(sep).toHaveAttribute('data-orientation', 'horizontal');
    expect(sep).toHaveAttribute('data-size', 'xs');
  });

  it('announces vertical orientation', () => {
    renderWithMantine(
      <Separator orientation="vertical" size="lg" data-testid="s" />,
    );
    const sep = screen.getByTestId('s');
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('data-size', 'lg');
  });

  it('hides decorative lines from assistive technology', () => {
    renderWithMantine(<Separator decorative data-testid="s" />);
    expect(screen.getByTestId('s')).toHaveAttribute('role', 'none');
  });
});
