import { parseStatsRange, statsWindow } from '@/utils/couchbaseStats';

describe('statistics parsing', () => {
  it('keeps each series at or under 300 points', () => {
    const hour = statsWindow(0, 60 * 60 * 1000);
    expect(hour.start).toBeLessThan(0);
    expect(hour.end).toBeLessThan(0);
    expect((hour.end - hour.start) / hour.step).toBeLessThanOrEqual(300);
    const day = statsWindow(0, 24 * 60 * 60 * 1000);
    expect((day.end - day.start) / day.step).toBeLessThanOrEqual(300);
    const recent = statsWindow(Date.now() - 60 * 60 * 1000, Date.now());
    expect(recent.start).toBeLessThan(recent.end);
    expect(recent.end).toBeLessThan(0);
    expect((recent.end - recent.start) / recent.step).toBeLessThanOrEqual(300);
  });

  it('reads per-node samples and converts second timestamps to milliseconds', () => {
    const series = parseStatsRange(
      [
        {
          metric: {
            name: 'sys_cpu_utilization_rate',
            nodes: ['ns_1@127.0.0.1'],
          },
          values: [
            [1_700_000_000, '12.5'],
            [1_700_000_060, '13'],
          ],
          applyFunctions: ['avg'],
        },
      ],
      false,
    );
    expect(series).toEqual([
      {
        node: 'ns_1@127.0.0.1',
        points: [
          [1_700_000_000_000, 12.5],
          [1_700_000_060_000, 13],
        ],
      },
    ]);
  });

  it('rates a counter when the server did not apply the rate function', () => {
    const series = parseStatsRange(
      [
        {
          metric: { node: 'n1' },
          values: [
            [1_700_000_000_000, 0],
            [1_700_000_010_000, 50],
          ],
          applyFunctions: [],
        },
      ],
      true,
    );
    expect(series[0]?.points).toEqual([[1_700_000_010_000, 5]]);
  });

  it('reads the data array inside each posted-metric result', () => {
    const series = parseStatsRange(
      [
        {
          data: [
            {
              metric: { nodes: ['n1'], name: 'sys_cpu_utilization_rate' },
              values: [[1_700_000_000, '9']],
            },
          ],
          errors: [],
        },
      ],
      false,
    );
    expect(series).toEqual([{ node: 'n1', points: [[1_700_000_000_000, 9]] }]);
  });

  it('keeps a rate the server already applied', () => {
    const series = parseStatsRange(
      {
        data: [
          {
            metric: { nodes: ['n1'] },
            values: [
              [1_700_000_000_000, '4'],
              [1_700_000_010_000, '6'],
            ],
            applyFunctions: ['rate'],
          },
        ],
      },
      true,
    );
    expect(series[0]?.points).toEqual([
      [1_700_000_000_000, 4],
      [1_700_000_010_000, 6],
    ]);
  });
});
