import { DisplayType } from '@couchbase-traces/common-utils/dist/types';

import { ChartExplorerPage } from '../page-objects/ChartExplorerPage';
import { expect, test } from '../utils/base-test';
import {
  DEFAULT_METRICS_SOURCE_NAME,
  E2E_EXP_HISTOGRAM_METRIC_NAME,
} from '../utils/constants';

test.describe(
  'Exponential histogram metric explorer',
  { tag: ['@charts'] },
  () => {
    let chartExplorerPage: ChartExplorerPage;

    test.beforeEach(async ({ page }) => {
      chartExplorerPage = new ChartExplorerPage(page);
      await chartExplorerPage.goto();
    });

    test('charts an exponential histogram p95 on the metrics source', async () => {
      await test.step('Select metrics source and exponential histogram', async () => {
        await chartExplorerPage.chartEditor.waitForDataToLoad();
        await chartExplorerPage.chartEditor.setChartType(DisplayType.Line);
        await chartExplorerPage.chartEditor.selectSource(
          DEFAULT_METRICS_SOURCE_NAME,
        );
        await chartExplorerPage.chartEditor.selectMetric(
          E2E_EXP_HISTOGRAM_METRIC_NAME,
          `${E2E_EXP_HISTOGRAM_METRIC_NAME}:::::::exponential histogram`,
        );
        await chartExplorerPage.chartEditor.selectAggFn('95th Percentile');
      });

      await test.step('Chart renders', async () => {
        await expect(chartExplorerPage.getFirstChart()).toBeVisible({
          timeout: 30000,
        });
      });
    });
  },
);
