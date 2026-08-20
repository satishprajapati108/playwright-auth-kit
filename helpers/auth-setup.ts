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
  const browser = await chromium.launch();
  try {
    await ensureSession(browser, appConfig);
  } finally {
    await browser.close();
  }
}
