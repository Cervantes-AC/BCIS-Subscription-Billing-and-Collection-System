import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Some parent processes (for example, test runners) set this flag so Electron
// launches as Node. Remove it before electron-vite starts its Electron child.
delete process.env.ELECTRON_RUN_AS_NODE;

const require = createRequire(import.meta.url);
const electronVitePackage = require.resolve('electron-vite/package.json');
const cliPath = join(dirname(electronVitePackage), 'bin', 'electron-vite.js');
const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  console.error('Could not start electron-vite:', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
