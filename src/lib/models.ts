import Anthropic from "@anthropic-ai/sdk";
import { forget, remember } from "./cache";
import { readConfig } from "./config";
import type { ModelOption } from "./types";

// Model names aren't hard-coded: the app asks the API which models the key can
// use, then offers the newest top-tier model (the default) and the newest
// faster tier. New model releases show up without a code change.
const TIERS = [
  { family: "opus", note: "Best study guides (default)" },
  { family: "sonnet", note: "Faster, about half the cost" },
] as const;

export function availableModels(apiKey: string, force = false): Promise<ModelOption[]> {
  return remember("models", 60 * 60e3, force, async () => {
    const all: Anthropic.ModelInfo[] = [];
    for await (const m of new Anthropic({ apiKey }).models.list({ limit: 100 })) all.push(m);
    const out: ModelOption[] = [];
    for (const { family, note } of TIERS) {
      const newest = all
        .filter((m) => m.id.includes(`-${family}-`))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      if (newest) out.push({ id: newest.id, label: newest.display_name, note });
    }
    return out;
  });
}

export const forgetModels = () => forget("models");

/** The student's chosen model, or else the newest top-tier model. */
export async function currentModel(): Promise<string> {
  const cfg = readConfig();
  if (cfg.model) return cfg.model;
  if (!cfg.anthropicApiKey) throw new Error("Add your Anthropic API key on the Connect page first.");
  const models = await availableModels(cfg.anthropicApiKey);
  if (!models.length) throw new Error("Your API key doesn't have access to any of the supported models.");
  return models[0].id;
}

/** Validate an API key without spending tokens. */
export async function checkApiKey(apiKey: string) {
  await new Anthropic({ apiKey }).models.list({ limit: 1 });
}
