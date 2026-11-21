import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4197/mu-boxer/',
    launchOptions: {
      executablePath: existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined,
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } } },
  ],
  webServer: [{
    command: 'npm run preview -- --port 4197 --strictPort --base=/mu-boxer/',
    url: 'http://127.0.0.1:4197/mu-boxer/',
    reuseExistingServer: !process.env.CI,
  }, {
    command: 'npm run dev -- --port 4198 --strictPort --base=/mu-boxer/',
    url: 'http://127.0.0.1:4198/mu-boxer/',
    reuseExistingServer: !process.env.CI,
  }],
});
