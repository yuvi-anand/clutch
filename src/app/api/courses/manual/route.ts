import { z } from "zod";
import { forget } from "@/lib/cache";
import { demoBlocked } from "@/lib/demo";
import { addManualCourse, manualCourse, removeManualCourse } from "@/lib/extras";
import { guard } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(2).max(120), code: z.string().trim().max(30).default("") }),
  z.object({ action: z.literal("delete"), id: z.number().int().negative() }),
]);

/** Classes that aren't on Canvas, added by the student. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Give the class a name." }, { status: 400 });
  const b = parsed.data;
  if (b.action === "create") {
    const code = b.code || (b.name.match(/\b[A-Z]{2,5}\s?\d{4}\b/)?.[0] ?? "");
    const course = addManualCourse(b.name, code);
    return Response.json(course);
  }
  if (!manualCourse(b.id)) return Response.json({ error: "That class isn't here anymore." }, { status: 404 });
  removeManualCourse(b.id);
  forget(`materials:${b.id}`);
  return Response.json({ ok: true });
}
