import { guard } from "@/lib/http";
import { publicStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return Response.json(await publicStatus());
}
