import { SearchPage } from '../page-objects/SearchPage';
import { expect, test } from '../utils/base-test';

test.describe('Correlated Metric Source', { tag: ['@full-stack'] }, () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    searchPage = new SearchPage(page);
  });

  test('should show alert when no correlated metric source is configured', async ({
    page,
  }) => {
    // Navigate to search page
    await searchPage.goto();

    // Select the source without metricSourceId (same otel_logs rows as E2E Logs)
    await searchPage.selectSource('E2E K8s Logs No Metrics');

    // Any matching row is enough: this test asserts the infrastructure-tab
    // alert when metricSourceId is unset. Use SQL so the lookup does not depend
    // on FTS wildcards / Lucene field queries against the Couchbase index.
    await searchPage.whereInput.selectLanguage('SQL');
    await searchPage.whereInput.fillSql("ServiceName = 'accounting'");
    await searchPage.submitButton.click();
    await page.waitForLoadState('networkidle');
    await searchPage.table.waitForRowsToPopulate();

    // Click on first row to open side panel
    await searchPage.table.clickFirstRow();

    // Click the Infrastructure tab
    await searchPage.sidePanel.clickTab('infrastructure');

    // Assert the "No correlated metric source" alert is visible
    await expect(page.getByText('No correlated metric source')).toBeVisible();
    await expect(
      page.getByText('does not have a correlated metric source'),
    ).toBeVisible();
  });
});
