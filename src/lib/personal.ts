import fs from "node:fs";
import path from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { runModel } from "./ai";
import { DATA_DIR } from "./config";
import { PERSONAL_SYSTEM, personalPrompt } from "./prompts";
import { newId } from "./store";
import { dateKey, fmtDateKey, fmtRange } from "./text";
import type { DashItem, PersonalItem, PersonalState } from "./types";

// "Your week": busy times and non-class to-dos the student types in plain
// English. They show on the dashboard and the catch-up plan works around them.

const FILE = path.join(/*turbopackIgnore: true*/ DATA_DIR, "personal.json");
const DAY = 86400e3;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function loadPersonal(): PersonalState {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<PersonalState>;
    return { items: s.items ?? [], notes: s.notes ?? "", updatedAt: s.updatedAt };
  } catch {
    return { items: [], notes: "" };
  }
}

export function savePersonal(state: PersonalState): PersonalState {
  const next = { ...state, updatedAt: new Date().toISOString() };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}

const ParseSchema = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["busy", "task"]),
      title: z.string(),
      start: z.string(),
      end: z.string(),
      availability: z.enum(["none", "limited", "n/a"]),
      hours: z.number(),
      notes: z.string(),
    }),
  ),
});

/** Turn "debate tournament all day Saturday" into dated items. */
export async function parsePersonal(text: string, signal?: AbortSignal): Promise<PersonalItem[]> {
  const format = betaZodOutputFormat(ParseSchema);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const out = await runModel({ system: PERSONAL_SYSTEM, content: personalPrompt(text, today), effort: "low", maxTokens: 4000, format, signal });
  const createdAt = new Date().toISOString();
  return format
    .parse(out.text)
    .items.filter((i) => i.title.trim())
    .map((i) => {
      const start = DATE.test(i.start) ? i.start : undefined;
      const end = DATE.test(i.end) ? i.end : undefined;
      const busy = i.kind === "busy";
      const item: PersonalItem = {
        id: newId(),
        kind: i.kind,
        title: i.title.trim(),
        start: busy ? (start ?? end) : start,
        end: busy ? (end ?? start) : end,
        availability: busy ? (i.availability === "limited" ? "limited" : "none") : undefined,
        hours: i.hours > 0 ? i.hours : undefined,
        notes: i.notes.trim() || undefined,
        done: false,
        source: text,
        createdAt,
      };
      return item;
    })
    .filter((i) => i.kind === "task" || i.start);
}

/** Without an AI engine, keep the note as an undated to-do rather than losing it. */
export function plainPersonal(text: string): PersonalItem {
  return { id: newId(), kind: "task", title: text.trim().slice(0, 120), source: text, createdAt: new Date().toISOString(), done: false };
}

export function describePersonal(i: PersonalItem): string {
  if (i.kind === "busy") {
    const when = i.start && i.end ? fmtRange(i.start, i.end) : "";
    const avail = i.availability === "limited" ? `less time${i.hours ? `, about ${i.hours} h a day` : ""}` : "can't study";
    return [when, avail].filter(Boolean).join(" · ");
  }
  return [i.end ? `due ${fmtDateKey(i.end)}` : "no due date", i.hours ? `about ${i.hours} h` : null].filter(Boolean).join(" · ");
}

/** Busy times and dated to-dos inside the dashboard's 3-week window. */
export function personalDashItems(state: PersonalState, now = new Date()): DashItem[] {
  const today = dateKey(now);
  const until = dateKey(new Date(now.getTime() + 21 * DAY));
  const out: DashItem[] = [];
  for (const i of state.items) {
    if (i.done) continue;
    const base = { id: `p-${i.id}`, courseId: 0, title: i.title, dueAt: null, points: null, source: "personal" as const, detail: describePersonal(i) };
    if (i.kind === "busy" && i.start && i.end && i.end >= today && i.start <= until) {
      out.push({ ...base, status: "busy", dateOnly: i.start < today ? today : i.start });
    } else if (i.kind === "task" && i.end && i.end >= today && i.end <= until) {
      out.push({ ...base, status: "task", dateOnly: i.end });
    }
  }
  return out;
}

/** The <personal> block of the plan prompt. Empty when there's nothing to say. */
export function personalPlanBlock(state: PersonalState, now = new Date()): string {
  const today = dateKey(now);
  const busy = state.items.filter((i) => i.kind === "busy" && !i.done && i.end && i.end >= today);
  const tasks = state.items.filter((i) => i.kind === "task" && !i.done);
  const notes = state.notes.trim();
  if (!busy.length && !tasks.length && !notes) return "";
  const lines = ["<personal>"];
  if (busy.length) {
    lines.push("Busy times (the student can't study, or has less time than usual):");
    for (const i of busy) {
      const avail = i.availability === "limited" ? `limited${i.hours ? `, about ${i.hours} h of study time per day` : ""}` : "can't study at all";
      lines.push(`- ${fmtRange(i.start!, i.end!)}: ${i.title} (${avail})${i.notes ? `. ${i.notes}` : ""}`);
    }
  }
  if (tasks.length) {
    lines.push("Other things to get done (not class work):");
    for (const i of tasks) {
      lines.push(`- ${i.title} · ${i.end ? `due ${fmtDateKey(i.end)}` : "no due date"}${i.hours ? ` · about ${i.hours} h` : ""}${i.notes ? ` · ${i.notes}` : ""}`);
    }
  }
  if (notes) lines.push(`Notes from the student: ${notes}`);
  lines.push("</personal>");
  return lines.join("\n");
}
