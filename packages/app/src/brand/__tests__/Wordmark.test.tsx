import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';

import { BRAND_DISPLAY_NAME, useLogomark, useWordmark } from '@/brand';
import Logomark from '@/brand/Logomark';
import { useResolvedColorScheme } from '@/useUserPreferences';

jest.mock('@/useUserPreferences', () => ({
  useResolvedColorScheme: jest.fn(),
}));

const mockScheme = useResolvedColorScheme as jest.Mock;

function Lockup() {
  return useWordmark();
}

function SquareMark() {
  return useLogomark({ size: 22 });
}

describe('Wordmark', () => {
  it('names the product', () => {
    expect(BRAND_DISPLAY_NAME).toBe('Couchbase Traces');
  });

  it('renders the light logo in light mode, with the name as alt text', () => {
    mockScheme.mockReturnValue('light');
    render(
      <MantineProvider>
        <Lockup />
      </MantineProvider>,
    );

    const img = screen.getByRole('img', { name: 'Couchbase Traces' });
    expect(img).toHaveAttribute('src', '/brand/wordmark-light.svg');
    expect(img).toHaveAttribute('height', '23');
  });

  it('renders the dark logo in dark mode', () => {
    mockScheme.mockReturnValue('dark');
    render(
      <MantineProvider>
        <Lockup />
      </MantineProvider>,
    );

    expect(
      screen.getByRole('img', { name: 'Couchbase Traces' }),
    ).toHaveAttribute('src', '/brand/wordmark-dark.svg');
  });

  it('renders the full logo only, not the mark beside text', () => {
    mockScheme.mockReturnValue('light');
    const { container } = render(
      <MantineProvider>
        <Lockup />
      </MantineProvider>,
    );

    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('svg')).toBeNull();
    expect(container).not.toHaveTextContent('Couchbase Traces');
  });
});

describe('Logomark', () => {
  it('renders the decorative mark in a square box by default', () => {
    const { container } = render(<SquareMark />);

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/brand/logomark.svg');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('width', '22');
    expect(img).toHaveAttribute('height', '22');
  });

  it('defaults to 16px', () => {
    const { container } = render(<Logomark />);

    expect(container.querySelector('img')).toHaveAttribute('height', '16');
  });

  it('follows the symbol aspect ratio for fit="symbol"', () => {
    const { container } = render(<Logomark size={30} fit="symbol" />);

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('height', '30');
    expect(img).toHaveAttribute('width', '30');
  });
});
