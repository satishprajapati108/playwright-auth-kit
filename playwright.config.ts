import * as dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { sessionFilePath } from "./helpers/session-manager";

dotenv.config();

const sessionKey = process.env.SESSION_KEY || "default";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : "html",

  // Logs in (or reuses a saved session) once before any test runs.
  globalSetup: "./helpers/auth-setup.ts",

  use: {
    baseURL: process.env.BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Every test starts already authenticated via the session global-setup saved.
    storageState: sessionFilePath(sessionKey),
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
