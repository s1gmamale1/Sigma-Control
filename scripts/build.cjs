#!/usr/bin/env node
// Bundle src/index.ts (+ server.ts) → dist/server.cjs, a single self-contained
// CommonJS file with a node shebang. esbuild is fetched on demand via npx, so
// the package itself declares NO dependencies (instant `npx github:…` installs).

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist', 'server.cjs');

execFileSync(
  'npx',
  [
    '--yes',
    'esbuild@0.24.2',
    path.join(root, 'src', 'index.ts'),
    '--bundle',
    '--platform=node',
    '--target=node18',
    '--format=cjs',
    '--outfile=' + out,
    '--banner:js=#!/usr/bin/env node',
  ],
  { stdio: 'inherit' },
);

require('node:fs').chmodSync(out, 0o755);
process.stdout.write('[sigma-control] built ' + path.relative(root, out) + '\n');
