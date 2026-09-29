import path from "node:path";
import JSZip from "jszip";
import TurndownService from "turndown";
import { extractText, getDocumentProxy } from "unpdf";
import type { FileKind } from "./types";

// Turn course files into plain text the model can read, keeping page/slide
// markers so study guides can cite "[lecture05.pdf p.4]".

export type Extracted = { text: string; units: number; unitLabel: "page" | "slide" | "section" };

const TEXT_EXT = new Set(
  "txt md markdown tex bib java py js ts jsx tsx c h cpp hpp cc cs go rs rb sh zsh sql json csv tsv yml yaml xml html htm css ipynb r scala kt swift rkt hs ml".split(" "),
);
const RECORDING_EXT = new Set("mp4 mov m4v webm mkv avi mp3 m4a wav aac ogg".split(" "));

export function fileKind(name: string, contentType = ""): FileKind {
  const ext = extOf(name);
  if (ext === "pdf" || contentType === "application/pdf") return "pdf";
  if (ext === "pptx") return "pptx";
  if (ext === "docx") return "docx";
  if (ext === "ppt" || ext === "doc") return "legacy";
  if (RECORDING_EXT.has(ext) || /^(video|audio)\//.test(contentType)) return "recording";
  if (TEXT_EXT.has(ext) || /^text\//.test(contentType)) return "text";
  return "unsupported";
}

export const KIND_REASON: Partial<Record<FileKind, string>> = {
  recording: "Lecture recordings aren't supported yet",
  legacy: "Old Office format. Re-save as .pptx or .docx to use it",
  unsupported: "This file type isn't supported yet",
};

function extOf(name: string) {
  return (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
}

function tidy(s: string) {
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function pdfToText(buf: Buffer): Promise<Extracted> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((t, i) => `[p.${i + 1}]\n${tidy(t)}`);
  return { text: pages.join("\n\n"), units: totalPages, unitLabel: "page" };
}

export async function pdfPageCount(buf: Buffer): Promise<number> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  return pdf.numPages;
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Text of each <p> paragraph in Office XML, joining its <t> runs. */
function paragraphs(xml: string, p: string, t: string): string[] {
  const pRe = new RegExp(`<${p}[\\s>][\\s\\S]*?</${p}>`, "g");
  const tRe = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, "g");
  const out: string[] = [];
  for (const para of xml.match(pRe) ?? []) {
    const line = [...para.matchAll(tRe)].map((m) => decodeXml(m[1])).join("").trim();
    if (line) out.push(line);
  }
  return out;
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? "";
}

export async function pptxToText(buf: Buffer): Promise<Extracted> {
  const zip = await JSZip.loadAsync(buf);
  const read = (p: string) => zip.file(p)?.async("string");

  // Slide order comes from presentation.xml, not the file names.
  let order: string[] = [];
  const [pres, rels] = await Promise.all([read("ppt/presentation.xml"), read("ppt/_rels/presentation.xml.rels")]);
  if (pres && rels) {
    const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
    order = [...pres.matchAll(/<p:sldId\b[^>]*>/g)]
      .map((m) => targets.get(attr(m[0], "r:id")) ?? "")
      .filter(Boolean)
      .map((t) => "ppt/" + t.replace(/^\/?(ppt\/)?/, ""));
  }
  if (!order.length) {
    const num = (f: string) => Number(f.match(/(\d+)\.xml$/)?.[1] ?? 0);
    order = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => num(a) - num(b));
  }

  const parts: string[] = [];
  for (const [i, slidePath] of order.entries()) {
    const xml = await read(slidePath);
    if (!xml) continue;
    const lines = paragraphs(xml, "a:p", "a:t");
    let notes = "";
    const slideRels = await read(slidePath.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"));
    const notesTarget = slideRels?.match(/Target="([^"]*notesSlide\d+\.xml)"/)?.[1];
    if (notesTarget) {
      const notesXml = await read(path.posix.normalize(path.posix.join(path.posix.dirname(slidePath), notesTarget)));
      if (notesXml) notes = paragraphs(notesXml, "a:p", "a:t").filter((l) => !/^\d+$/.test(l)).join(" ");
    }
    parts.push(`[slide ${i + 1}]\n${lines.join("\n")}${notes ? `\n(Speaker notes: ${notes})` : ""}`);
  }
  return { text: parts.join("\n\n"), units: parts.length, unitLabel: "slide" };
}

export async function docxToText(buf: Buffer): Promise<Extracted> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("That .docx file couldn't be read.");
  return { text: paragraphs(xml, "w:p", "w:t").join("\n"), units: 1, unitLabel: "section" };
}

let td: TurndownService | null = null;
function turndown() {
  if (td) return td;
  td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  td.remove(["script", "style", "noscript"]);
  td.addRule("pre", {
    filter: "pre",
    replacement: (_content, node) => `\n\n\`\`\`\n${(node.textContent ?? "").replace(/\n+$/, "")}\n\`\`\`\n\n`,
  });
  td.addRule("img", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const equation = el.getAttribute("data-equation-content");
      if (equation) return `$${equation}$`;
      const alt = (el.getAttribute("alt") ?? "").trim();
      return alt ? `[image: ${alt}]` : "";
    },
  });
  td.addRule("iframe", {
    filter: "iframe",
    replacement: (_content, node) => {
      const title = (node as HTMLElement).getAttribute("title");
      return title ? `[embedded: ${title}]` : "";
    },
  });
  return td;
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";
  return turndown()
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textFileToText(buf: Buffer, name: string): Extracted {
  const sample = buf.subarray(0, 4096);
  if (sample.filter((b) => b === 0).length > 8) throw new Error(`"${name}" looks like a binary file.`);
  const raw = buf.toString("utf8");
  const ext = extOf(name);
  const text = ext === "html" || ext === "htm" ? htmlToMarkdown(raw) : raw;
  return { text: text.trim(), units: 1, unitLabel: "section" };
}

export async function extractFile(kind: FileKind, buf: Buffer, name: string): Promise<Extracted> {
  if (kind === "pdf") return pdfToText(buf);
  if (kind === "pptx") return pptxToText(buf);
  if (kind === "docx") return docxToText(buf);
  if (kind === "text") return textFileToText(buf, name);
  throw new Error(KIND_REASON[kind] ?? "Unsupported file");
}
