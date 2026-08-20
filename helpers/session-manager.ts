import * as path from "path";

const SESSION_DIR = path.resolve(process.cwd(), ".auth");

export function sessionFilePath(sessionKey: string): string {
  return path.join(SESSION_DIR, `${sessionKey}.session.json`);
}
