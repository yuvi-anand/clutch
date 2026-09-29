import { guard } from "@/lib/http";
import { library } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return Response.json({ items: library() });
}
