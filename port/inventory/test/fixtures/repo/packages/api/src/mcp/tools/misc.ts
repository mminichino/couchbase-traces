export function registerMisc(server: { tool(...args: unknown[]): void }) {
  server.tool('fixture_misc', {}, async () => ({}));
}
