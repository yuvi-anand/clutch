import fs from "node:fs";
import { z } from "zod";
import { courseDisplayName } from "@/lib/agenda";
import { demoBlocked } from "@/lib/demo";
import { extractEvents } from "@/lib/events";
import { getExtras, hashText, manualCourse, setExtras, uploadPath } from "@/lib/extras";
import { guard, jsonError } from "@/lib/http";
import { summarizeExtras } from "@/lib/materials";
import type { Extras, Site } from "@/lib/types";
import { checkPublicUrl, crawlSite } from "@/lib/web";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addSite"), url: z.string().trim().min(4).max(500) }),
  z.object({ action: z.literal("refreshSite"), url: z.string().max(500) }),
  z.object({ action: z.literal("removeSite"), url: z.string().max(500) }),
  z.object({ action: z.literal("notes"), notes: z.string().max(200_000) }),
  z.object({ action: z.literal("removeFile"), id: z.string().max(60) }),
]);

/** Read a site and pull out its dates, reusing the old dates when nothing changed. */
async function readSite(courseName: string, url: string, previous: Site | undefined, signal: AbortSignal): Promise<Site> {
  const site = await crawlSite(url);
  const hash = hashText(site.pages.map((p) => p.markdown).join("\n"));
  const events =
    previous && previous.hash === hash
      ? previous.events
      : await extractEvents(courseName, site.pages.map((p) => ({ title: p.title, text: p.markdown })), signal);
  const now = new Date().toISOString();
  return {
    url: site.url,
    title: site.title,
    addedAt: previous?.addedAt ?? now,
    fetchedAt: now,
    hash,
    pages: site.pages.map((p) => ({ url: p.url, title: p.title })),
    files: site.files,
    events,
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;
  const blocked = demoBlocked();
  if (blocked) return blocked;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id === 0 || (id < 0 && !manualCourse(id))) return Response.json({ error: "Bad course id" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = parsed.data;
  try {
    const ex: Extras = getExtras(id);
    if (b.action === "addSite" || b.action === "refreshSite") {
      const url = checkPublicUrl(b.url).toString();
      const previous = ex.sites.find((s) => s.url === url);
      const site = await readSite(await courseDisplayName(id), url, previous, req.signal);
      const others = ex.sites.filter((s) => s.url !== url && s.url !== site.url);
      setExtras(id, { ...ex, sites: [...others, site] });
    } else if (b.action === "removeSite") {
      setExtras(id, { ...ex, sites: ex.sites.filter((s) => s.url !== b.url) });
    } else if (b.action === "notes") {
      const notes = b.notes.trim();
      const notesHash = hashText(notes);
      const notesEvents =
        !notes ? [] : notesHash === ex.notesHash ? ex.notesEvents : await extractEvents(await courseDisplayName(id), [{ title: "Pasted notes", text: notes }], req.signal);
      setExtras(id, { ...ex, notes, notesHash, notesEvents });
    } else {
      const f = ex.files.find((x) => x.id === b.id);
      if (f) fs.rmSync(uploadPath(id, f.stored), { force: true });
      setExtras(id, { ...ex, files: ex.files.filter((x) => x.id !== b.id) });
    }
    return Response.json(summarizeExtras(getExtras(id)));
  } catch (e) {
    return jsonError(e);
  }
}
