/**
 * Regression guard for: histogram "X Results" count must reflect the user's
 * exact selected time range, not a granularity-bucket-aligned expansion of it.
 *
 * We seed dedicated log documents in Couchbase: 10 events spaced 1s apart on
 * fractional-second offsets, anchored to a 15-second-aligned reference time.
 */
import { SearchPage } from '../../page-objects/SearchPage';
import { expect, test } from '../../utils/base-test';
import { upsertE2eLogRow } from '../../utils/db-helpers';

async function seedCountMismatchLogs(): Promise<{
  refMs: number;
  markerService: string;
}> {
  const markerService = `count_mismatch_${Date.now()}_${Math.floor(
    Math.random() * 1_000_000,
  )}`;

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const refMs = Math.floor(fiveMinAgo / 15_000) * 15_000;

  for (let i = 0; i < 10; i++) {
    const tsMs = refMs + i * 1000 + 500;
    await upsertE2eLogRow({
      Timestamp: new Date(tsMs).toISOString(),
      TraceId: '',
      SpanId: '',
      TraceFlags: 0,
      SeverityText: 'info',
      SeverityNumber: 0,
      ServiceName: markerService,
      Body: `count test ${i}`,
      ResourceSchemaUrl: '',
      ResourceAttributes: {
        'service.name': markerService,
        environment: 'test',
      },
      ScopeSchemaUrl: '',
      ScopeName: '',
      ScopeVersion: '',
      ScopeAttributes: {},
      LogAttributes: {},
    });
  }

  return { refMs, markerService };
}

function toPickerFormat(tsMs: number): string {
  const d = new Date(tsMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

test.describe(
  'Search histogram count matches table for sub-bucket time ranges',
  { tag: ['@full-stack', '@search'] },
  () => {
    test('count is 5 (user range) not 10 (bucket-aligned range)', async ({
      page,
    }) => {
      const { refMs, markerService } = await seedCountMismatchLogs();

      const searchPage = new SearchPage(page);
      await searchPage.goto();
      await expect(searchPage.form).toBeVisible();

      const startMs = refMs + 2_000;
      const endMs = refMs + 7_000;

      await searchPage.timePicker.open();
      await searchPage.timePicker.disableRelativeTime();
      await searchPage.timePicker.selectRangeMode();
      await searchPage.timePicker.setCustomTimeRange(
        toPickerFormat(startMs),
        toPickerFormat(endMs),
      );

      await searchPage.page.waitForURL(
        u => new URL(u).searchParams.get('from') === String(startMs),
      );

      await searchPage.performSearch(`ServiceName:"${markerService}"`);

      await searchPage.waitForTotalCountLoaded();

      await expect(searchPage.table.getRows()).toHaveCount(5);
      await expect(searchPage.totalCountText).toHaveText('5 Results');
    });
  },
);
