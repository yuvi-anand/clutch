import type { CanvasCourse } from "./canvas";

const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#ec4899"];

/** "CY2550 13908 Foundations of Cybersecurity SEC 05 Fall 2026 [BOS-1-TR]" -> "CY2550 Foundations of Cybersecurity", "CY 2550" */
export function courseLabel(c: CanvasCourse): { name: string; code: string } {
  const name =
    c.name
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\bSEC\s*\d+\b/gi, " ")
      .replace(/\b(Fall|Spring|Summer(\s+[12I]+)?|Winter)\s+\d{4}\b/gi, " ")
      .replace(/(^|\s)\d{5}(?=\s|$)/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim() || c.name;
  const m = `${c.name} ${c.course_code}`.match(/\b([A-Z]{2,5})\s?(\d{4})\b/);
  return { name, code: m ? `${m[1]} ${m[2]}` : c.course_code };
}

export function courseColor(c: CanvasCourse, index: number): string {
  return c.course_color && /^#[0-9a-f]{6}$/i.test(c.course_color) ? c.course_color : PALETTE[index % PALETTE.length];
}

export function courseScore(c: CanvasCourse): number | null {
  const s = c.enrollments?.find((e) => e.type === "student")?.computed_current_score;
  return typeof s === "number" ? s : null;
}

/**
 * Canvas keeps old semesters "active", and term dates are often blank. Guess the
 * current semester: real terms only (not "Default Term" orientation courses),
 * then the term(s) whose courses were created most recently.
 */
export function splitCourses(courses: CanvasCourse[], overrides: Record<string, "show" | "hide"> = {}) {
  const termId = (c: CanvasCourse) => c.term?.id ?? c.enrollment_term_id ?? -1;
  const academic = (c: CanvasCourse) => Boolean(c.term) && !/default term|group|sandbox|non-?term/i.test(c.term!.name);
  const newestByTerm = new Map<number, number>();
  for (const c of courses.filter(academic)) {
    const t = Date.parse(c.created_at) || 0;
    newestByTerm.set(termId(c), Math.max(newestByTerm.get(termId(c)) ?? 0, t));
  }
  const newest = Math.max(0, ...newestByTerm.values());
  const current = new Set([...newestByTerm].filter(([, t]) => newest - t <= 75 * 86400e3).map(([id]) => id));

  const visible: CanvasCourse[] = [];
  const hidden: CanvasCourse[] = [];
  for (const c of courses) {
    const override = overrides[String(c.id)];
    const show = override ? override === "show" : academic(c) && current.has(termId(c));
    (show ? visible : hidden).push(c);
  }
  return { visible, hidden };
}
