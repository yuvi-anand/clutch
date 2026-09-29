import type Anthropic from "@anthropic-ai/sdk";
import { demoBlocked } from "@/lib/demo";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { courseUpcoming, describeItem } from "@/lib/agenda";
import { runModel } from "@/lib/ai";
import { canvas } from "@/lib/canvas";
import { readConfig } from "@/lib/config";
import { courseLabel } from "@/lib/courses";
import { guard, ndjson } from "@/lib/http";
import { gatherSources, getCourseMaterials } from "@/lib/materials";
import { QuizSchema, TUTOR_SYSTEM, modeInstructions } from "@/lib/prompts";
import { newId, saveItem } from "@/lib/store";
import type { QuizQuestion, SavedGuide, SavedQuiz } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  courseId: z.number().int(),
  mode: z.enum(["guide", "practice", "cheatsheet", "quiz"]),
  topics: z.string().max(2000).default(""),
  note: z.string().max(6000).default(""),
  keys: z.array(z.string().max(300)).min(1).max(40),
  visual: z.boolean().default(false),
  count: z.number().int().min(3).max(25).default(10),
});

const today = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function cleanQuestions(raw: z.infer<typeof QuizSchema>["questions"]): QuizQuestion[] {
  return raw.map((q) => {
    const choices = q.choices.map((c) => c.trim()).filter(Boolean);
    const validMcq = q.type === "mcq" && choices.length >= 2 && q.answer_index >= 0 && q.answer_index < choices.length;
    if (validMcq) return { ...q, choices };
    // A malformed multiple-choice question still works as short answer.
    return { ...q, type: "short", choices: [], answer_index: -1, answer: q.answer || choices[q.answer_index] || "" };
  });
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick at least one material first." }, { status: 400 });
  const b = parsed.data;

  if (b.visual && readConfig().aiCommand) b.visual = false;
  return ndjson(req, async (send, signal) => {
    send({ t: "status", text: "Loading the course from Canvas…" });
    const [mats, course] = await Promise.all([getCourseMaterials(b.courseId), canvas.course(b.courseId)]);
    const courseName = courseLabel(course).name;
    // Course order (not click order) keeps the prompt prefix stable for caching.
    const picked = Object.values(mats.all).filter((m) => b.keys.includes(m.key) && m.supported);
    if (!picked.length) throw new Error("None of the selected materials could be found. Refresh the course page and try again.");

    const gathered = await gatherSources(b.courseId, picked, {
      visual: b.visual,
      signal,
      onStatus: (text) => send({ t: "status", text }),
    });
    if (!gathered.blocks.length) {
      throw new Error(`Nothing readable in the selected materials. ${gathered.skipped.map((s) => `${s.title}: ${s.reason}`).join(" ")}`);
    }

    const upcoming = (await courseUpcoming(b.courseId).catch(() => []))
      .slice(0, 6)
      .map(describeItem)
      .join("\n");
    const instructions = modeInstructions(b.mode, {
      course: courseName,
      topics: b.topics.trim(),
      note: b.note.trim(),
      upcoming,
      count: b.count,
      today: today(),
    });
    const last = gathered.blocks.length - 1;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...gathered.blocks.slice(0, last),
      { ...gathered.blocks[last], cache_control: { type: "ephemeral" } } as Anthropic.Beta.BetaContentBlockParam,
      { type: "text", text: instructions },
    ];

    const base = {
      id: newId(),
      courseId: b.courseId,
      courseName,
      topics: b.topics.trim(),
      note: b.note.trim(),
      keys: picked.map((m) => m.key),
      sources: gathered.used,
      visual: b.visual,
      createdAt: new Date().toISOString(),
    };

    if (b.mode === "quiz") {
      send({ t: "status", text: `Writing ${b.count} questions…` });
      const format = betaZodOutputFormat(QuizSchema);
      let json = "";
      let seen = 0;
      const result = await runModel({
        system: TUTOR_SYSTEM,
        content,
        effort: "high",
        format,
        signal,
        onThinking: (text) => send({ t: "thinking", text }),
        onText: (delta) => {
          json += delta;
          const n = (json.match(/"question"\s*:/g) ?? []).length;
          if (n !== seen) {
            seen = n;
            send({ t: "progress", n, total: b.count });
          }
        },
      });
      if (result.truncated) throw new Error("The quiz got cut off before it finished. Try fewer questions or fewer materials.");
      const quiz = format.parse(result.text);
      const questions = cleanQuestions(quiz.questions);
      if (!questions.length) throw new Error("No questions came back. Try again.");
      const saved: SavedQuiz = {
        ...base,
        type: "quiz",
        title: quiz.title.trim() || b.topics || "Practice quiz",
        questions,
        attempts: [],
        model: result.model,
        cost: result.cost,
      };
      saveItem("quiz", saved);
      send({ t: "done", id: saved.id, cost: result.cost });
      return;
    }

    send({ t: "status", text: "Writing…" });
    const result = await runModel({
      system: TUTOR_SYSTEM,
      content,
      effort: "high",
      signal,
      onThinking: (text) => send({ t: "thinking", text }),
      onText: (text) => send({ t: "text", text }),
    });
    const markdown = result.text.trim();
    const saved: SavedGuide = {
      ...base,
      type: b.mode,
      title: markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || b.topics || "Study guide",
      markdown,
      truncated: result.truncated,
      model: result.model,
      cost: result.cost,
    };
    saveItem("guide", saved);
    send({ t: "done", id: saved.id, cost: result.cost });
  });
}
