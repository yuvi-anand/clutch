import { z } from "zod";
import { guard } from "@/lib/http";
import { appendFeedback } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["general", "guide", "quiz", "plan"]),
  refId: z.string().max(60).optional(),
  rating: z.enum(["up", "down"]).optional(),
  comment: z.string().max(5000).default(""),
  path: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid feedback" }, { status: 400 });
  appendFeedback({ at: new Date().toISOString(), ...parsed.data });
  return Response.json({ ok: true });
}
