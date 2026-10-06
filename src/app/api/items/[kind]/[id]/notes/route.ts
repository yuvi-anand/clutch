import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runModel } from "@/lib/ai";
import { demoBlocked } from "@/lib/demo";
import { guard, ndjson } from "@/lib/http";
import { gatherSources, getCourseMaterials } from "@/lib/materials";
import { TUTOR_SYSTEM, notePrompt } from "@/lib/prompts";
import { DEFAULT_NOTE_QUESTION } from "@/lib/types";
import { loadItem, newId, saveItem } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ask"), quote: z.string().trim().min(2).max(4000), occurrence: z.number().int().min(0).max(500).default(0), question: z.string().trim().max(2000).default("") }),
  z.object({ action: z.literal("delete"), noteId: z.string().max(60) }),
]);

/** Margin notes on a study guide: ask about a highlighted passage, or remove a note. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const { kind, id } = await ctx.params;
  const guide = kind === "guide" ? loadItem("guide", id) : null;
  if (!guide) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Highlight some text first." }, { status: 400 });
  const b = parsed.data;

  if (b.action === "delete") {
    const notes = (guide.notes ?? []).filter((n) => n.id !== b.noteId);
    saveItem("guide", { ...guide, notes });
    return Response.json({ notes });
  }

  return ndjson(req, async (send, signal) => {
    send({ t: "status", text: "Reading your course materials…" });
    // Ground the answer in the same files the guide was built from; fall back to the guide alone.
    let sources: Anthropic.Beta.BetaContentBlockParam[] = [];
    try {
      const mats = await getCourseMaterials(guide.courseId);
      const picked = Object.values(mats.all).filter((m) => guide.keys.includes(m.key) && m.supported);
      sources = (await gatherSources(guide.courseId, picked, { visual: false, signal, onStatus: () => {} })).blocks;
    } catch {
      sources = [];
    }
    send({ t: "status", text: "Writing…" });
    const result = await runModel({
      system: TUTOR_SYSTEM,
      content: [...sources, { type: "text", text: notePrompt(guide.markdown, b.quote, b.question) }],
      effort: "medium",
      maxTokens: 8000,
      signal,
      onText: (text) => send({ t: "text", text }),
    });
    const note = { id: newId(), quote: b.quote, occurrence: b.occurrence, question: b.question || DEFAULT_NOTE_QUESTION, answer: result.text.trim(), createdAt: new Date().toISOString() };
    const fresh = loadItem("guide", id) ?? guide;
    saveItem("guide", { ...fresh, notes: [...(fresh.notes ?? []), note] });
    send({ t: "done", id: note.id, cost: result.cost });
  });
}
