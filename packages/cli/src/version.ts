/**
 * CLI version, inlined at build time: tsup sets `env.npm_package_version` and
 * the `compile*` scripts pass `bun build --env=npm_package_version`. Do not
 * read `../package.json` at runtime; a `bun --compile` binary does not contain
 * it, so every command crashed on startup (v1.0.0).
 */
export const CLI_VERSION: string = process.env.npm_package_version ?? '0.0.0';
