import { guard } from "@/lib/http";
import { DEMO, demoStatus } from "@/lib/demo";
import { publicStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  if (DEMO) return Response.json(demoStatus());
  return Response.json(await publicStatus());
}
