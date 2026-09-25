import { defineConfig, devices } from '@playwright/test';

const localPort = process.env.MOT_E2E_PORT ?? '8021';
const localBaseUrl = `http://127.0.0.1:${localPort}`;
const realBaseUrl = process.env.MOT_REAL_AUTH_BASE_URL;
const renderBaseUrl = process.env.MOT_STAGE6_RENDER_BASE_URL;
const runLocalServer = process.env.MOT_REAL_AUTH_ONLY !== '1' && process.env.MOT_STAGE6_RENDER_ONLY !== '1';
const localPython = process.env.MOT_E2E_PYTHON ?? (process.env.CI === 'true'
  ? 'python'
  : process.platform === 'win32'
    ? '.venv\\Scripts\\python.exe'
    : '.venv/bin/python');
const localPythonCommand = localPython.includes(' ') ? `"${localPython}"` : localPython;

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.MOT_E2E_OUTPUT_DIR ?? 'test-results',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: localBaseUrl,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'local',
      testMatch: /(?:foundation|study-.*|company-profiles|diagnostic-jobs|stage2-regression|stage4-(?:mvp|evolution-b)|stage5-replay|import-observed-case|stage6-demo-communication|stage6-chat|stage6-presentation|stage6-accessibility|stage6-visual|stage6-performance|stage6-acceptance)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'real-auth',
      testMatch: /real-auth\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: realBaseUrl ?? 'http://127.0.0.1:8022',
        trace: 'off',
      },
    },
    {
      name: 'render-smoke',
      testMatch: /stage6-render-smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: renderBaseUrl ?? 'https://unconfigured.invalid',
        trace: 'off',
      },
    },
  ],
  webServer: runLocalServer ? {
    command: `${localPythonCommand} -m tests.web_api.run_e2e`,
    cwd: '..',
    url: `${localBaseUrl}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  } : undefined,
});
