import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { runModel } from "@/lib/ai";
import { guard, jsonError } from "@/lib/http";
import { getCourseMaterials } from "@/lib/materials";
import { SUGGEST_SYSTEM, SuggestSchema, suggestPrompt } from "@/lib/prompts";

export const dynamic = "force-dynamic";

const Body = z.object({ courseId: z.number().int(), topics: z.string().trim().min(1).max(2000) });

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Describe what you want to study first." }, { status: 400 });
  try {
    const { courseId, topics } = parsed.data;
    const mats = await getCourseMaterials(courseId);
    const available = Object.values(mats.all).filter((m) => m.supported);
    if (!available.length) return Response.json({ keys: [], topics, reason: "This course has no readable materials on Canvas yet." });
    const list = available.map((m) => `${m.key} | ${m.module} | ${m.title}`).join("\n");
    const format = betaZodOutputFormat(SuggestSchema);
    const { text } = await runModel({
      system: SUGGEST_SYSTEM,
      content: suggestPrompt(topics, list),
      effort: "low",
      maxTokens: 8000,
      format,
      signal: req.signal,
    });
    const out = format.parse(text);
    const keys = out.keys.filter((k) => mats.all[k]?.supported);
    return Response.json({ keys, topics: out.topics, reason: out.reason });
  } catch (e) {
    return jsonError(e);
  }
}
