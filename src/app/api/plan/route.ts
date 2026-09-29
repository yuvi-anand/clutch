import { planContext } from "@/lib/agenda";
import { DEMO, demoBlocked, demoPlan } from "@/lib/demo";
import { runModel } from "@/lib/ai";
import { guard, ndjson } from "@/lib/http";
import { PLAN_SYSTEM, planPrompt } from "@/lib/prompts";
import { latestPlan, newId, saveItem } from "@/lib/store";
import type { SavedPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  if (DEMO) return Response.json({ plan: demoPlan() });
  return Response.json({ plan: latestPlan() });
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  return ndjson(req, async (send, signal) => {
    send({ t: "status", text: "Reading your courses…" });
    const context = await planContext();
    send({ t: "status", text: "Working out your plan…" });
    const now = new Date();
    const end = new Date(now.getTime() + 13 * 86400e3);
    const result = await runModel({
      system: PLAN_SYSTEM,
      content: planPrompt(context, fmt(now), fmt(end)),
      effort: "medium",
      maxTokens: 20000,
      signal,
      onThinking: (text) => send({ t: "thinking", text }),
      onText: (text) => send({ t: "text", text }),
    });
    const plan: SavedPlan = {
      id: newId(),
      type: "plan",
      title: `Catch-up plan for ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      markdown: result.text.trim(),
      model: result.model,
      cost: result.cost,
      createdAt: now.toISOString(),
    };
    saveItem("plan", plan);
    send({ t: "done", id: plan.id, cost: result.cost });
  });
}
