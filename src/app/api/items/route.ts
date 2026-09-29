import { guard } from "@/lib/http";
import { DEMO } from "@/lib/demo";
import { library } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  if (DEMO) return Response.json({ items: [] });
  return Response.json({ items: library() });
}
