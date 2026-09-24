import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Run after a production build with synthetic public Supabase configuration.
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const python = spawnSync(process.env.MOT_E2E_PYTHON ?? 'python', ['-c', `
import json
from servidor.config import Settings
from servidor.security_headers import security_headers
settings = Settings(
    _env_file=None, app_env="production", web_dist_dir="web/dist",
    supabase_url="https://example.supabase.co",
    supabase_jwt_issuer="https://example.supabase.co/auth/v1",
    supabase_jwt_audience="authenticated",
    supabase_allowed_user_ids="00000000-0000-4000-8000-000000000001",
    motor_build_sha="a" * 40, chat_enabled=False,
)
print(json.dumps(security_headers(settings)))
`], { cwd: resolve(webRoot, '..'), encoding: 'utf8', timeout: 30_000 });
if (python.error || python.status !== 0) {
  throw new Error('Cannot load backend security headers; set MOT_E2E_PYTHON to the project Python environment.');
}
const headers = JSON.parse(python.stdout);
assert.ok(headers['Content-Security-Policy'], 'Backend CSP is missing');
const dist = await realpath(resolve(webRoot, 'dist'));
const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const asset = pathname === '/login' ? 'index.html' : pathname.startsWith('/assets/') ? pathname.slice(1) : null;
    if (asset === null) throw new Error('Unknown route');
    const candidate = await realpath(resolve(dist, asset));
    const contained = relative(dist, candidate);
    if (contained.startsWith('..') || isAbsolute(contained)) throw new Error('Outside dist');
    const body = await readFile(candidate);
    response.writeHead(200, { ...headers, 'Content-Type': mime[extname(candidate)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
    response.end('Not found');
  }
});

let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const externalRequests = [];
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      externalRequests.push('External request blocked');
      await route.abort();
    } else {
      await route.continue();
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    globalThis.cspViolations = [];
    globalThis.addEventListener('securitypolicyviolation', (event) => {
      globalThis.cspViolations.push(event.effectiveDirective);
    });
  });
  await page.goto(`${origin}/login`);
  await page.waitForLoadState('networkidle');
  const violations = await page.evaluate(() => globalThis.cspViolations);
  assert.deepEqual(violations, [], 'Production CSP blocked browser execution');
  assert.deepEqual(errors, [], 'Production build raised a browser error');
  assert.deepEqual(externalRequests, [], 'Login smoke attempted an external provider request');
  await page.getByRole('heading', { name: 'Entrar', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  console.log('csp_smoke=PASS production_headers login_visible no_violations no_provider_requests');
} finally {
  try {
    await browser?.close();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
