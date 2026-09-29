import Anthropic from "@anthropic-ai/sdk";
import { readConfig } from "./config";
import { currentModel } from "./models";

export type Effort = "low" | "medium" | "high";

type RunOptions = {
  system: string;
  content: string | Anthropic.Beta.BetaContentBlockParam[];
  effort: Effort;
  maxTokens?: number;
  format?: Anthropic.Beta.BetaJSONOutputFormat;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
};

export type RunResult = { text: string; model: string; cost: number; truncated: boolean };

// $ per million tokens by model family: input, output, cache read.
// Cache writes bill at 1.25x input. Used only for the cost shown in the app.
const PRICES: Record<string, [number, number, number]> = {
  "opus-5-5": [4, 20, 0.2],
  "sonnet-5-5": [2, 10, 0.2],
  "opus-5": [5, 25, 0.5],
  "opus-4-8": [5, 25, 0.5],
  "sonnet-5": [2, 10, 0.2],
};

function costOf(m: Anthropic.Beta.BetaMessage): number {
  const family = m.model.match(/(opus|sonnet|haiku)-[\d-]+$/)?.[0] ?? "";
  const [pin, pout, pread] = PRICES[family] ?? PRICES["opus-5-5"];
  const u = m.usage;
  return (
    ((u.input_tokens ?? 0) * pin +
      (u.cache_creation_input_tokens ?? 0) * pin * 1.25 +
      (u.cache_read_input_tokens ?? 0) * pread +
      (u.output_tokens ?? 0) * pout) /
    1e6
  );
}

/**
 * One streamed model call. Thinking summaries and text arrive through the
 * callbacks as they're generated. If the model's safety filters decline (course
 * material about security can trip them), the API retries on a fallback model.
 */
export async function runModel(o: RunOptions): Promise<RunResult> {
  const { anthropicApiKey } = readConfig();
  if (!anthropicApiKey) throw new Error("Add your Anthropic API key on the Connect page first.");
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const stream = client.beta.messages.stream(
    {
      model: await currentModel(),
      max_tokens: o.maxTokens ?? 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive", display: "summarized" },
      output_config: o.format ? { effort: o.effort, format: o.format } : { effort: o.effort },
      system: [{ type: "text", text: o.system }],
      messages: [{ role: "user", content: o.content }],
    },
    { signal: o.signal },
  );
  for await (const ev of stream) {
    if (ev.type !== "content_block_delta") continue;
    if (ev.delta.type === "text_delta") o.onText?.(ev.delta.text);
    else if (ev.delta.type === "thinking_delta") o.onThinking?.(ev.delta.thinking);
  }
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category;
    throw new Error(
      `The AI declined this request${category ? ` (${category} safety filter)` : ""}. Try different materials, or describe what you want to study differently.`,
    );
  }
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { text, model: message.model, cost: costOf(message), truncated: message.stop_reason === "max_tokens" };
}
