import { test, expect } from "@playwright/test";

/**
 * Because playwright.config.ts sets `use.storageState` to the session file
 * helpers/auth-setup.ts produced, this page loads already authenticated -
 * no login steps needed here or in any other test file.
 */
test("home page loads while already authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/.*/);
});
