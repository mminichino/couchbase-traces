import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import TeamQueryConfigSection from '@/components/TeamSettings/TeamQueryConfigSection';

const mutate = jest.fn();

jest.mock('@/api', () => ({
  __esModule: true,
  default: {
    useMe: () => ({ data: { team: {} }, refetch: jest.fn() }),
    useUpdateClickhouseSettings: () => ({ mutate, isPending: false }),
  },
}));

function setting(label: string): HTMLElement {
  const text = screen.getByText(label);
  const stack = text.parentElement?.parentElement;
  if (stack == null) throw new Error(`No setting stack for ${label}`);
  return stack;
}

describe('TeamQueryConfigSection', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('shows neutral wording and both Couchbase controls', () => {
    renderWithMantine(<TeamQueryConfigSection />);

    expect(screen.getByText('Query settings')).toBeInTheDocument();
    expect(
      screen.getByText(/each setting says which sources it applies to/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Applies to all sources.').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'On Couchbase sources, the number of recent documents sampled to list fields and values.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Couchbase scan consistency')).toBeInTheDocument();
    expect(screen.getByText('Fast (not bounded)')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Consistent waits for indexes to include all writes made before the query; it is slower under heavy ingest.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Couchbase max parallelism')).toBeInTheDocument();
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Upper bound on parallel execution per query. The server's own limit still applies.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/clickhouse/i)).not.toBeInTheDocument();
  });

  it('saves scan consistency and max parallelism', async () => {
    const user = userEvent.setup();
    renderWithMantine(<TeamQueryConfigSection />);

    await user.click(
      within(setting('Couchbase scan consistency')).getByRole('button', {
        name: 'Change',
      }),
    );
    await user.click(screen.getByRole('combobox'));
    fireEvent.click(
      screen.getByRole('option', {
        name: 'Consistent (request plus)',
        hidden: true,
      }),
    );
    await user.click(
      within(setting('Couchbase scan consistency')).getByRole('button', {
        name: 'Save',
      }),
    );
    expect(mutate).toHaveBeenCalledWith(
      { queryScanConsistency: 'request_plus' },
      expect.any(Object),
    );

    await user.click(
      within(setting('Couchbase max parallelism')).getByRole('button', {
        name: 'Change',
      }),
    );
    const parallelism = setting('Couchbase max parallelism');
    await user.clear(within(parallelism).getByRole('spinbutton'));
    await user.type(within(parallelism).getByRole('spinbutton'), '8');
    await user.click(within(parallelism).getByRole('button', { name: 'Save' }));
    expect(mutate).toHaveBeenCalledWith(
      { queryMaxParallelism: 8 },
      expect.any(Object),
    );
  });
});
