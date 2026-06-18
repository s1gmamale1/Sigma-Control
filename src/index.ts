// src/index.ts — the executable entry. esbuild bundles this (+ server.ts) into
// dist/server.cjs with a `#!/usr/bin/env node` banner; the package `bin` points
// at that file, so `sigma-control-mcp` (or `npx github:s1gmamale1/Sigma-Control`)
// boots the bridge directly. Importing server.ts in tests has no side effects.

import { main } from './server';

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write('sigma-control failed to start: ' + message + '\n');
  process.exit(1);
});
