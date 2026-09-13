import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8021',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: '.venv\\Scripts\\python.exe -m tests.web_api.run_e2e',
    cwd: '..',
    url: 'http://127.0.0.1:8021/api/v1/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
