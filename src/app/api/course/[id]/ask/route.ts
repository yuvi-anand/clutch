import { z } from "zod";
import { courseDisplayName } from "@/lib/agenda";
import { runModel } from "@/lib/ai";
import { classSources } from "@/lib/classInfo";
import { demoBlocked } from "@/lib/demo";
import { guard, ndjson } from "@/lib/http";
import { CLASS_SYSTEM, classPrompt } from "@/lib/prompts";
import { classQuestions, newId, saveClassQuestions } from "@/lib/store";
import type { ClassQA } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ask"), question: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal("delete"), qaId: z.string().max(60) }),
]);

const today = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

async function courseId(ctx: Ctx): Promise<number | null> {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id !== 0 ? id : null;
}

/** Questions already asked about this class. */
export async function GET(req: Request, ctx: Ctx) {
  const denied = guard(req);
  if (denied) return denied;
  const id = await courseId(ctx);
  if (id == null) return Response.json({ error: "Bad course id" }, { status: 400 });
  return Response.json({ questions: classQuestions(id) });
}

/** Ask how the class works (answered from its syllabus, grade setup and announcements), or delete an answer. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const id = await courseId(ctx);
  if (id == null) return Response.json({ error: "Bad course id" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Type a question about the class first." }, { status: 400 });
  const b = parsed.data;

  if (b.action === "delete") {
    const questions = classQuestions(id).filter((q) => q.id !== b.qaId);
    saveClassQuestions(id, questions);
    return Response.json({ questions });
  }

  return ndjson(req, async (send, signal) => {
    const [sources, course] = await Promise.all([
      classSources(id, signal, (text) => send({ t: "status", text })),
      courseDisplayName(id),
    ]);
    if (!sources.blocks.length) {
      throw new Error("There's nothing to answer from yet: no syllabus, grade setup or course pages. Add the course website or paste the syllabus under Course materials.");
    }
    send({ t: "status", text: "Looking it up…" });
    // The last few questions, so "what about quizzes?" makes sense after "are exams curved?".
    const earlier = classQuestions(id).slice(-3).map((q) => ({ question: q.question, answer: q.answer }));
    const result = await runModel({
      system: CLASS_SYSTEM,
      content: [...sources.blocks, { type: "text", text: classPrompt(course, b.question, earlier, today()) }],
      effort: "low",
      maxTokens: 2000,
      signal,
      onText: (text) => send({ t: "text", text }),
    });
    const qa: ClassQA = { id: newId(), question: b.question, answer: result.text.trim(), sources: sources.used, createdAt: new Date().toISOString() };
    saveClassQuestions(id, [...classQuestions(id), qa]);
    send({ t: "done", id: qa.id, cost: result.cost });
  });
}
