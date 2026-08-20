import { test as base } from "@playwright/test";
import { resolveConfig } from "../helpers/env";
import { ensureManualSession } from "../helpers/auth-setup";

/**
 * This overrides Playwright's built-in `context` fixture (which `page`
 * depends on) so every test using this `test` gets a self-healing session:
 * if .auth/<key>.session.json already exists, this is just a fast file read;
 * if it doesn't (e.g. deleted, or an IDE test runner skipped globalSetup for
 * a single ad-hoc run), it triggers the same manual-login flow right here,
 * per test, instead of throwing ENOENT.
 *
 * Import `test`/`expect` from here (not "@playwright/test" directly) in
 * every spec file so this self-healing applies everywhere. For a different
 * account, set SESSION_KEY in .env and run - there's currently no per-test
 * override of it.
 */
export const test = base.extend({
  context: async ({ browser }, use) => {
    const config = await resolveConfig();
    const authFile = await ensureManualSession(config);
    const context = await browser.newContext({ storageState: authFile });
    await use(context);
    await context.close();
  },
});

export { expect } from "@playwright/test";
