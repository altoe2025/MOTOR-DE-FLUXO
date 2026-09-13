import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '--project=real-auth'],
  {
    cwd: webRoot,
    env: { ...process.env, MOT_REAL_AUTH_ONLY: '1' },
    stdio: 'inherit',
  },
);

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
