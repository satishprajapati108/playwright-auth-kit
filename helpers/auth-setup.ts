import { chromium, FullConfig } from "@playwright/test";
import { resolveConfig } from "./env";
import { ensureSession } from "./session-manager";

/**
 * Runs once before the whole test run. Makes sure a fresh, saved
 * storageState exists on disk before any test file starts, so every
 * test project can just point `use.storageState` at it (see playwright.config.ts).
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const appConfig = await resolveConfig();
  const debug = process.env.LOGIN_DEBUG === "1" || process.env.LOGIN_DEBUG === "true";
  const browser = await chromium.launch({ headless: !debug, slowMo: debug ? 250 : 0 });
  try {
    await ensureSession(browser, appConfig);
  } finally {
    await browser.close();
  }
}
