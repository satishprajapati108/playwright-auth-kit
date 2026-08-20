import * as fs from "fs";
import * as path from "path";
import { Browser } from "@playwright/test";
import { AppConfig } from "./env";
import { LoginPage } from "../pages/login.page";

const SESSION_DIR = path.resolve(process.cwd(), ".auth");

export function sessionFilePath(sessionKey: string): string {
  return path.join(SESSION_DIR, `${sessionKey}.session.json`);
}

function metaFilePath(sessionKey: string): string {
  return path.join(SESSION_DIR, `${sessionKey}.meta.json`);
}

interface SessionMeta {
  consecutiveFailures: number;
}

function readMeta(sessionKey: string): SessionMeta {
  try {
    return JSON.parse(fs.readFileSync(metaFilePath(sessionKey), "utf8"));
  } catch {
    return { consecutiveFailures: 0 };
  }
}

function writeMeta(sessionKey: string, meta: SessionMeta): void {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(metaFilePath(sessionKey), JSON.stringify(meta));
}

function deleteSessionFiles(sessionKey: string): void {
  const filePath = sessionFilePath(sessionKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  const meta = metaFilePath(sessionKey);
  if (fs.existsSync(meta)) fs.unlinkSync(meta);
}

function isSessionFresh(filePath: string, maxAgeHours: number): boolean {
  if (!fs.existsSync(filePath)) return false;
  const ageMs = Date.now() - fs.statSync(filePath).mtimeMs;
  return ageMs < maxAgeHours * 60 * 60 * 1000;
}

function isSessionExpiredByTtl(filePath: string, ttlDays: number): boolean {
  if (!fs.existsSync(filePath)) return false;
  const ageMs = Date.now() - fs.statSync(filePath).mtimeMs;
  return ageMs >= ttlDays * 24 * 60 * 60 * 1000;
}

/** Playwright storageState files are JSON - treat anything unparsable (e.g. a truncated write) as corrupted. */
function isSessionCorrupted(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    JSON.parse(fs.readFileSync(filePath, "utf8"));
    return false;
  } catch {
    return true;
  }
}

/**
 * Returns a storageState file guaranteed to hold a fresh, logged-in session
 * for the given config. Reuses the file on disk when it's still within
 * SESSION_MAX_AGE_HOURS; otherwise logs in once and saves a new one.
 *
 * Sessions are cleared automatically - there is no manual reset step:
 * a file untouched for SESSION_TTL_DAYS is discarded outright, a session
 * key that fails to log in LOGIN_FAILURE_THRESHOLD times in a row has its
 * stale file wiped, and a session file that isn't valid JSON (corrupted by
 * a truncated write, disk issue, etc.) is deleted on sight.
 *
 * This is the single entry point projects should call from global setup.
 */
export async function ensureSession(browser: Browser, config: AppConfig): Promise<string> {
  const filePath = sessionFilePath(config.sessionKey);

  if (isSessionCorrupted(filePath)) {
    console.log(`[session] Session "${config.sessionKey}" is corrupted - clearing it`);
    deleteSessionFiles(config.sessionKey);
  } else if (isSessionExpiredByTtl(filePath, config.sessionTtlDays)) {
    console.log(`[session] Session "${config.sessionKey}" is older than ${config.sessionTtlDays}d - clearing it`);
    deleteSessionFiles(config.sessionKey);
  }

  if (isSessionFresh(filePath, config.sessionMaxAgeHours)) {
    console.log(`[session] Reusing saved session for "${config.sessionKey}" (${filePath})`);
    return filePath;
  }

  console.log(`[session] No fresh session for "${config.sessionKey}" - logging in...`);
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const loginPage = new LoginPage(page);
    await loginPage.open(config.baseUrl);
    await loginPage.login(config.username, config.password);
    await context.storageState({ path: filePath });
    writeMeta(config.sessionKey, { consecutiveFailures: 0 });
    console.log(`[session] Saved new session to ${filePath}`);
  } catch (err) {
    const meta = readMeta(config.sessionKey);
    meta.consecutiveFailures += 1;

    if (meta.consecutiveFailures >= config.loginFailureThreshold) {
      console.log(
        `[session] Login failed ${meta.consecutiveFailures} times in a row for "${config.sessionKey}" - clearing session`
      );
      deleteSessionFiles(config.sessionKey);
    } else {
      writeMeta(config.sessionKey, meta);
    }

    throw err;
  } finally {
    await context.close();
  }

  return filePath;
}
