import fs from "node:fs";
import path from "node:path";
import { demoBlocked } from "@/lib/demo";
import { fileKind } from "@/lib/extract";
import { getExtras, manualCourse, setExtras, UPLOAD_DIR } from "@/lib/extras";
import { guard, jsonError } from "@/lib/http";
import { summarizeExtras } from "@/lib/materials";
import { newId } from "@/lib/store";
import type { UploadedFile } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_BYTES = 60 * 1024 * 1024;
const READABLE = new Set(["pdf", "pptx", "docx", "text"]);

/** Save files the student uploads (lecture slides, notes, anything off Canvas) to this class. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id === 0 || (id < 0 && !manualCourse(id))) return Response.json({ error: "Bad course id" }, { status: 400 });
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
    if (!files.length) return Response.json({ error: "Pick at least one file." }, { status: 400 });
    const dir = path.join(UPLOAD_DIR, String(id));
    fs.mkdirSync(dir, { recursive: true });
    const added: UploadedFile[] = [];
    const skipped: string[] = [];
    for (const f of files) {
      const kind = fileKind(f.name, f.type);
      if (!READABLE.has(kind)) {
        skipped.push(`${f.name} (use PDF, PowerPoint, Word or text files)`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        skipped.push(`${f.name} (over 60 MB)`);
        continue;
      }
      const fileId = newId();
      const stored = `${fileId}-${f.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
      fs.writeFileSync(path.join(dir, stored), Buffer.from(await f.arrayBuffer()));
      added.push({ id: fileId, name: f.name, size: f.size, kind, stored, addedAt: new Date().toISOString() });
    }
    const ex = getExtras(id);
    setExtras(id, { ...ex, files: [...ex.files, ...added] });
    return Response.json({ ...summarizeExtras(getExtras(id)), skipped });
  } catch (e) {
    return jsonError(e);
  }
}
