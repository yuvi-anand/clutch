import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { courseUpcoming, describeItem } from "@/lib/agenda";
import { runModel } from "@/lib/ai";
import { demoBlocked } from "@/lib/demo";
import { guard, ndjson } from "@/lib/http";
import { gatherSources, getCourseMaterials } from "@/lib/materials";
import { TUTOR_SYSTEM, refinePrompt } from "@/lib/prompts";
import { loadItem, saveItem } from "@/lib/store";
import type { SavedGuide } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refine"), request: z.string().trim().min(3).max(3000) }),
  z.object({ action: z.literal("undo") }),
]);

/** How many earlier versions of a guide to keep for undo. */
const KEEP = 10;

const today = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** Rewrite a saved guide the way the student asks (keeping the old version), or undo the last rewrite. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const { kind, id } = await ctx.params;
  const guide = kind === "guide" ? loadItem("guide", id) : null;
  if (!guide) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say how you'd like the guide changed." }, { status: 400 });
  const b = parsed.data;

  if (b.action === "undo") {
    const history = [...(guide.history ?? [])];
    const prev = history.pop();
    if (!prev) return Response.json({ error: "There's no earlier version." }, { status: 400 });
    const restored: SavedGuide = {
      ...guide,
      title: prev.title,
      markdown: prev.markdown,
      truncated: prev.truncated,
      history,
      refinements: (guide.refinements ?? []).slice(0, -1),
    };
    saveItem("guide", restored);
    return Response.json(restored);
  }

  return ndjson(req, async (send, signal) => {
    send({ t: "status", text: "Reading your course materials…" });
    // Rewrite from the same files the guide was built from; fall back to the guide alone.
    let sources: Anthropic.Beta.BetaContentBlockParam[] = [];
    try {
      const mats = await getCourseMaterials(guide.courseId);
      const picked = Object.values(mats.all).filter((m) => guide.keys.includes(m.key) && m.supported);
      sources = (await gatherSources(guide.courseId, picked, { visual: false, signal, onStatus: (text) => send({ t: "status", text }) })).blocks;
    } catch {
      sources = [];
    }
    const upcoming = (await courseUpcoming(guide.courseId).catch(() => []))
      .slice(0, 6)
      .map(describeItem)
      .join("\n");
    const prompt = refinePrompt(
      guide.type,
      { course: guide.courseName, topics: guide.topics, note: guide.note, upcoming, count: 10, today: today() },
      guide.markdown,
      b.request,
    );

    send({ t: "status", text: "Rewriting…" });
    const result = await runModel({
      system: TUTOR_SYSTEM,
      content: [...sources, { type: "text", text: prompt }],
      effort: "medium",
      signal,
      onThinking: (text) => send({ t: "thinking", text }),
      onText: (text) => send({ t: "text", text }),
    });
    const markdown = result.text.trim();
    if (!markdown) throw new Error("Nothing came back. Try again.");
    if (result.truncated) throw new Error("The new version got cut off before it finished, so your guide wasn't changed. Ask for something shorter, or for a part of the guide.");

    // Re-read in case a margin note was added while this was writing.
    const fresh = loadItem("guide", id) ?? guide;
    const saved: SavedGuide = {
      ...fresh,
      title: markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || fresh.title,
      markdown,
      truncated: false,
      cost: fresh.cost + result.cost,
      refinements: [...(fresh.refinements ?? []), b.request],
      history: [...(fresh.history ?? []), { title: fresh.title, markdown: fresh.markdown, truncated: fresh.truncated, savedAt: new Date().toISOString() }].slice(-KEEP),
    };
    saveItem("guide", saved);
    send({ t: "done", id: saved.id, cost: result.cost });
  });
}
