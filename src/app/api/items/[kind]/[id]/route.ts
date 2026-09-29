import { z } from "zod";
import { DEMO, demoBlocked, demoPlan } from "@/lib/demo";
import { guard } from "@/lib/http";
import { isKind, loadItem, saveItem } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const denied = guard(req);
  if (denied) return denied;
  if (DEMO) {
    const { kind, id } = await ctx.params;
    return kind === "plan" && id === "demoplan" ? Response.json(demoPlan()) : Response.json({ error: "Not in the demo." }, { status: 404 });
  }
  const { kind, id } = await ctx.params;
  const item = isKind(kind) ? loadItem(kind, id) : null;
  if (!item) return Response.json({ error: "Not found. It may have been deleted from the data folder." }, { status: 404 });
  return Response.json(item);
}

const Attempt = z.object({ correct: z.array(z.boolean()).max(100) });

/** Record a finished quiz attempt. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const { kind, id } = await ctx.params;
  const quiz = kind === "quiz" ? loadItem("quiz", id) : null;
  if (!quiz) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = Attempt.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { correct } = parsed.data;
  quiz.attempts.push({ at: new Date().toISOString(), correct, score: correct.filter(Boolean).length, total: correct.length });
  saveItem("quiz", quiz);
  return Response.json({ ok: true });
}
