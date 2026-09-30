import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { runModel } from "./ai";
import { EVENTS_SYSTEM, eventsPrompt } from "./prompts";
import { dateKey } from "./text";
import type { CourseEvent, DashItem } from "./types";

const Schema = z.object({
  events: z.array(
    z.object({
      title: z.string(),
      date: z.string(),
      time: z.string(),
      kind: z.enum(["exam", "quiz", "homework", "project", "lab", "lecture", "other"]),
      notes: z.string(),
    }),
  ),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const MAX_CHARS = 80_000;

function yearNote(now: Date): string {
  const y = now.getFullYear();
  return now.getMonth() >= 6
    ? `Dates from August to December without a year are in ${y}; January to July dates are in ${y + 1}.`
    : `Dates from January to July without a year are in ${y}; August to December dates are in ${y - 1}.`;
}

/** Pull dated exams, deadlines and lecture topics out of web pages or a pasted syllabus. */
export async function extractEvents(courseName: string, docs: { title: string; text: string }[], signal?: AbortSignal): Promise<CourseEvent[]> {
  let budget = MAX_CHARS;
  const body = docs
    .map((d) => {
      const text = d.text.slice(0, Math.max(0, budget));
      budget -= text.length;
      return text.trim() ? `<document title="${d.title.replace(/"/g, "'")}">\n${text}\n</document>` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  if (!body) return [];
  const now = new Date();
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const format = betaZodOutputFormat(Schema);
  const out = await runModel({
    system: EVENTS_SYSTEM,
    content: eventsPrompt(courseName, today, yearNote(now), body),
    effort: "medium",
    maxTokens: 16000,
    format,
    signal,
  });
  const seen = new Set<string>();
  return format
    .parse(out.text)
    .events.filter((e) => DATE.test(e.date) && e.title.trim())
    .map((e) => ({ title: e.title.trim(), date: e.date, time: TIME.test(e.time) ? e.time : "", kind: e.kind, notes: e.notes.trim() }))
    .filter((e) => {
      const k = `${e.date}|${e.title.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** "Homework-2", "HW 2" and "Problem Set 2" all become "hw2", so duplicates across sources match. */
export function eventKey(title: string): string | null {
  const t = title.toLowerCase();
  const m = t.match(/\b(hw|homework|problem set|pset|ps|quiz|midterm|exam|project|lab|assignment|essay|paper)[\s#_-]*(\d+)\b/);
  if (m) {
    const type = ({ homework: "hw", "problem set": "hw", pset: "hw", ps: "hw", assignment: "hw" } as Record<string, string>)[m[1]] ?? m[1];
    return `${type}${Number(m[2])}`;
  }
  return /\bfinal\b/.test(t) ? "final" : null;
}

function localIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

/** Exams and deadlines inside the dashboard window (lecture topics are for the plan only). */
export function eventDashItems(
  courseId: number,
  events: (CourseEvent & { from: "website" | "notes" })[],
  now = new Date(),
  days = 21,
): DashItem[] {
  const today = dateKey(now);
  const until = dateKey(new Date(now.getTime() + days * 86400e3));
  return events
    .filter((e) => e.kind !== "lecture" && e.kind !== "other" && e.date >= today && e.date <= until)
    .map((e, i) => {
      const assessment = e.kind === "exam" || e.kind === "quiz";
      const dueAt = e.time && !assessment ? localIso(e.date, e.time) : null;
      return {
        id: `x${courseId}-${e.date}-${i}`,
        courseId,
        title: e.title,
        dueAt,
        dateOnly: dueAt ? undefined : e.date,
        points: null,
        status: assessment ? ("note" as const) : ("upcoming" as const),
        source: e.from,
        detail: e.notes || undefined,
        isAssessment: assessment,
        external: !assessment,
      };
    });
}

/** Upcoming lecture topics, recitations, review sessions and no-class days, for the plan. */
export function upcomingLectures(events: CourseEvent[], now = new Date(), days = 14): string[] {
  const today = dateKey(now);
  const until = dateKey(new Date(now.getTime() + days * 86400e3));
  return events
    .filter((e) => (e.kind === "lecture" || e.kind === "other") && e.date >= today && e.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `${e.date}${e.time ? ` ${e.time}` : ""}: ${e.title}${e.notes ? ` (${e.notes})` : ""}`);
}
