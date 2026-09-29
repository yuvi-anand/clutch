import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";

// Runs generations through a command-line AI tool on this computer instead of
// the API, for example one that's signed in with your own subscription.
//
// The command comes from your local config (never the repo). It gets the prompt
// on stdin and these environment variables:
//   CLUTCH_SYSTEM  the system prompt
//   CLUTCH_EFFORT  low | medium | high
//   CLUTCH_SCHEMA  a JSON Schema when a JSON reply is required, else empty
// It can print plain text, or newline-delimited JSON stream events.

export type CommandRun = {
  system: string;
  content: string | Anthropic.Beta.BetaContentBlockParam[];
  effort: string;
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
};

const TIMEOUT_MS = 15 * 60e3;

function promptText(content: CommandRun["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((b) => {
      if (b.type === "text") return b.text;
      throw new Error("“Read PDFs visually” needs an API key. Turn it off to use the local AI command.");
    })
    .join("\n\n");
}

/** Only what the tool needs to run: none of this app's keys or other environment. */
function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const k of ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "TERM"]) {
    const v = process.env[k];
    if (v) env[k] = v;
  }
  return { ...env, ...extra } as NodeJS.ProcessEnv;
}

type StreamLine = {
  type?: string;
  event?: { type?: string; delta?: { type?: string; text?: string; thinking?: string; partial_json?: string } };
  result?: unknown;
  is_error?: boolean;
  structured_output?: unknown;
};

export function runCommand(command: string, o: CommandRun): Promise<string> {
  const workDir = path.join(os.tmpdir(), "clutch-ai");
  fs.mkdirSync(workDir, { recursive: true });
  let prompt = promptText(o.content);
  if (o.schema) prompt += `\n\nReply with only a JSON object that matches this JSON Schema, and no other text:\n${JSON.stringify(o.schema)}`;

  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", ["-c", command], {
      cwd: workDir,
      env: childEnv({ CLUTCH_SYSTEM: o.system, CLUTCH_EFFORT: o.effort, CLUTCH_SCHEMA: o.schema ? JSON.stringify(o.schema) : "" }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let pending = "";
    let streamed = "";
    let plain = "";
    let final: string | null = null;
    let failed: string | null = null;
    let stderr = "";

    const onLine = (line: string) => {
      if (!line.trim()) return;
      let ev: StreamLine | null = null;
      try {
        ev = JSON.parse(line) as StreamLine;
      } catch {
        plain += line + "\n";
        return;
      }
      if (!ev || typeof ev !== "object") {
        plain += line + "\n";
        return;
      }
      if (ev.type === "stream_event" && ev.event?.type === "content_block_delta") {
        const d = ev.event.delta;
        if (d?.type === "text_delta" && d.text) {
          streamed += d.text;
          o.onText?.(d.text);
        } else if (d?.type === "thinking_delta" && d.thinking) {
          o.onThinking?.(d.thinking);
        } else if (d?.type === "input_json_delta" && d.partial_json && o.schema) {
          o.onText?.(d.partial_json);
        }
      } else if (ev.type === "result") {
        if (ev.structured_output != null) final = JSON.stringify(ev.structured_output);
        else if (typeof ev.result === "string") final = ev.result;
        if (ev.is_error) failed = typeof ev.result === "string" ? ev.result : "it reported an error";
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      pending += chunk;
      let nl: number;
      while ((nl = pending.indexOf("\n")) >= 0) {
        onLine(pending.slice(0, nl));
        pending = pending.slice(nl + 1);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => {
      stderr = (stderr + c).slice(-2000);
    });

    const kill = () => child.kill("SIGTERM");
    const timer = setTimeout(kill, TIMEOUT_MS);
    o.signal?.addEventListener("abort", kill);

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Couldn't start the local AI command: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", kill);
      if (pending) onLine(pending);
      if (o.signal?.aborted) return reject(new Error("Cancelled"));
      if (failed && /not logged in|\/login/i.test(failed)) {
        return reject(new Error("The local AI command isn't signed in yet. Run it once in a terminal, sign in, then try again."));
      }
      if (failed) return reject(new Error(`The local AI command failed: ${failed}`));
      const text = (final ?? (streamed || plain)).trim();
      if (!text) {
        const why = stderr.trim().split("\n").slice(-3).join(" ");
        return reject(new Error(`The local AI command didn't return anything (exit code ${code}). ${why}`.trim()));
      }
      resolve(text);
    });
    // The command may exit before reading all of its input.
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

/** The JSON object inside a reply that may be wrapped in prose or code fences. */
export function extractJson(text: string): string {
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}
