import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

export type Config = {
  canvasBaseUrl?: string;
  canvasToken?: string;
  anthropicApiKey?: string;
  /** Optional command-line AI tool to use instead of the API (see localEngine.ts). */
  aiCommand?: string;
  /** Model the student picked. Unset means "newest top-tier model". */
  model?: string;
  /** Per-course override of the "current semester" guess. */
  courseOverrides?: Record<string, "show" | "hide">;
};

function readFile(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Config;
  } catch {
    return {};
  }
}

/** Config file values, with environment variables (from .env.local) taking priority. */
export function readConfig(): Config {
  const f = readFile();
  return {
    ...f,
    canvasBaseUrl: process.env.CANVAS_BASE_URL || f.canvasBaseUrl,
    canvasToken: process.env.CANVAS_TOKEN || f.canvasToken,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || f.anthropicApiKey,
    aiCommand: process.env.AI_COMMAND || f.aiCommand,
    model: process.env.AI_MODEL || f.model,
  };
}

export function updateConfig(patch: Partial<Config>) {
  const next: Config = { ...readFile(), ...patch };
  for (const k of Object.keys(next) as (keyof Config)[]) {
    if (next[k] === undefined || next[k] === "") delete next[k];
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}

export function normalizeBaseUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const u = new URL(s);
  if (u.protocol !== "https:") throw new Error("The Canvas address must start with https://");
  return u.origin;
}
