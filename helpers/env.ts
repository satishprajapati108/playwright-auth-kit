import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ask, askHidden, askYesNo } from "./prompt";

const ENV_PATH = path.resolve(process.cwd(), ".env");
dotenv.config({ path: ENV_PATH });

export interface AppConfig {
  baseUrl: string;
  username: string;
  password: string;
  sessionKey: string;
  sessionMaxAgeHours: number;
  sessionTtlDays: number;
  loginFailureThreshold: number;
}

function isCI(): boolean {
  return Boolean(process.env.CI) && process.env.CI !== "0" && process.env.CI !== "false";
}

/** Reads (or appends) a KEY=VALUE line in .env without disturbing the rest of the file. */
function persistToEnvFile(updates: Record<string, string>): void {
  let lines: string[] = [];
  if (fs.existsSync(ENV_PATH)) {
    lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  }

  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=`);
    const index = lines.findIndex((line) => pattern.test(line));
    const line = `${key}=${value}`;
    if (index >= 0) {
      lines[index] = line;
    } else {
      lines.push(line);
    }
  }

  fs.writeFileSync(ENV_PATH, lines.filter((l, i) => l !== "" || i === lines.length - 1).join("\n"));
}

/**
 * Resolves the config needed to log in, prompting the user for anything
 * missing (BASE_URL / USERNAME / PASSWORD) when running locally.
 * On CI, missing required values throw immediately instead of hanging on a prompt.
 */
export async function resolveConfig(): Promise<AppConfig> {
  let baseUrl = process.env.BASE_URL ?? "";
  let username = process.env.USERNAME ?? "";
  let password = process.env.PASSWORD ?? "";

  const missing = !baseUrl || !username || !password;

  if (missing && isCI()) {
    const missingKeys = [
      !baseUrl && "BASE_URL",
      !username && "USERNAME",
      !password && "PASSWORD",
    ].filter(Boolean);
    throw new Error(
      `Missing required env var(s) on CI: ${missingKeys.join(", ")}. ` +
        `Set them as secrets/variables - interactive prompts are disabled when CI is set.`
    );
  }

  if (missing) {
    console.log("\nSome session credentials are missing. Enter them once and they can be saved for next time.\n");
    const toPersist: Record<string, string> = {};

    if (!baseUrl) {
      baseUrl = await ask("Base URL (e.g. https://app.example.com): ");
      toPersist.BASE_URL = baseUrl;
    }
    if (!username) {
      username = await ask("Username: ");
      toPersist.USERNAME = username;
    }
    if (!password) {
      password = await askHidden("Password: ");
      toPersist.PASSWORD = password;
    }

    if (Object.keys(toPersist).length > 0) {
      const save = await askYesNo("Save these to .env for future runs?", true);
      if (save) {
        persistToEnvFile(toPersist);
        console.log(`Saved to ${ENV_PATH}\n`);
      }
    }
  }

  if (!baseUrl) throw new Error("BASE_URL is required (env var or interactive prompt).");

  return {
    baseUrl,
    username,
    password,
    sessionKey: process.env.SESSION_KEY || "default",
    sessionMaxAgeHours: Number(process.env.SESSION_MAX_AGE_HOURS ?? 8),
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
    loginFailureThreshold: Number(process.env.LOGIN_FAILURE_THRESHOLD ?? 3),
  };
}
