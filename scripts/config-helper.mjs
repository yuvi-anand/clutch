// Small helpers for setup.sh, so the shell script never has to parse JSON or
// put the Canvas token on a command line.
//
//   node scripts/config-helper.mjs get <key>         prints a saved value (not secrets)
//   node scripts/config-helper.mjs has <key>         exit 0 if the key is saved
//   node scripts/config-helper.mjs set <key>         reads the value from stdin and saves it
//   node scripts/config-helper.mjs check-canvas      reads "<base>\n<token>" from stdin, prints your name
//   node scripts/config-helper.mjs check-canvas-saved  same, using the saved address and token

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const SECRET = new Set(["canvasToken", "anthropicApiKey"]);

function read() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(cfg) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(CONFIG_FILE, 0o600);
}

async function stdin() {
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

async function checkCanvas(base, token) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`);
  } catch {
    throw new Error("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:") throw new Error("The Canvas address must start with https://");
  const res = await fetch(`${url.origin}/api/v1/users/self`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {
    throw new Error(`Couldn't reach ${url.origin}. Check the address and your internet connection.`);
  });
  if (res.status === 401) throw new Error("Canvas didn't accept that token. Make a new one and paste the whole thing.");
  if (!res.ok) throw new Error(`Canvas answered with HTTP ${res.status}. Check the address.`);
  const me = await res.json().catch(() => ({}));
  return { origin: url.origin, name: me.name || "you" };
}

const [cmd, key] = process.argv.slice(2);
try {
  if (cmd === "get") {
    if (SECRET.has(key)) throw new Error("Refusing to print a secret.");
    const v = read()[key];
    if (v !== undefined) process.stdout.write(String(v));
  } else if (cmd === "has") {
    process.exit(read()[key] ? 0 : 1);
  } else if (cmd === "set") {
    const value = (await stdin()).trim();
    const cfg = read();
    if (value) cfg[key] = value;
    else delete cfg[key];
    write(cfg);
  } else if (cmd === "check-canvas") {
    const [base = "", token = ""] = (await stdin()).split("\n").map((s) => s.trim());
    const { origin, name } = await checkCanvas(base, token);
    write({ ...read(), canvasBaseUrl: origin, canvasToken: token });
    process.stdout.write(name);
  } else if (cmd === "check-canvas-saved") {
    const cfg = read();
    if (!cfg.canvasBaseUrl || !cfg.canvasToken) process.exit(1);
    process.stdout.write((await checkCanvas(cfg.canvasBaseUrl, cfg.canvasToken)).name);
  } else {
    throw new Error(`Unknown command: ${cmd ?? "(none)"}`);
  }
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : e}\n`);
  process.exit(2);
}
