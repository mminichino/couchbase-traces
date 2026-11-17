/**
 * The tile editor's Data Source picker only lists sources the current editor
 * mode and display type can query. Switching display type swaps a selection
 * that stops being valid for the first source the picker still offers.
 *
 * PromQL mode was dropped in Phase 10 (see docs/parity.md).
 */
import { DisplayType } from '@couchbase-traces/common-utils/dist/types';

import { DashboardPage } from '../page-objects/DashboardPage';
import { expect, test } from '../utils/base-test';
import {
  DEFAULT_LOGS_SOURCE_NAME,
  DEFAULT_METRICS_SOURCE_NAME,
  DEFAULT_TRACES_SOURCE_NAME,
} from '../utils/constants';

test.describe(
  'Chart editor data source filtering',
  { tag: ['@dashboard', '@full-stack'] },
  () => {
    test('keeps a queryable source across display type changes, and swaps for heatmap modes', async ({
      page,
    }) => {
      test.setTimeout(120000);

      const dashboardPage = new DashboardPage(page);
      const editor = dashboardPage.chartEditor;

      await dashboardPage.goto();
      await dashboardPage.openNewTileEditor();
      await editor.selectSource(DEFAULT_LOGS_SOURCE_NAME);

      await test.step('A source the new display type can query is left alone', async () => {
        await editor.setChartType(DisplayType.Table);
        await expect(editor.source).toHaveValue(DEFAULT_LOGS_SOURCE_NAME);
      });

      await test.step('Heatmap swaps in the first trace source', async () => {
        await editor.setChartType(DisplayType.Heatmap);
        // Heatmaps read a duration, so only trace sources qualify; the picker
        // sorts by name, putting `E2E Traces` ahead of the two MV variants.
        await expect(editor.source).toHaveValue(DEFAULT_TRACES_SOURCE_NAME);

        await editor.openSourcePicker();
        await expect(editor.sourceOption(DEFAULT_LOGS_SOURCE_NAME)).toHaveCount(
          0,
        );
        await editor.closeSourcePicker();
      });

      await test.step('A series heatmap offers metric sources', async () => {
        await editor.setHeatmapMode('Series');
        await expect(editor.source).toHaveValue(DEFAULT_TRACES_SOURCE_NAME);
        await editor.selectSource(DEFAULT_METRICS_SOURCE_NAME);
        await expect(editor.source).toHaveValue(DEFAULT_METRICS_SOURCE_NAME);
      });

      await test.step('Switching back to distribution swaps in a trace source', async () => {
        await editor.setHeatmapMode('Distribution');
        await expect(editor.source).toHaveValue(DEFAULT_TRACES_SOURCE_NAME);
      });
    });
  },
);
