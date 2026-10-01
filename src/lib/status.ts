import { readConfig } from "./config";
import { availableModels } from "./models";
import type { ModelOption, Status } from "./types";

export async function publicStatus(): Promise<Status> {
  const c = readConfig();
  const engine = c.aiCommand ? "command" : c.anthropicApiKey ? "api" : "none";
  let models: ModelOption[] = [];
  if (engine === "api") models = await availableModels(c.anthropicApiKey!).catch(() => []);
  if (engine === "command") models = [{ id: "command", label: "Local AI command", note: "Runs on this computer, no API cost" }];
  return {
    canvasConnected: Boolean(c.canvasBaseUrl && c.canvasToken),
    canvasBaseUrl: c.canvasBaseUrl ?? null,
    aiConfigured: engine !== "none",
    engine,
    aiCommand: c.aiCommand ?? "",
    model: engine === "command" ? "command" : (c.model ?? models[0]?.id ?? ""),
    models,
    canvasFromEnv: Boolean(process.env.CANVAS_TOKEN),
    aiFromEnv: Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_COMMAND),
  };
}
