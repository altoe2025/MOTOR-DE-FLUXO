import { defineConfig, devices } from '@playwright/test';

const localBaseUrl = 'http://127.0.0.1:8021';
const realBaseUrl = process.env.MOT_REAL_AUTH_BASE_URL;
const runLocalServer = process.env.MOT_REAL_AUTH_ONLY !== '1';
const localPython = process.env.CI === 'true'
  ? 'python'
  : process.platform === 'win32'
    ? '.venv\\Scripts\\python.exe'
    : '.venv/bin/python';

export default defineConfig({
  testDir: './e2e',
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
      testMatch: /foundation\.spec\.ts/,
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
  ],
  webServer: runLocalServer ? {
    command: `${localPython} -m tests.web_api.run_e2e`,
    cwd: '..',
    url: `${localBaseUrl}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  } : undefined,
});
