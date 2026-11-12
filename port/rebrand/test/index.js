// Entry shim so `node --test port/rebrand/test/` works on Node versions that treat a
// directory argument as a module path. Imports every *.test.mjs in this directory.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(here).filter(n => n.endsWith('.test.mjs')).sort()) {
  await import(pathToFileURL(join(here, f)).href);
}
