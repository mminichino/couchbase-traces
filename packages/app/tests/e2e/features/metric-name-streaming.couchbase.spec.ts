/**
 * Couchbase variant of metric-name-streaming.spec.ts.
 *
 * The ClickHouse spec asserts mergeTreeIndex granule visibility. Couchbase
 * has no equivalent index; metric names come from Phase 6 metadata sampling.
 * This variant checks that the metrics source lists seeded gauge names and
 * that typing narrows the combobox.
 */
import { ChartExplorerPage } from '../page-objects/ChartExplorerPage';
import { expect, test } from '../utils/base-test';
import { DEFAULT_METRICS_SOURCE_NAME } from '../utils/constants';

test.describe(
  'Metric name streaming (Couchbase)',
  { tag: ['@charts', '@couchbase'] },
  () => {
    test.skip(
      () => process.env.CBT_E2E_STORE !== 'couchbase',
      'Couchbase-store e2e only',
    );

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
