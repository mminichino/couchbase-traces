test('search page', async ({ page }) => {
  await page.goto('/search?q=1');
});
