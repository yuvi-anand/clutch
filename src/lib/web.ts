import { fileKind, htmlToMarkdown } from "./extract";
import type { FileKind } from "./types";

// Reads public course websites. Only http(s) URLs on public hosts: the app runs
// on your computer, so it refuses addresses that point at it or your network.

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";
const DOC = /\.(pdf|pptx|docx|txt|md|tex)$/i;

export function checkPublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error("That doesn't look like a web address.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http and https links work.");
  if (PRIVATE_HOST.test(u.hostname)) throw new Error("That address points at this computer or a private network, so it can't be used.");
  u.hash = "";
  return u;
}

async function get(url: string, maxBytes: number): Promise<{ buf: Buffer; type: string; finalUrl: string }> {
  checkPublicUrl(url);
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(25_000), cache: "no-store" });
  checkPublicUrl(res.url || url);
  if (res.status === 401 || res.status === 403) throw new Error("That page needs a login, so the app can't read it. Download the files and upload them instead.");
  if (!res.ok) throw new Error(`The site returned an error (${res.status}).`);
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > maxBytes) throw new Error(`That file is too big (${Math.round(size / 1e6)} MB).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`That file is too big (${Math.round(buf.length / 1e6)} MB).`);
  return { buf, type: res.headers.get("content-type") ?? "", finalUrl: res.url || url };
}

export async function fetchPage(url: string): Promise<{ title: string; html: string; finalUrl: string }> {
  const { buf, type, finalUrl } = await get(url, 4_000_000);
  if (!/html|xml|text\/plain/i.test(type) && type) throw new Error("That link isn't a web page.");
  const html = buf.toString("utf8");
  if (/<input[^>]+type=["']?password/i.test(html) && /log ?in|sign ?in/i.test(html)) {
    throw new Error("That page is a login screen, so the app can't read it. Download the files and upload them instead.");
  }
  return { title: pageTitle(html) || new URL(finalUrl).pathname, html, finalUrl };
}

export async function fetchFile(url: string): Promise<Buffer> {
  return (await get(url, 60_000_000)).buf;
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&(ndash|mdash);/g, "–")
    .trim();
}

function pageTitle(html: string): string {
  return decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ") ?? "");
}

function links(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(decode(m[1]), base);
      if (u.protocol === "http:" || u.protocol === "https:") {
        u.hash = "";
        out.push({ url: u.toString(), text: decode(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) });
      }
    } catch {
      // Ignore malformed links.
    }
  }
  return out;
}

export type SitePage = { url: string; title: string; markdown: string };
export type SiteFile = { url: string; name: string; kind: FileKind };

/**
 * Read a course site: the page itself, same-site pages it links to in the same
 * folder (Schedule, Assignments, ...), and the documents it links to.
 */
export async function crawlSite(rootUrl: string): Promise<{ title: string; url: string; pages: SitePage[]; files: SiteFile[] }> {
  const root = await fetchPage(rootUrl);
  const base = new URL(root.finalUrl);
  const folder = base.pathname.replace(/[^/]*$/, "");
  const found = links(root.html, root.finalUrl);

  const pageUrls = [...new Set(found.map((l) => l.url))].filter((u) => {
    const x = new URL(u);
    return x.origin === base.origin && x.pathname.startsWith(folder) && !DOC.test(x.pathname) && x.toString() !== base.toString() && /(\/|\.html?|\/[^./]+)$/i.test(x.pathname);
  });
  const pages: SitePage[] = [{ url: root.finalUrl, title: root.title, markdown: htmlToMarkdown(root.html) }];
  const allLinks = [...found];
  for (const u of pageUrls.slice(0, 10)) {
    try {
      const p = await fetchPage(u);
      const markdown = htmlToMarkdown(p.html);
      if (pages.some((x) => x.url === p.finalUrl || x.markdown === markdown)) continue;
      pages.push({ url: p.finalUrl, title: p.title, markdown });
      allLinks.push(...links(p.html, p.finalUrl));
    } catch {
      // Skip pages that fail; the rest still help.
    }
  }

  const files: SiteFile[] = [];
  for (const l of allLinks) {
    const name = decodeURIComponent(new URL(l.url).pathname.split("/").pop() ?? "");
    if (!DOC.test(name) || files.some((f) => f.url === l.url)) continue;
    files.push({ url: l.url, name, kind: fileKind(name) });
    if (files.length >= 60) break;
  }
  const siteTitle = root.title.replace(/^(home|index)\s*[-–|:]\s*/i, "");
  return { title: siteTitle, url: root.finalUrl, pages, files };
}
