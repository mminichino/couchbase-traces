import { expect, test } from '@playwright/test';

// Runs from Phase 7's Couchbase e2e mode. ClickHouse modes exclude @couchbase.
test.describe('Couchbase cluster', { tag: '@couchbase' }, () => {
  test('shows queries, infrastructure, and status', async ({ page }) => {
    await page.goto('/cluster');
    await expect(page.getByRole('tab', { name: 'Queries' })).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Infrastructure' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Status' })).toBeVisible();
    await page.getByRole('tab', { name: 'Status' }).click();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });
});
