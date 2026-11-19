import { alertQueryAttribution } from '@/tasks/checkAlerts';
import { AlertTaskType } from '@/tasks/checkAlerts/providers';

// Real AlertDetails comes from the metadata store. These tests only need the
// few fields the tag reads.

const details = (overrides: Record<string, unknown>): any => ({
  alert: { id: 'alert-1' },
  ...overrides,
});

describe('alertQueryAttribution', () => {
  it('reports the saved search for a saved-search alert', () => {
    expect(
      alertQueryAttribution(
        details({
          taskType: AlertTaskType.SAVED_SEARCH,
          savedSearch: { id: 'search-1' },
          source: { id: 'source-1' },
        }),
      ),
    ).toMatchObject({
      surface: 'alert',
      alert: 'alert-1',
      search: 'search-1',
      source: 'source-1',
    });
  });

  it('reports the dashboard and tile for a tile alert', () => {
    expect(
      alertQueryAttribution(
        details({
          taskType: AlertTaskType.TILE,
          dashboard: { id: 'dash-1' },
          tile: { id: 'tile-1' },
          source: { id: 'source-1' },
        }),
      ),
    ).toMatchObject({ dashboard: 'dash-1', tile: 'tile-1' });
  });

  it('omits the source when the alert has none', () => {
    expect(
      alertQueryAttribution(
        details({ taskType: AlertTaskType.INLINE, chartConfig: {} }),
      ),
    ).toMatchObject({ surface: 'alert', source: undefined });
  });

  it('does not throw on a partially populated alert', () => {
    const partial: any = { taskType: AlertTaskType.SAVED_SEARCH };
    expect(() => alertQueryAttribution(partial)).not.toThrow();
  });
});
