import { readConfig } from "./config";

// Minimal Canvas REST client. Every request carries the student's personal
// access token, and the token is only ever sent to their own Canvas host.

export class CanvasError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "CanvasError";
  }
}

export type CanvasUser = { id: number; name: string; short_name?: string };
export type CanvasTerm = { id: number; name: string; start_at: string | null; end_at: string | null };
export type CanvasCourse = {
  id: number;
  name: string;
  course_code: string;
  created_at: string;
  enrollment_term_id?: number;
  course_color?: string | null;
  term?: CanvasTerm;
  enrollments?: { type: string; computed_current_score?: number | null }[];
  syllabus_body?: string | null;
};
export type CanvasSubmission = {
  workflow_state: string;
  score: number | null;
  missing?: boolean;
  late?: boolean;
  excused?: boolean | null;
  submitted_at: string | null;
};
export type CanvasAssignment = {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission_types: string[];
  is_quiz_assignment?: boolean;
  submission?: CanvasSubmission;
};
export type CanvasModuleItem = {
  id: number;
  title: string;
  type: string;
  content_id?: number;
  page_url?: string;
  external_url?: string;
  html_url?: string;
  content_details?: { locked_for_user?: boolean; display_name?: string };
};
export type CanvasModule = { id: number; name: string; position: number; items?: CanvasModuleItem[] };
export type CanvasFile = {
  id: number;
  display_name: string;
  filename: string;
  "content-type": string;
  url: string;
  size: number;
  updated_at: string;
  locked_for_user?: boolean;
  hidden_for_user?: boolean;
};
export type CanvasPage = {
  url: string;
  title: string;
  updated_at: string;
  body?: string | null;
  locked_for_user?: boolean;
};

type Auth = { base: string; origin: string; token: string };

function auth(): Auth {
  const c = readConfig();
  if (!c.canvasBaseUrl || !c.canvasToken) {
    throw new CanvasError(401, "Canvas isn't connected yet. Add your Canvas address and access token on the Connect page.");
  }
  return makeAuth(c.canvasBaseUrl, c.canvasToken);
}

function makeAuth(baseUrl: string, token: string): Auth {
  const base = baseUrl.replace(/\/+$/, "");
  return { base, origin: new URL(base).origin, token };
}

async function send(url: string, a: Auth): Promise<Response> {
  if (new URL(url).origin !== a.origin) {
    throw new CanvasError(400, "Refusing to send your Canvas token to a different website.");
  }
  return fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${a.token}` },
    cache: "no-store",
  });
}

function explain(status: number, path: string): string {
  if (status === 401) return "Canvas rejected the access token. It may have expired or been deleted. Make a new one and paste it on the Connect page.";
  if (status === 403) return `Canvas says you don't have access to that (${path}).`;
  if (status === 404) return `Canvas couldn't find ${path}.`;
  return `Canvas returned an error (${status}) for ${path}.`;
}

async function get<T>(path: string, a: Auth = auth()): Promise<T> {
  const res = await send(a.base + path, a);
  if (!res.ok) throw new CanvasError(res.status, explain(res.status, path));
  return (await res.json()) as T;
}

async function getAll<T>(path: string, a: Auth = auth(), maxPages = 30): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = a.base + path + (path.includes("?") ? "&" : "?") + "per_page=100";
  for (let i = 0; url && i < maxPages; i++) {
    const res = await send(url, a);
    if (!res.ok) throw new CanvasError(res.status, explain(res.status, path));
    out.push(...((await res.json()) as T[]));
    url = nextLink(res.headers.get("link"));
  }
  return out;
}

function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

export const canvas = {
  self: () => get<CanvasUser>("/api/v1/users/self"),
  courses: () =>
    getAll<CanvasCourse>(
      "/api/v1/courses?enrollment_state=active&include[]=term&include[]=total_scores&include[]=syllabus_body",
    ),
  course: (id: number) =>
    get<CanvasCourse>(`/api/v1/courses/${id}?include[]=term&include[]=total_scores&include[]=syllabus_body`),
  assignments: (id: number) =>
    getAll<CanvasAssignment>(`/api/v1/courses/${id}/assignments?include[]=submission&order_by=due_at`),
  modules: async (id: number) => {
    const mods = await getAll<CanvasModule>(`/api/v1/courses/${id}/modules?include[]=items&include[]=content_details`);
    // Canvas may leave out `items` for big modules; fetch those separately.
    await Promise.all(
      mods
        .filter((m) => !m.items)
        .map(async (m) => {
          m.items = await getAll<CanvasModuleItem>(`/api/v1/courses/${id}/modules/${m.id}/items?include[]=content_details`);
        }),
    );
    return mods;
  },
  files: (id: number) => getAll<CanvasFile>(`/api/v1/courses/${id}/files?sort=updated_at&order=desc`),
  pages: (id: number) => getAll<CanvasPage>(`/api/v1/courses/${id}/pages?sort=title`),
  page: (id: number, slug: string) => get<CanvasPage>(`/api/v1/courses/${id}/pages/${encodeURIComponent(slug)}`),
  file: (courseId: number, fileId: number) => get<CanvasFile>(`/api/v1/courses/${courseId}/files/${fileId}`),
};

/** Check a Canvas address + token before saving them. */
export async function checkCanvas(baseUrl: string, token: string): Promise<CanvasUser> {
  return get<CanvasUser>("/api/v1/users/self", makeAuth(baseUrl, token));
}

export function canvasWebUrl(path: string): string {
  const c = readConfig();
  return (c.canvasBaseUrl ?? "").replace(/\/+$/, "") + path;
}

/**
 * Download a course file. Canvas answers with a redirect to its file storage;
 * the token goes only to the Canvas host, never to the storage host.
 */
export async function downloadFile(courseId: number, meta: CanvasFile, maxBytes = 60 * 1024 * 1024): Promise<Buffer> {
  const a = auth();
  if (!meta.url || meta.locked_for_user) throw new CanvasError(403, `"${meta.display_name}" is locked, so it can't be downloaded yet.`);
  if (meta.size > maxBytes) {
    throw new CanvasError(413, `"${meta.display_name}" is too big (${Math.round(meta.size / 1e6)} MB).`);
  }
  let url = meta.url;
  for (let hop = 0; hop < 6; hop++) {
    const sameHost = new URL(url).origin === a.origin;
    const res = await fetch(url, {
      redirect: "manual",
      headers: sameHost ? { Authorization: `Bearer ${a.token}` } : {},
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url).toString();
      continue;
    }
    if (!res.ok) throw new CanvasError(res.status, `Couldn't download "${meta.display_name}" (error ${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new CanvasError(502, `Couldn't download "${meta.display_name}" (too many redirects).`);
}
