import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
if (!existsSync('.open-next/worker.js') || !existsSync('.dev.vars')) {
  throw new Error('Run npm run setup:local and npm run build:worker first.');
}
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const persist = resolve('.local-tests', 'worker-' + randomUUID());
const migration = spawnSync(
  process.execPath,
  [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persist],
  { stdio: 'inherit' },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
const worker = spawn(
  process.execPath,
  [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', '3000', '--persist-to', persist],
  { stdio: 'inherit' },
);
worker.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => worker.kill(signal));
