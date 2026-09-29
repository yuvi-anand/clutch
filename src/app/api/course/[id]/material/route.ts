import { guard, jsonError } from "@/lib/http";
import { demoBlocked } from "@/lib/demo";
import { previewMaterial } from "@/lib/materials";

export const dynamic = "force-dynamic";

const KEY = /^(file:\d+|page:[A-Za-z0-9._~%-]+)$/;

/** The extracted text of one material, so students can check what the app reads. Free: no AI call. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const id = Number((await ctx.params).id);
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!Number.isInteger(id) || id <= 0 || !KEY.test(key)) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    return Response.json(await previewMaterial(id, key));
  } catch (e) {
    return jsonError(e);
  }
}
