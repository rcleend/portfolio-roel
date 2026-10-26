import { defineConfig, devices } from '@playwright/test';

// Override per checkout (E2E_PORT) so parallel worktrees never test each other's server.
const PORT = Number(process.env.E2E_PORT ?? 4317);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // The @frames tests time real frames at 6x CPU throttling, where other workers' pages contend for the same cores:
    // they run one at a time after every other test (a teardown project runs once the project it tears down is done,
    // and alone when a filter selects only it).
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@frames/, teardown: 'frames' },
    { name: 'frames', use: { ...devices['Desktop Chrome'] }, grep: /@frames/, workers: 1 },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
