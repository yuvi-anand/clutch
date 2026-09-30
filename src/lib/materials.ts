import fs from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { canvas, CanvasError, canvasWebUrl, downloadFile, type CanvasFile, type CanvasModuleItem, type CanvasPage } from "./canvas";
import { getCached, putCached, remember } from "./cache";
import { extractFile, fileKind, htmlToMarkdown, KIND_REASON, pdfPageCount } from "./extract";
import { getExtras, uploadPath } from "./extras";
import { dateKey } from "./text";
import { fetchFile, fetchPage } from "./web";
import type { Extras, ExtrasSummary, Material, MaterialPreview, ModuleEntry, ModuleView, UsedSource } from "./types";

export type CourseMaterials = {
  modules: ModuleView[];
  otherFiles: Material[];
  otherPages: Material[];
  /** Every material by key, in the order it appears on the course page. */
  all: Record<string, Material>;
};

const READABLE = new Set(["pdf", "pptx", "docx", "text"]);

// Rough budgets so one request stays well inside the model's limits and a
// student's API bill stays predictable.
const MAX_TEXT_TOKENS = 220_000;
const MAX_VISUAL_PAGES = 300;
const MAX_VISUAL_BYTES = 22 * 1024 * 1024;
const TOKENS_PER_VISUAL_PAGE = 1_600;
const approxTokens = (chars: number) => Math.round(chars / 3.6);

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function fileMaterial(courseId: number, id: number, title: string, fileName: string, module: string, size?: number): Material {
  const kind = fileKind(fileName);
  const supported = READABLE.has(kind);
  return {
    key: `file:${id}`,
    kind: "file",
    title: title.trim(),
    module,
    fileKind: kind,
    size,
    supported,
    reason: supported ? undefined : KIND_REASON[kind],
    url: canvasWebUrl(`/courses/${courseId}/files/${id}`),
  };
}

function pageMaterial(courseId: number, slug: string, title: string, module: string): Material {
  return {
    key: `page:${slug}`,
    kind: "page",
    title: decodeEntities(title.trim()),
    module,
    supported: true,
    url: canvasWebUrl(`/courses/${courseId}/pages/${slug}`),
  };
}

function entryFor(courseId: number, item: CanvasModuleItem, moduleName: string, files: Map<number, CanvasFile>): ModuleEntry | null {
  switch (item.type) {
    case "SubHeader":
      return { type: "header", title: item.title.trim() };
    case "File": {
      if (!item.content_id) return null;
      const f = files.get(item.content_id);
      const fileName = f?.display_name ?? item.content_details?.display_name ?? item.title;
      const m = fileMaterial(courseId, item.content_id, item.title, fileName, moduleName, f?.size);
      if (item.content_details?.locked_for_user) {
        m.supported = false;
        m.reason = "Locked until your professor releases it";
      }
      return { type: "material", material: m };
    }
    case "Page":
      return item.page_url ? { type: "material", material: pageMaterial(courseId, item.page_url, item.title, moduleName) } : null;
    case "Assignment":
    case "Quiz":
    case "Discussion":
      return { type: "link", title: item.title.trim(), itemType: item.type.toLowerCase(), url: item.html_url };
    case "ExternalUrl":
    case "ExternalTool":
      return { type: "link", title: item.title.trim(), itemType: "link", url: item.external_url ?? item.html_url };
    default:
      return null;
  }
}

export function modulesOf(courseId: number, force = false) {
  return remember(`modules:${courseId}`, 3 * 60e3, force, () => canvas.modules(courseId));
}

/** Canvas modules, websites, uploads and notes for a class, in the order the course page shows them. */
export async function getCourseMaterials(courseId: number, force = false): Promise<CourseMaterials> {
  const base: CourseMaterials =
    courseId > 0 ? await canvasMaterials(courseId, force) : { modules: [], otherFiles: [], otherPages: [], all: {} };
  const extra = extrasModules(getExtras(courseId));
  const all = { ...base.all };
  for (const mod of extra) for (const e of mod.entries) if (e.type === "material") all[e.material.key] = e.material;
  return { modules: [...base.modules, ...extra], otherFiles: base.otherFiles, otherPages: base.otherPages, all };
}

function extrasModules(ex: Extras): ModuleView[] {
  const mods: ModuleView[] = [];
  ex.sites.forEach((site, i) => {
    const module = `Course website: ${site.title}`;
    const entries: ModuleEntry[] = [
      ...site.pages.map((pg) => ({
        type: "material" as const,
        material: { key: `web:${pg.url}`, kind: "web" as const, title: pg.title, module, supported: true, url: pg.url },
      })),
      ...site.files.map((f) => ({
        type: "material" as const,
        material: {
          key: `url:${f.url}`,
          kind: "file" as const,
          fileKind: f.kind,
          title: f.name,
          module,
          supported: READABLE.has(f.kind),
          reason: READABLE.has(f.kind) ? undefined : KIND_REASON[f.kind],
          url: f.url,
        },
      })),
    ];
    mods.push({ id: -1000 - i, name: module, entries });
  });
  if (ex.files.length) {
    mods.push({
      id: -2000,
      name: "Your uploaded files",
      entries: ex.files.map((f) => ({
        type: "material" as const,
        material: {
          key: `upload:${f.id}`,
          kind: "upload" as const,
          fileKind: f.kind,
          title: f.name,
          module: "Your uploaded files",
          size: f.size,
          supported: READABLE.has(f.kind),
          reason: READABLE.has(f.kind) ? undefined : KIND_REASON[f.kind],
        },
      })),
    });
  }
  if (ex.notes.trim()) {
    mods.push({
      id: -3000,
      name: "Your notes",
      entries: [{ type: "material", material: { key: "notes:main", kind: "notes", title: "Pasted notes and syllabus", module: "Your notes", supported: true } }],
    });
  }
  return mods;
}

export function summarizeExtras(ex: Extras): ExtrasSummary {
  return {
    sites: ex.sites.map((s) => ({ url: s.url, title: s.title, pages: s.pages.length, files: s.files.length, dates: s.events.length, fetchedAt: s.fetchedAt })),
    files: ex.files.map((f) => ({ id: f.id, name: f.name, size: f.size, kind: f.kind })),
    notes: ex.notes,
    notesDates: ex.notesEvents.length,
  };
}

function canvasMaterials(courseId: number, force = false): Promise<CourseMaterials> {
  return remember(`materials:${courseId}`, 5 * 60e3, force, async () => {
    const [modules, files, pages] = await Promise.all([
      modulesOf(courseId, force),
      // Many courses hide the Files and Pages tabs from students; module items still work.
      canvas.files(courseId).catch(() => [] as CanvasFile[]),
      canvas.pages(courseId).catch(() => [] as CanvasPage[]),
    ]);
    const fileById = new Map(files.map((f) => [f.id, f]));
    const all: Record<string, Material> = {};
    const views: ModuleView[] = [];
    for (const mod of [...modules].sort((a, b) => a.position - b.position)) {
      const entries: ModuleEntry[] = [];
      for (const item of mod.items ?? []) {
        const e = entryFor(courseId, item, mod.name.trim(), fileById);
        if (!e) continue;
        if (e.type === "material") {
          if (all[e.material.key]) continue;
          all[e.material.key] = e.material;
        }
        entries.push(e);
      }
      views.push({ id: mod.id, name: mod.name.trim(), entries });
    }
    const otherFiles = files
      .filter((f) => !all[`file:${f.id}`] && !f.hidden_for_user)
      .map((f) => fileMaterial(courseId, f.id, f.display_name, f.display_name || f.filename, "Other course files", f.size));
    const otherPages = pages
      .filter((p) => !all[`page:${p.url}`])
      .map((p) => pageMaterial(courseId, p.url, p.title, "Other course pages"));
    for (const m of [...otherFiles, ...otherPages]) all[m.key] = m;
    return { modules: views, otherFiles, otherPages, all };
  });
}

type Loaded =
  | { kind: "text"; title: string; text: string; units?: number; unitLabel?: string; cached: boolean; isPdf: boolean }
  | { kind: "pdf"; title: string; data: string; pages: number; bytes: number };

async function loadMaterial(courseId: number, m: Material, visual: boolean): Promise<Loaded> {
  if (m.kind === "notes") {
    return { kind: "text", title: "Your notes", text: getExtras(courseId).notes, cached: true, isPdf: false };
  }
  if (m.kind === "web") {
    const page = await fetchPage(m.key.slice("web:".length));
    return { kind: "text", title: page.title || m.title, text: htmlToMarkdown(page.html), cached: false, isPdf: false };
  }
  if (m.kind === "upload") {
    const f = getExtras(courseId).files.find((x) => `upload:${x.id}` === m.key);
    if (!f) throw new Error("That uploaded file is gone. Upload it again.");
    return readBuffer(`upload:${courseId}:${f.id}`, "1", f.name, f.kind, visual, () => fs.readFileSync(uploadPath(courseId, f.stored)));
  }
  if (m.key.startsWith("url:")) {
    const url = m.key.slice("url:".length);
    // Linked files are re-read at most once a day.
    return readBuffer(`url:${url}`, dateKey(new Date()), m.title, m.fileKind ?? fileKind(m.title), visual, () => fetchFile(url));
  }
  if (m.kind === "page") {
    const slug = m.key.slice("page:".length);
    const page = await canvas.page(courseId, slug);
    if (page.locked_for_user) throw new Error("This page is locked.");
    const cacheKey = `${courseId}:page:${slug}`;
    const hit = getCached(cacheKey, page.updated_at);
    if (hit) return { kind: "text", title: m.title, text: hit.text, cached: true, isPdf: false };
    const text = htmlToMarkdown(page.body ?? "");
    putCached({ key: cacheKey, version: page.updated_at, title: m.title, text });
    return { kind: "text", title: m.title, text, cached: false, isPdf: false };
  }

  const fileId = Number(m.key.slice("file:".length));
  const meta = await canvas.file(courseId, fileId);
  const name = meta.display_name || meta.filename;
  const kind = fileKind(name, meta["content-type"]);
  if (!READABLE.has(kind)) throw new Error(KIND_REASON[kind] ?? "This file type isn't supported yet.");

  if (kind === "pdf" && visual) {
    const buf = await downloadFile(courseId, meta);
    return { kind: "pdf", title: name, data: buf.toString("base64"), pages: await pdfPageCount(buf), bytes: buf.length };
  }

  const cacheKey = `${courseId}:file:${fileId}`;
  const version = `${meta.updated_at}:${meta.size}`;
  const hit = getCached(cacheKey, version);
  if (hit) {
    return { kind: "text", title: name, text: hit.text, units: hit.units, unitLabel: hit.unitLabel, cached: true, isPdf: kind === "pdf" };
  }
  const buf = await downloadFile(courseId, meta);
  const ex = await extractFile(kind, buf, name);
  putCached({ key: cacheKey, version, title: name, text: ex.text, units: ex.units, unitLabel: ex.unitLabel });
  return { kind: "text", title: name, text: ex.text, units: ex.units, unitLabel: ex.unitLabel, cached: false, isPdf: kind === "pdf" };
}

const PREVIEW_CHARS = 80_000;

/** Read one material as text, exactly as a study guide would see it. No AI involved. */
export async function previewMaterial(courseId: number, key: string): Promise<MaterialPreview> {
  const m = (await getCourseMaterials(courseId)).all[key];
  if (!m) throw new CanvasError(404, "That material isn't in this course anymore. Refresh the page.");
  if (!m.supported) throw new Error(m.reason ?? "This file type isn't supported yet.");
  const r = await loadMaterial(courseId, m, false);
  if (r.kind !== "text") throw new Error("Couldn't read this material as text.");
  const text = r.text.trim();
  return {
    title: r.title,
    text: text.slice(0, PREVIEW_CHARS),
    truncated: text.length > PREVIEW_CHARS,
    chars: text.length,
    approxTokens: approxTokens(text.length),
    units: r.units,
    unitLabel: r.unitLabel,
    cached: r.cached,
    lowText: r.isPdf && !!r.units && text.length / r.units < 120,
  };
}

/** Extract a non-Canvas file (upload or linked document), using the text cache. */
async function readBuffer(
  cacheKey: string,
  version: string,
  name: string,
  kind: Material["fileKind"] & string,
  visual: boolean,
  load: () => Buffer | Promise<Buffer>,
): Promise<Loaded> {
  if (!READABLE.has(kind)) throw new Error(KIND_REASON[kind] ?? "This file type isn't supported yet.");
  if (kind === "pdf" && visual) {
    const buf = await load();
    return { kind: "pdf", title: name, data: buf.toString("base64"), pages: await pdfPageCount(buf), bytes: buf.length };
  }
  const hit = getCached(cacheKey, version);
  if (hit) return { kind: "text", title: name, text: hit.text, units: hit.units, unitLabel: hit.unitLabel, cached: true, isPdf: kind === "pdf" };
  const ex = await extractFile(kind, await load(), name);
  putCached({ key: cacheKey, version, title: name, text: ex.text, units: ex.units, unitLabel: ex.unitLabel });
  return { kind: "text", title: name, text: ex.text, units: ex.units, unitLabel: ex.unitLabel, cached: false, isPdf: kind === "pdf" };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

const xmlAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export type Gathered = {
  blocks: Anthropic.Beta.BetaContentBlockParam[];
  used: UsedSource[];
  skipped: { title: string; reason: string }[];
};

/**
 * Download and read the selected materials (in course order) and turn them into
 * content blocks for the model: text in <source> tags, or whole PDFs in visual mode.
 */
export async function gatherSources(
  courseId: number,
  materials: Material[],
  opts: { visual: boolean; signal: AbortSignal; onStatus: (s: string) => void },
): Promise<Gathered> {
  const results = await mapLimit(materials, 3, async (m) => {
    if (opts.signal.aborted) throw new Error("Cancelled");
    opts.onStatus(`Reading ${m.title}…`);
    try {
      const r = await loadMaterial(courseId, m, opts.visual);
      if (r.kind === "pdf") opts.onStatus(`✓ ${r.title} (${r.pages} pages, read visually)`);
      else opts.onStatus(`✓ ${r.title}${r.units && r.unitLabel !== "section" ? ` (${r.units} ${r.unitLabel}s)` : ""}${r.cached ? " (cached)" : ""}`);
      return { m, r };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      opts.onStatus(`⚠ Skipped ${m.title}: ${reason}`);
      return { m, error: reason };
    }
  });

  const out: Gathered = { blocks: [], used: [], skipped: [] };
  let textTokens = 0;
  let visualPages = 0;
  let visualBytes = 0;
  const sizes: { title: string; tokens: number }[] = [];

  for (const res of results) {
    if ("error" in res) {
      out.skipped.push({ title: res.m.title, reason: res.error ?? "Unknown error" });
      continue;
    }
    const { m, r } = res;
    if (r.kind === "pdf") {
      visualPages += r.pages;
      visualBytes += r.bytes;
      sizes.push({ title: r.title, tokens: r.pages * TOKENS_PER_VISUAL_PAGE });
      out.blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: r.data },
        title: r.title,
        context: `Course module: ${m.module}`,
      });
      out.used.push({ key: m.key, title: r.title, units: r.pages, unitLabel: "page", chars: 0, visual: true });
      continue;
    }
    const text = r.text.trim();
    if (text.length < 20) {
      out.skipped.push({ title: r.title, reason: r.isPdf ? "No readable text (probably scanned). Try “Read PDFs visually”." : "It's empty." });
      continue;
    }
    const lowText = r.isPdf && !!r.units && text.length / r.units < 120;
    if (lowText) opts.onStatus(`Note: ${r.title} has very little text (mostly images?). “Read PDFs visually” would capture more.`);
    const tokens = approxTokens(text.length);
    textTokens += tokens;
    sizes.push({ title: r.title, tokens });
    const kindLabel =
      m.kind === "page"
        ? "course page"
        : m.kind === "web"
          ? "course website page"
          : m.kind === "notes"
            ? "notes the student pasted in"
            : r.units && r.unitLabel !== "section"
              ? `${m.kind === "upload" ? "uploaded" : "course"} file, ${r.units} ${r.unitLabel}s`
              : `${m.kind === "upload" ? "uploaded" : "course"} file`;
    out.blocks.push({
      type: "text",
      text: `<source title="${xmlAttr(r.title)}" module="${xmlAttr(m.module)}" kind="${kindLabel}">\n${text}\n</source>`,
    });
    out.used.push({ key: m.key, title: r.title, units: r.units, unitLabel: r.unitLabel, chars: text.length, lowText });
  }

  const tooMuch =
    textTokens + visualPages * TOKENS_PER_VISUAL_PAGE > MAX_TEXT_TOKENS ||
    visualPages > MAX_VISUAL_PAGES ||
    visualBytes > MAX_VISUAL_BYTES;
  if (tooMuch) {
    const biggest = sizes
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 3)
      .map((s) => `${s.title} (~${Math.round(s.tokens / 1000)}k)`)
      .join(", ");
    const total = Math.round((textTokens + visualPages * TOKENS_PER_VISUAL_PAGE) / 1000);
    throw new Error(
      `That's too much material for one request (~${total}k tokens${visualPages ? `, ${visualPages} PDF pages` : ""}). Deselect a few items or turn off visual reading. Biggest: ${biggest}.`,
    );
  }
  return out;
}
