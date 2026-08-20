import * as path from "path";
import * as dotenv from "dotenv";

const ENV_PATH = path.resolve(process.cwd(), ".env");
dotenv.config({ path: ENV_PATH });

export interface AppConfig {
  baseUrl: string;
  username: string;
  password: string;
  sessionKey: string;
}

/**
 * Resolves the config needed to run tests. BASE_URL must be set in .env -
 * there's no interactive fallback for it.
 *
 * LOGIN_USERNAME/LOGIN_PASSWORD are optional: login itself is a manual,
 * one-time step (see helpers/auth-setup.ts). When they're set, that step
 * pre-fills them into the login form as a convenience; when they're not,
 * you just type them into the browser window yourself when it opens.
 */
export async function resolveConfig(): Promise<AppConfig> {
  const baseUrl = process.env.BASE_URL ?? "";
  if (!baseUrl) throw new Error("BASE_URL is required - set it in .env.");

  return {
    baseUrl,
    username: process.env.LOGIN_USERNAME ?? "",
    password: process.env.LOGIN_PASSWORD ?? "",
    sessionKey: process.env.SESSION_KEY || "default",
  };
}
