import { test as base, BrowserContext, Page } from "@playwright/test";
import { resolveConfig } from "../helpers/env";
import { ensureSession } from "../helpers/session-manager";

/**
 * Extends the base test with fixtures that inject an authenticated context/page
 * on demand, for specs that need a session other than the one playwright.config.ts
 * already applies globally (e.g. a different SESSION_KEY / role within one spec).
 */
export const test = base.extend<{ authedContext: BrowserContext; authedPage: Page }>({
  authedContext: async ({ browser }, use) => {
    const config = await resolveConfig();
    const storageStatePath = await ensureSession(browser, config);
    const context = await browser.newContext({ storageState: storageStatePath });
    await use(context);
    await context.close();
  },

  authedPage: async ({ authedContext }, use) => {
    const page = await authedContext.newPage();
    await use(page);
  },
});

export { expect } from "@playwright/test";
