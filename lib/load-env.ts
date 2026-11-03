import fs from "node:fs";
import path from "node:path";

/**
 * Next.js loads `.env.local` for the server, but the ingestion and evaluation
 * scripts run through `tsx` outside Next, so they need their own loader. This
 * deliberately stays tiny: it parses KEY=VALUE lines, ignores comments, and never
 * overrides a variable that is already set in the process environment.
 */
export function loadEnv(files = [".env.local", ".env"]): void {
  for (const file of files) {
    const fullPath = path.isAbsolute(file)
      ? file
      : path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    for (const rawLine of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key.length > 0 && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${key}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}
