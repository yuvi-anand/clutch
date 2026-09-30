import { z } from "zod";
import { readConfig } from "@/lib/config";
import { DEMO, demoBlocked, demoPersonal } from "@/lib/demo";
import { guard, jsonError } from "@/lib/http";
import { loadPersonal, parsePersonal, plainPersonal, savePersonal } from "@/lib/personal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return Response.json(DEMO ? demoPersonal() : loadPersonal());
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), text: z.string().trim().min(2).max(1000) }),
  z.object({ action: z.literal("delete"), id: z.string().max(60) }),
  z.object({ action: z.literal("toggle"), id: z.string().max(60) }),
  z.object({ action: z.literal("notes"), notes: z.string().max(3000) }),
]);

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = parsed.data;
  try {
    const state = loadPersonal();
    if (b.action === "add") {
      const cfg = readConfig();
      const added = cfg.aiCommand || cfg.anthropicApiKey ? await parsePersonal(b.text, req.signal) : [plainPersonal(b.text)];
      return Response.json({ state: savePersonal({ ...state, items: [...state.items, ...added] }), added });
    }
    if (b.action === "delete") return Response.json({ state: savePersonal({ ...state, items: state.items.filter((i) => i.id !== b.id) }) });
    if (b.action === "toggle") {
      const items = state.items.map((i) => (i.id === b.id ? { ...i, done: !i.done } : i));
      return Response.json({ state: savePersonal({ ...state, items }) });
    }
    return Response.json({ state: savePersonal({ ...state, notes: b.notes }) });
  } catch (e) {
    return jsonError(e);
  }
}
