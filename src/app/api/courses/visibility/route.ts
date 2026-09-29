import { z } from "zod";
import { demoBlocked } from "@/lib/demo";
import { forget } from "@/lib/cache";
import { readConfig, updateConfig } from "@/lib/config";
import { guard } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ courseId: z.number().int(), show: z.boolean() });

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const overrides = { ...(readConfig().courseOverrides ?? {}) };
  overrides[String(parsed.data.courseId)] = parsed.data.show ? "show" : "hide";
  updateConfig({ courseOverrides: overrides });
  forget("snapshot");
  return Response.json({ ok: true });
}
