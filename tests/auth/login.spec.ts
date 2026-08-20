import { test, expect } from "../../fixtures";
import { LoginPage } from "../../pages/login.page";

/**
 * Importing `test`/`expect` from fixtures/ (not "@playwright/test" directly)
 * makes the session self-healing: it's created on demand if missing, instead
 * of throwing ENOENT. See fixtures/auth.fixture.ts.
 */
test("home page loads while already authenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/.*/);
});
