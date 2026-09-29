import { readConfig } from "./config";
import { availableModels } from "./models";
import type { ModelOption, Status } from "./types";

export async function publicStatus(): Promise<Status> {
  const c = readConfig();
  let models: ModelOption[] = [];
  if (c.anthropicApiKey) models = await availableModels(c.anthropicApiKey).catch(() => []);
  return {
    canvasConnected: Boolean(c.canvasBaseUrl && c.canvasToken),
    canvasBaseUrl: c.canvasBaseUrl ?? null,
    aiConfigured: Boolean(c.anthropicApiKey),
    model: c.model ?? models[0]?.id ?? "",
    models,
    canvasFromEnv: Boolean(process.env.CANVAS_TOKEN),
    aiFromEnv: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
