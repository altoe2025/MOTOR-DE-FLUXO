import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const render = process.argv.includes('--render');
if (render) {
  const url = process.env.MOT_STAGE6_RENDER_BASE_URL;
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('MOT_STAGE6_RENDER_BASE_URL deve ser uma URL HTTPS explícita.'); }
  if (process.env.MOT_STAGE6_RENDER_APPROVED !== '1'
    || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || !parsed.hostname.endsWith('.onrender.com')
    || !process.env.MOT_STAGE6_RENDER_EMAIL || !process.env.MOT_STAGE6_RENDER_PASSWORD) {
    throw new Error('Smoke Render requer aprovação explícita, URL onrender.com HTTPS e credenciais efêmeras no ambiente.');
  }
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
