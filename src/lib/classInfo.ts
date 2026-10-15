import type Anthropic from "@anthropic-ai/sdk";
import { remember } from "./cache";
import { canvas, type CanvasAnnouncement, type CanvasAssignmentGroup, type CanvasCourse } from "./canvas";
import { courseScore } from "./courses";
import { htmlToMarkdown } from "./extract";
import { getExtras } from "./extras";
import { gatherSources, getCourseMaterials } from "./materials";
import type { Material } from "./types";

// What Clutch knows about how a class runs: the syllabus, Canvas's grade
// setup, announcements and policy pages. Used to answer questions like
// "are exams curved?" or "what's the late policy?".

export type ClassSources = { blocks: Anthropic.Beta.BetaContentBlockParam[]; used: string[] };

/** Course pages and files that usually hold the rules of the class. */
const POLICY = /syllab|polic|logistic|course info|overview|getting started|grading|faq|welcome|about|information|expectation|late work|attendance/i;
const MAX_MATERIALS = 6;
const MAX_SYLLABUS = 60_000;
const MAX_ANNOUNCEMENT = 4_000;
const MAX_ANNOUNCEMENTS = 25_000;

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const source = (title: string, kind: string, text: string): Anthropic.Beta.BetaContentBlockParam => ({
  type: "text",
  text: `<source title="${attr(title)}" kind="${attr(kind)}">\n${text}\n</source>`,
});
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Canvas's gradebook setup, in words: group weights, drop rules, and the student's scores so far. */
function gradeSetup(course: CanvasCourse, groups: CanvasAssignmentGroup[]): string {
  const weighted = Boolean(course.apply_assignment_group_weights);
  const lines = [
    weighted
      ? "Canvas computes the final grade from weighted assignment groups:"
      : "Canvas does not weight assignment groups here: the grade is total points earned over total points possible. Groups:",
  ];
  for (const g of groups) {
    const rules = [g.rules?.drop_lowest ? `drops the lowest ${g.rules.drop_lowest}` : "", g.rules?.drop_highest ? `drops the highest ${g.rules.drop_highest}` : ""]
      .filter(Boolean)
      .join(", ");
    const items = g.assignments ?? [];
    const graded = items.filter((a) => a.submission?.score != null && a.points_possible);
    const points = items.reduce((t, a) => t + (a.points_possible ?? 0), 0);
    lines.push(`- ${g.name}${weighted ? `: ${g.group_weight}% of the final grade` : `: ${points} points in all`}${rules ? ` (${rules})` : ""}, ${items.length} assignment${items.length === 1 ? "" : "s"}`);
    for (const a of graded) lines.push(`  - ${a.name}: ${a.submission!.score}/${a.points_possible}`);
  }
  const score = courseScore(course);
  lines.push(score == null ? "Canvas doesn't show a current total score." : `Current total score in Canvas: ${score.toFixed(1)}%.`);
  return lines.join("\n");
}

function announcementBlocks(list: CanvasAnnouncement[]): Anthropic.Beta.BetaContentBlockParam[] {
  const out: Anthropic.Beta.BetaContentBlockParam[] = [];
  let total = 0;
  const newest = [...list].sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
  for (const a of newest) {
    const text = htmlToMarkdown(a.message ?? "").slice(0, MAX_ANNOUNCEMENT).trim();
    if (!text) continue;
    total += text.length;
    if (total > MAX_ANNOUNCEMENTS) break;
    out.push(source(`Announcement: ${a.title}`, `Canvas announcement${a.posted_at ? `, posted ${fmtDate(a.posted_at)}` : ""}`, text));
  }
  return out;
}

/** Policy-looking pages and files, each course website's home page, and the student's pasted notes. */
function policyMaterials(all: Record<string, Material>, siteUrls: string[]): Material[] {
  const list = Object.values(all).filter((m) => m.supported);
  const picked = [
    ...list.filter((m) => m.kind === "notes"),
    ...list.filter((m) => m.kind === "web" && m.url && siteUrls.includes(m.url)),
    ...list.filter((m) => POLICY.test(m.title)),
  ];
  return [...new Map(picked.map((m) => [m.key, m])).values()].slice(0, MAX_MATERIALS);
}

/** Everything to answer class questions from. Cached for 10 minutes so follow-up questions are quick. */
export function classSources(courseId: number, signal: AbortSignal, onStatus: (s: string) => void, force = false): Promise<ClassSources> {
  return remember(`classinfo:${courseId}`, 10 * 60e3, force, async () => {
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
    const used: string[] = [];

    if (courseId > 0) {
      onStatus("Reading the syllabus and grade setup…");
      const course = await canvas.course(courseId);
      const since = new Date(Date.now() - 150 * 86400e3).toISOString().slice(0, 10);
      const [groups, announcements] = await Promise.all([
        canvas.assignmentGroups(courseId).catch(() => [] as CanvasAssignmentGroup[]),
        canvas.announcements(courseId, since).catch(() => [] as CanvasAnnouncement[]),
      ]);
      const syllabus = htmlToMarkdown(course.syllabus_body ?? "").trim();
      if (syllabus) {
        blocks.push(source("Syllabus", "the syllabus on Canvas", syllabus.slice(0, MAX_SYLLABUS)));
        used.push("Syllabus");
      }
      if (groups.length) {
        blocks.push(source("Canvas grade setup", "how Canvas computes the grade, and the student's scores", gradeSetup(course, groups)));
        used.push("Canvas grade setup");
      }
      const ann = announcementBlocks(announcements);
      if (ann.length) {
        blocks.push(...ann);
        used.push(`${ann.length} announcement${ann.length === 1 ? "" : "s"}`);
      }
    }

    const mats = await getCourseMaterials(courseId).catch(() => null);
    const picked = mats ? policyMaterials(mats.all, getExtras(courseId).sites.map((s) => s.url)) : [];
    if (picked.length) {
      onStatus(`Reading ${picked.map((m) => m.title).join(", ")}…`);
      const gathered = await gatherSources(courseId, picked, { visual: false, signal, onStatus: () => {} }).catch(() => null);
      if (gathered) {
        blocks.push(...gathered.blocks);
        used.push(...gathered.used.map((u) => u.title));
      }
    }
    // Don't cache a half-read answer source if the student left mid-way.
    if (signal.aborted) throw new Error("Cancelled");
    return { blocks, used };
  });
}
