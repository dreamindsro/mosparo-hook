import { defineConfig, devices } from '@playwright/test';
import { project } from './tests/fake-mosparo/server.mjs';

// The end-to-end tests run the example app (examples/next) in a real browser
// against the stand-in mosparo server.
const MOSPARO_URL = 'http://127.0.0.1:4310';
const APP_URL = 'http://127.0.0.1:4311';

export default defineConfig({
  testDir: 'e2e',
  // The tests change the settings of the one mosparo server they share.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node tests/fake-mosparo/server.mjs 4310',
      url: `${MOSPARO_URL}/__control`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build && npm run start -- --hostname 127.0.0.1 --port 4311',
      cwd: 'examples/next',
      url: APP_URL,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_MOSPARO_HOST: MOSPARO_URL,
        NEXT_PUBLIC_MOSPARO_UUID: project.uuid,
        NEXT_PUBLIC_MOSPARO_PUBLIC_KEY: project.publicKey,
        MOSPARO_PRIVATE_KEY: project.privateKey,
      },
    },
  ],
});
