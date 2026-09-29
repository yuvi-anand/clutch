import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";

// Extracted text is cached on disk, keyed by Canvas's updated_at, so a file
// is only downloaded and parsed again when the professor changes it.

const DIR = path.join(DATA_DIR, "cache");

export type CachedText = {
  key: string;
  version: string;
  title: string;
  text: string;
  units?: number;
  unitLabel?: string;
};

const fileFor = (key: string) => path.join(DIR, crypto.createHash("sha1").update(key).digest("hex") + ".json");

export function getCached(key: string, version: string): CachedText | null {
  try {
    const c = JSON.parse(fs.readFileSync(fileFor(key), "utf8")) as CachedText;
    return c.version === version ? c : null;
  } catch {
    return null;
  }
}

export function putCached(entry: CachedText) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(entry.key), JSON.stringify(entry));
}

/** Small in-memory cache shared by all API routes in this process. */
type MemoEntry = { at: number; value: unknown };
const g = globalThis as unknown as { __clutchMemo?: Map<string, MemoEntry> };
const memo = (g.__clutchMemo ??= new Map());

export async function remember<T>(key: string, ttlMs: number, force: boolean, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  memo.set(key, { at: Date.now(), value });
  return value;
}

export function peek<T>(key: string, ttlMs: number): T | null {
  const hit = memo.get(key);
  return hit && Date.now() - hit.at < ttlMs ? (hit.value as T) : null;
}

export function forget(prefix: string) {
  for (const k of memo.keys()) if (k.startsWith(prefix)) memo.delete(k);
}
