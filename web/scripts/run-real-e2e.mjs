import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { requireRenderSmokeConfig } from './render-smoke-gate.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const render = process.argv.includes('--render');
if (render) {
  requireRenderSmokeConfig(process.env);
}
const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', render ? '--project=render-smoke' : '--project=real-auth'],
  {
    cwd: webRoot,
    env: { ...process.env, ...(render ? { MOT_STAGE6_RENDER_ONLY: '1' } : { MOT_REAL_AUTH_ONLY: '1' }) },
    stdio: 'inherit',
  },
);

if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
