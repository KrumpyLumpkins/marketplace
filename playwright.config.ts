import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3400",
    trace: "on-first-retry",
    launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH },
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {command:"node services/marketplace-backend/src/demo.mjs",url:"http://127.0.0.1:3100/health/live",env:{MARKETPLACE_PORT:"3100",MARKETPLACE_CHAIN:"SN_MAIN",MARKETPLACE_DB:"services/marketplace-backend/data/e2e.sqlite",MARKETPLACE_ORIGIN:"http://127.0.0.1:3400"},reuseExistingServer:!process.env.CI},
    {command:"pnpm start --port 3400",url:"http://127.0.0.1:3400",reuseExistingServer:false,timeout:120000},
  ],
});
