import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { AppConfig, resolveConfig } from "./env";
import { sessionFilePath } from "./session-manager";
import { LoginPage } from "../pages/login.page";

// Per-process cache of session files already confirmed valid, so a
// multi-test worker only pays the validation cost (a real page load) once
// per run instead of before every single test.
const validatedSessions = new Set<string>();

// How long a lock directory can exist before we treat it as abandoned (e.g.
// the process that created it crashed or was killed mid-login) and break it
// ourselves rather than waiting on it forever.
const LOCK_STALE_MS = 3 * 60 * 1000;

/**
 * Loads authFile's storageState into a throwaway headless context and
 * confirms the app still treats it as logged in, by visiting baseUrl and
 * checking we don't land back on /login. This is what makes session reuse
 * dynamic: an existing file is no longer trusted just because it exists - a
 * session that expired server-side (e.g. after several days) is detected
 * here and treated as invalid instead of silently failing mid-test.
 */
async function isSessionValid(config: AppConfig, authFile: string): Promise<boolean> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();
    await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
    // Give a client-side auth redirect (common after an expired session) a
    // moment to fire before reading the final URL.
    await page.waitForURL(() => true, { timeout: 3000 }).catch(() => {});
    const landedOnLogin = new URL(page.url()).pathname.includes("/login");
    await context.close();
    return !landedOnLogin;
  } catch {
    // Any failure here (corrupt storageState, network error, etc.) means we
    // can't confirm the session works - treat it as invalid rather than
    // risking a silent mid-test failure later.
    return false;
  } finally {
    await browser.close();
  }
}

/**
 * Serializes the manual-login flow across concurrent Playwright workers
 * using an atomic `mkdir` as a lock (mkdir fails with EEXIST if another
 * worker already holds it, and is atomic across processes on every
 * platform this kit targets). Without this, `fullyParallel` workers that
 * all see a missing/invalid session file at the same time (e.g. an IDE test
 * runner that skips globalSetup) would each open their own separate login
 * browser window - you'd log into one and the rest would sit there still
 * waiting on their own copy, which looks like "it keeps asking me to log in
 * again".
 */
async function withLoginLock(config: AppConfig, authFile: string, login: () => Promise<void>): Promise<void> {
  const lockDir = `${authFile}.lock`;

  for (;;) {
    try {
      fs.mkdirSync(lockDir, { recursive: false });
      break; // lock acquired
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      // Another worker already finished the login while we were waiting.
      if (fs.existsSync(authFile)) return;

      const age = Date.now() - fs.statSync(lockDir).mtimeMs;
      if (age > LOCK_STALE_MS) {
        console.log("[session] Breaking a stale login lock left by a crashed/killed run.");
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue;
      }

      console.log("[session] Another worker is already logging in - waiting for it to finish...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  try {
    // Re-check after acquiring the lock: the file may have appeared while
    // we were waiting our turn.
    if (fs.existsSync(authFile) && (await isSessionValid(config, authFile))) return;
    await login();
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

/**
 * Returns the path to a saved session for this config, opening a real
 * (non-headless) browser to log in first if one doesn't exist yet or if the
 * existing one no longer works - once saved, that file is reused as long as
 * it keeps validating successfully (delete it yourself to force a re-login
 * immediately).
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
    if (validatedSessions.has(authFile)) {
      return authFile;
    }
    if (await isSessionValid(config, authFile)) {
      validatedSessions.add(authFile);
      console.log(`[session] Verified saved session for "${config.sessionKey}" is still valid (${authFile})`);
      return authFile;
    }
    console.log(`[session] Saved session for "${config.sessionKey}" is expired or invalid - re-authenticating.`);
    fs.rmSync(authFile, { force: true });
  }

  await withLoginLock(config, authFile, () => runManualLogin(config, authFile));
  validatedSessions.add(authFile);
  return authFile;
}

async function runManualLogin(config: AppConfig, authFile: string): Promise<void> {
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
