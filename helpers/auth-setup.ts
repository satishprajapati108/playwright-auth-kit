import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { AppConfig, resolveConfig } from "./env";
import { sessionFilePath } from "./session-manager";
import { LoginPage } from "../pages/login.page";

/**
 * Returns the path to a saved session for this config, opening a real
 * (non-headless) browser to log in first if one doesn't exist yet - once
 * saved, that file is reused forever (delete it yourself to force a
 * re-login).
 *
 * If BOTH LOGIN_USERNAME and LOGIN_PASSWORD are set, both fields get filled
 * in and submit gets clicked automatically. If either one is missing, NEITHER
 * field is pre-filled - you type both in and click login by hand. Be aware
 * the automatic-click path is a known risk on apps with bot protection
 * (e.g. Cloudflare Turnstile): a scripted click can produce a session that
 * gets invalidated the moment it's reloaded into a fresh context later. If
 * that happens, leave the credentials out of .env to force the manual path,
 * which doesn't have this problem.
 */
export async function ensureManualSession(config: AppConfig): Promise<string> {
  const authFile = sessionFilePath(config.sessionKey);

  if (fs.existsSync(authFile)) {
    console.log(`[session] Using saved session for "${config.sessionKey}" (${authFile})`);
    return authFile;
  }

  console.log("\n=== Manual login required ===");
  console.log("A browser window will open. Log in by hand, then it will close automatically.");
  console.log("Your session will be saved and reused for every test run after this.\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  const loginPage = new LoginPage(page);

  await loginPage.open(config.baseUrl);

  const hasBothCredentials = Boolean(config.username && config.password);

  // Only pre-fill when BOTH are set - pre-filling just one and leaving the
  // other blank is confusing (you'd be typing into a form that's already
  // half wrong-looking) and defeats the point of "manual means both fields
  // are yours to fill in".
  if (hasBothCredentials) {
    await loginPage.emailInput.pressSequentially(config.username);
    await loginPage.passwordInput.pressSequentially(config.password);
  }

  if (hasBothCredentials) {
    // Both present - click submit automatically, after giving the page's
    // invisible Cloudflare Turnstile challenge time to resolve first.
    // NOTE: a scripted click here is a known risk on apps with bot protection
    // - it can produce a session that gets invalidated the moment it's
    // reloaded into a fresh context later, exactly the failure this kit
    // originally hit. If tests start seeing "authenticated" pages redirect
    // back to /login, that's the symptom - the fix is to leave
    // LOGIN_USERNAME/LOGIN_PASSWORD unset (or delete one) so this falls back
    // to a manual click instead.
    console.log("Waiting for the page's bot-check to clear before clicking login (up to 60s)...");
    console.log("(This can take a little while with nothing visibly happening - leave the window open.)");

    // click({ timeout }) lets Playwright retry the actionability check itself
    // (tight internal retries, catching the exact moment it's truly
    // clickable) instead of us coarsely polling isEnabled() every few
    // seconds and clicking separately - a coarse poll can fire the click at
    // a moment the button looks enabled but isn't fully ready yet, which
    // silently no-ops instead of submitting.
    let secondsLeft = 60;
    const heartbeat = setInterval(() => {
      secondsLeft -= 10;
      if (secondsLeft > 0) console.log(`  ...still waiting (${secondsLeft}s left)`);
    }, 10_000);
    try {
      await loginPage.loginButton.click({ timeout: 60_000 });
    } finally {
      clearInterval(heartbeat);
    }
  } else {
    console.log("LOGIN_USERNAME and/or LOGIN_PASSWORD is unset - type both in and log in by hand.\n");
  }

  // Wait until the user is redirected away from /login (i.e. login is complete).
  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 120_000 });
  } catch (err) {
    const debugFile = path.join(path.dirname(authFile), "login-debug.png");
    fs.mkdirSync(path.dirname(debugFile), { recursive: true });
    await page.screenshot({ path: debugFile, fullPage: true }).catch(() => {});
    console.log(`[session] Still on ${page.url()} - screenshot saved to ${debugFile}`);
    await browser.close();
    throw err;
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await context.storageState({ path: authFile });
  await browser.close();

  console.log(`[session] Login successful. Session saved to ${authFile}\n`);
  return authFile;
}

/**
 * Playwright globalSetup entry point - runs once before the whole test run
 * so the session exists (or gets created) before any worker starts, rather
 * than every worker racing to log in at once. See fixtures/auth.fixture.ts
 * for the per-test safety net that also self-heals if globalSetup didn't
 * run (e.g. some IDE test runners skip it for a single ad-hoc test).
 */
export default async function globalSetup(): Promise<void> {
  const config = await resolveConfig();
  await ensureManualSession(config);
}
