export function registerSearch({ registerTool }: { registerTool: (...args: unknown[]) => void }) {
  registerTool('fixture_search', { description: 'Search' }, async () => ({}));
}
