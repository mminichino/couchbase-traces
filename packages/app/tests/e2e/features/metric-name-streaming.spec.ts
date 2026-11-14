/**
 * Metric names in the chart explorer come from Couchbase metadata sampling
 * (no merge-tree index). Checks that the metrics source lists seeded gauge
 * names and that the combobox loads.
 */
import { ChartExplorerPage } from '../page-objects/ChartExplorerPage';
import { expect, test } from '../utils/base-test';
import { DEFAULT_METRICS_SOURCE_NAME } from '../utils/constants';

test.describe(
  'Metric name streaming',
  { tag: ['@charts', '@full-stack'] },
  () => {
    let chartExplorerPage: ChartExplorerPage;

    test.beforeEach(async ({ page }) => {
      chartExplorerPage = new ChartExplorerPage(page);
      await chartExplorerPage.goto();
    });

    test('lists metric names from the Couchbase metrics source', async ({
      page,
    }) => {
      const metricSelect = page.getByTestId('metric-name-selector');
      const metricOptions = page.locator(
        '[data-combobox-option="true"][value*=":::::::"]',
      );

      await test.step('Select the metrics source', async () => {
        await chartExplorerPage.chartEditor.waitForDataToLoad();
        await chartExplorerPage.chartEditor.selectSource(
          DEFAULT_METRICS_SOURCE_NAME,
        );
      });

      await test.step('Browsing offers at least one gauge metric', async () => {
        await expect(metricSelect).toBeVisible();
        await metricSelect.click();
        await expect(metricOptions.first()).toBeVisible({ timeout: 15000 });
        const values = await metricOptions.evaluateAll(nodes =>
          nodes.map(node => node.getAttribute('value') ?? ''),
        );
        const gauges = values.filter(v => v.endsWith(':::::::gauge'));
        expect(gauges.length).toBeGreaterThan(0);
      });
    });
  },
);
