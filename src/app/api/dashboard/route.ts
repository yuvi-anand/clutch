import { getDashboard } from "@/lib/agenda";
import { DEMO, demoDashboard } from "@/lib/demo";
import { guard, jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  if (DEMO) return Response.json(demoDashboard());
  try {
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    return Response.json(await getDashboard(refresh));
  } catch (e) {
    return jsonError(e);
  }
}
