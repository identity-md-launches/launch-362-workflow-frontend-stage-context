import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  workers: 1,
  fullyParallel: false,
  outputDir: "./test-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "../docs/evidence/interactions.json" }],
  ],
  use: {
    baseURL: "http://localhost:4173/preview/",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://localhost:4173/preview/",
    reuseExistingServer: true,
  },
});
