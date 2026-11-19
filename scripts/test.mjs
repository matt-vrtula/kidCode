// Runs `vitest run` from the real path of the project folder.
//
// On Windows, a terminal opened in "c:\…" (lowercase drive letter, as VS Code does) makes Vitest
// load its own code twice, once as "c:" and once as "C:". The two copies don't share state, so every
// describe() fails with "Cannot read properties of undefined (reading 'config')".
// realpathSync.native returns the path with the drive letter's real casing. On other systems it changes nothing.
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.chdir(realpathSync.native(process.cwd()));
process.argv.splice(2, 0, 'run');
await import(pathToFileURL(resolve('node_modules/vitest/vitest.mjs')).href);
