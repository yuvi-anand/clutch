import { z } from "zod";
import { forget } from "@/lib/cache";
import { CanvasError, checkCanvas } from "@/lib/canvas";
import { normalizeBaseUrl, readConfig, updateConfig } from "@/lib/config";
import { errorMessage, guard } from "@/lib/http";
import { availableModels, checkApiKey, forgetModels } from "@/lib/models";
import { publicStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

const Body = z.object({
  canvasBaseUrl: z.string().max(300).optional(),
  canvasToken: z.string().max(1000).optional(),
  anthropicApiKey: z.string().max(1000).optional(),
  model: z.string().max(100).optional(),
  clear: z.enum(["canvas", "ai"]).optional(),
});

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = parsed.data;
  const errors: Record<string, string> = {};
  let canvasUser: string | undefined;
  let aiOk = false;

  if (b.clear === "canvas") {
    updateConfig({ canvasToken: undefined });
    forget("");
    return Response.json({ errors, status: await publicStatus() });
  }
  if (b.clear === "ai") {
    updateConfig({ anthropicApiKey: undefined, model: undefined });
    forgetModels();
    return Response.json({ errors, status: await publicStatus() });
  }

  if (b.canvasBaseUrl !== undefined || b.canvasToken) {
    const cfg = readConfig();
    try {
      const rawBase = (b.canvasBaseUrl ?? cfg.canvasBaseUrl ?? "").trim();
      if (!rawBase) throw new Error("Enter your school's Canvas address first.");
      const base = normalizeBaseUrl(rawBase);
      const token = (b.canvasToken ?? "").trim() || cfg.canvasToken || "";
      if (!token) {
        updateConfig({ canvasBaseUrl: base });
        errors.canvas = "Now paste your Canvas access token.";
      } else {
        const user = await checkCanvas(base, token);
        updateConfig({ canvasBaseUrl: base, canvasToken: token });
        canvasUser = user.name;
        forget("");
      }
    } catch (e) {
      errors.canvas = errorMessage(e);
      // Log why (never the token itself) so failed connections can be debugged.
      console.warn(`Canvas connect failed${e instanceof CanvasError ? ` (HTTP ${e.status})` : ""}: ${errors.canvas}`);
    }
  }

  if (b.anthropicApiKey?.trim()) {
    const key = b.anthropicApiKey.trim();
    try {
      await checkApiKey(key);
      updateConfig({ anthropicApiKey: key });
      forgetModels();
      aiOk = true;
    } catch (e) {
      errors.ai = errorMessage(e);
      console.warn(`API key check failed: ${errors.ai}`);
    }
  }

  const key = readConfig().anthropicApiKey;
  if (b.model && key) {
    const models = await availableModels(key).catch(() => []);
    if (models.some((m) => m.id === b.model)) updateConfig({ model: b.model });
  }

  return Response.json({ errors, canvasUser, aiOk, status: await publicStatus() });
}
