import { canvas, type CanvasAssignment, type CanvasCourse, type CanvasModule } from "./canvas";
import { peek, remember } from "./cache";
import { readConfig } from "./config";
import { courseColor, courseLabel, courseScore, splitCourses } from "./courses";
import { htmlToMarkdown } from "./extract";
import { modulesOf } from "./materials";
import { loadPersonal, personalDashItems, personalPlanBlock } from "./personal";
import { eventMentions, stripDates } from "./text";
import type { DashCourse, DashItem, Dashboard, ItemStatus } from "./types";

// Builds the "where do I stand" view from Canvas: deadlines, missing work,
// low scores, plus exam/quiz dates mentioned in syllabi and module headers.

type CourseData = {
  course: CanvasCourse;
  color: string;
  assignments: CanvasAssignment[];
  modules: CanvasModule[];
  syllabus: string;
};

export type Snapshot = { userName: string; at: string; visible: CourseData[]; hidden: CanvasCourse[] };

const TTL = 3 * 60e3;
const DAY = 86400e3;

export function getSnapshot(force = false): Promise<Snapshot> {
  return remember("snapshot", TTL, force, async () => {
    const cfg = readConfig();
    const [user, courses] = await Promise.all([canvas.self(), canvas.courses()]);
    const { visible, hidden } = splitCourses(courses, cfg.courseOverrides);
    const data = await Promise.all(
      visible.map(async (course) => {
        const [assignments, modules] = await Promise.all([
          canvas.assignments(course.id).catch(() => [] as CanvasAssignment[]),
          modulesOf(course.id, force).catch(() => [] as CanvasModule[]),
        ]);
        return {
          course,
          color: courseColor(course, courses.indexOf(course)),
          assignments,
          modules,
          syllabus: htmlToMarkdown(course.syllabus_body ?? ""),
        };
      }),
    );
    return { userName: user.short_name || user.name, at: new Date().toISOString(), visible: data, hidden };
  });
}

export function courseColorFor(courseId: number): string | null {
  return peek<Snapshot>("snapshot", 60 * 60e3)?.visible.find((c) => c.course.id === courseId)?.color ?? null;
}

// Submission types that happen inside Canvas. Anything else (external tool,
// on paper, none) is turned in elsewhere, so Canvas can't tell if it's done.
const CANVAS_SUBMIT = new Set([
  "online_upload",
  "online_text_entry",
  "online_url",
  "online_quiz",
  "media_recording",
  "student_annotation",
  "discussion_topic",
]);
const ASSESSMENT = /\b(quiz|exam|midterm|final|test|practical)\b/i;

function assignmentItem(courseId: number, a: CanvasAssignment): DashItem {
  const s = a.submission;
  let status: ItemStatus = "upcoming";
  if (s?.excused) status = "excused";
  else if (s?.missing) status = "missing";
  else if (s?.workflow_state === "graded" && s.score != null) status = "graded";
  else if (s && (s.submitted_at || s.workflow_state === "submitted" || s.workflow_state === "pending_review")) status = "submitted";
  return {
    id: `a${a.id}`,
    courseId,
    title: a.name.trim(),
    dueAt: a.due_at,
    points: a.points_possible,
    score: s?.score ?? null,
    url: a.html_url,
    status,
    external: !a.submission_types.some((t) => CANVAS_SUBMIT.has(t)),
    source: "canvas",
    isAssessment: Boolean(a.is_quiz_assignment) || ASSESSMENT.test(a.name),
  };
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inferDate(month: number, day: number, now: Date): string {
  let d = new Date(now.getFullYear(), month, day);
  if (d.getTime() < now.getTime() - 120 * DAY) d = new Date(now.getFullYear() + 1, month, day);
  return localDateKey(d);
}

function datedMentions(text: string, now: Date) {
  return eventMentions(text).map((e) => ({ label: e.label, date: inferDate(e.month, e.day, now), snippet: e.snippet }));
}

function notesFor(cd: CourseData, now: Date): DashItem[] {
  const out = new Map<string, DashItem>();
  const add = (title: string, date: string, source: "syllabus" | "module", detail: string) => {
    const key = `${date}|${title.toLowerCase()}`;
    if (!out.has(key)) {
      out.set(key, {
        id: `n${cd.course.id}-${out.size}`,
        courseId: cd.course.id,
        title,
        dueAt: null,
        dateOnly: date,
        points: null,
        status: "note",
        source,
        detail,
        isAssessment: true,
      });
    }
  };
  for (const mod of cd.modules) {
    for (const item of mod.items ?? []) {
      if (item.type !== "SubHeader") continue;
      for (const hit of datedMentions(item.title, now)) {
        add(stripDates(item.title), hit.date, "module", `${mod.name.trim()}: “${item.title.trim()}”`);
      }
    }
  }
  for (const hit of datedMentions(cd.syllabus, now)) add(hit.label, hit.date, "syllabus", `Syllabus: “${hit.snippet}”`);
  return [...out.values()];
}

function sortKey(i: DashItem): number {
  if (i.dueAt) return Date.parse(i.dueAt);
  const [y, m, d] = (i.dateOnly ?? "").split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

function courseItems(cd: CourseData, now: Date) {
  const t = now.getTime();
  const items = cd.assignments.map((a) => assignmentItem(cd.course.id, a));
  const notes = notesFor(cd, now);
  const todayKey = localDateKey(now);
  const inWindow = (i: DashItem, days: number) =>
    i.dueAt
      ? Date.parse(i.dueAt) >= t - 12 * 3600e3 && Date.parse(i.dueAt) <= t + days * DAY
      : Boolean(i.dateOnly && i.dateOnly >= todayKey && i.dateOnly <= localDateKey(new Date(t + days * DAY)));
  const timeline = [...items.filter((i) => i.status !== "excused" && inWindow(i, 21)), ...notes.filter((n) => inWindow(n, 21))];
  const missing = items.filter((i) => i.status === "missing");
  const lowScores = items.filter(
    (i) =>
      i.status === "graded" &&
      (i.points ?? 0) > 0 &&
      (i.score ?? 0) / (i.points ?? 1) < 0.7 &&
      (!i.dueAt || Date.parse(i.dueAt) > t - 60 * DAY),
  );
  const dueThisWeek = timeline.filter((i) => (i.status === "upcoming" || i.status === "note") && inWindow(i, 7)).length;
  return { items, timeline, missing, lowScores, dueThisWeek };
}

export async function getDashboard(force = false): Promise<Dashboard> {
  const snap = await getSnapshot(force);
  const now = new Date();
  const courses: DashCourse[] = [];
  const timeline: DashItem[] = [];
  const missing: DashItem[] = [];
  const lowScores: DashItem[] = [];
  for (const cd of snap.visible) {
    const r = courseItems(cd, now);
    const { name, code } = courseLabel(cd.course);
    courses.push({ id: cd.course.id, name, code, color: cd.color, score: courseScore(cd.course), upcoming: r.dueThisWeek, missing: r.missing.length });
    timeline.push(...r.timeline);
    missing.push(...r.missing);
    lowScores.push(...r.lowScores);
  }
  timeline.push(...personalDashItems(loadPersonal(), now));
  timeline.sort((a, b) => sortKey(a) - sortKey(b));
  missing.sort((a, b) => sortKey(b) - sortKey(a));
  const hidden = snap.hidden.map((c) => {
    const { name, code } = courseLabel(c);
    return { id: c.id, name, code, color: "#a8a29e", score: courseScore(c), upcoming: 0, missing: 0 };
  });
  return { userName: snap.userName, generatedAt: snap.at, courses, hidden, timeline, missing, lowScores };
}

/** Upcoming items for one course (uses the dashboard snapshot when it's fresh). */
export async function courseUpcoming(courseId: number, force = false): Promise<DashItem[]> {
  let cd = force ? undefined : peek<Snapshot>("snapshot", TTL)?.visible.find((c) => c.course.id === courseId);
  if (!cd) {
    const [course, assignments, modules] = await Promise.all([
      canvas.course(courseId),
      canvas.assignments(courseId).catch(() => [] as CanvasAssignment[]),
      modulesOf(courseId, force).catch(() => [] as CanvasModule[]),
    ]);
    cd = { course, color: "", assignments, modules, syllabus: htmlToMarkdown(course.syllabus_body ?? "") };
  }
  return courseItems(cd, new Date()).timeline.sort((a, b) => sortKey(a) - sortKey(b));
}

const fmtWhen = (i: DashItem) =>
  i.dueAt
    ? new Date(i.dueAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : new Date(sortKey(i)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
      ` (date found in the ${i.source === "syllabus" ? "syllabus" : "module headings"})`;

const STATUS_TEXT: Record<ItemStatus, string> = {
  missing: "MISSING",
  submitted: "submitted",
  graded: "graded",
  upcoming: "not submitted yet",
  excused: "excused",
  note: "exam/quiz",
  busy: "busy",
  task: "to-do",
};

export function describeItem(i: DashItem): string {
  const pts = i.points ? ` · ${i.points} pts` : "";
  const score = i.status === "graded" && i.score != null ? ` (${i.score}/${i.points ?? "?"})` : "";
  const ext = i.external && i.status === "upcoming" ? " · turned in outside Canvas, so Canvas can't tell if it's done" : "";
  return `- ${i.title} · ${fmtWhen(i)}${pts} · ${STATUS_TEXT[i.status]}${score}${ext}`;
}

function syllabusExcerpt(md: string, max = 3500): string {
  const KEY = /(grad(e|ing)|late|drop|lowest|top \d|best \d|exam|midterm|final|quiz|weight|%|token|curve|attendance)/i;
  const out: string[] = [];
  let len = 0;
  for (const p of md.split(/\n{2,}/).map((s) => s.trim())) {
    if (!p || p.length > 1500 || !KEY.test(p)) continue;
    out.push(p);
    len += p.length;
    if (len > max) break;
  }
  return out.join("\n");
}

/** A text snapshot of every course for the catch-up plan prompt. */
export async function planContext(): Promise<string> {
  const snap = await getSnapshot();
  const now = new Date();
  const blocks: string[] = [];
  for (const cd of snap.visible) {
    const { name, code } = courseLabel(cd.course);
    const score = courseScore(cd.course);
    const r = courseItems(cd, now);
    const lines = [
      `<course id="${cd.course.id}" code="${code}" name="${name}" current_score="${score == null ? "not available" : score.toFixed(1) + "%"}">`,
      "Coming up in the next 3 weeks:",
      ...(r.timeline.length ? r.timeline.sort((a, b) => sortKey(a) - sortKey(b)).map(describeItem) : ["- nothing listed on Canvas"]),
    ];
    if (r.missing.length) lines.push("Marked missing on Canvas:", ...r.missing.map(describeItem));
    const graded = r.items.filter((i) => i.status === "graded").slice(-10);
    if (graded.length) lines.push("Graded so far:", ...graded.map((i) => `- ${i.title}: ${i.score}/${i.points ?? "?"}`));
    lines.push("Modules in order: " + (cd.modules.map((m) => m.name.trim()).join(" | ") || "none"));
    for (const m of cd.modules.filter((m) => (m.items?.length ?? 0) > 0).slice(-2)) {
      lines.push(`Items in the module "${m.name.trim()}": ` + (m.items ?? []).map((i) => i.title.trim()).join("; "));
    }
    const ex = syllabusExcerpt(cd.syllabus);
    if (ex) lines.push("Syllabus excerpts (grading, exams, late work):", ex);
    lines.push("</course>");
    blocks.push(lines.join("\n"));
  }
  const personal = personalPlanBlock(loadPersonal(), now);
  if (personal) blocks.push(personal);
  return blocks.join("\n\n");
}
