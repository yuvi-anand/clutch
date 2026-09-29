import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";
import type { LibraryEntry, SavedGuide, SavedPlan, SavedQuiz } from "./types";

// Everything the student makes is saved as JSON under data/ (plus a .md copy
// of each guide, so it can be opened in any editor).

export type Kind = "guide" | "quiz" | "plan";
type ItemFor<K extends Kind> = K extends "guide" ? SavedGuide : K extends "quiz" ? SavedQuiz : SavedPlan;

const DIRS: Record<Kind, string> = { guide: "guides", quiz: "quizzes", plan: "plans" };
const ID = /^[a-z0-9]{6,40}$/;

export const isKind = (k: string): k is Kind => k in DIRS;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function dir(kind: Kind) {
  const d = path.join(/*turbopackIgnore: true*/ DATA_DIR, DIRS[kind]);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function saveItem<K extends Kind>(kind: K, item: ItemFor<K>) {
  fs.writeFileSync(path.join(dir(kind), `${item.id}.json`), JSON.stringify(item, null, 2));
  if (kind === "guide" || kind === "plan") {
    fs.writeFileSync(path.join(dir(kind), `${item.id}.md`), (item as SavedGuide | SavedPlan).markdown);
  }
}

export function loadItem<K extends Kind>(kind: K, id: string): ItemFor<K> | null {
  if (!ID.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir(kind), `${id}.json`), "utf8")) as ItemFor<K>;
  } catch {
    return null;
  }
}

function listItems<K extends Kind>(kind: K): ItemFor<K>[] {
  const out: ItemFor<K>[] = [];
  for (const f of fs.readdirSync(dir(kind))) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir(kind), f), "utf8")) as ItemFor<K>);
    } catch {
      // Skip unreadable files.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function library(): LibraryEntry[] {
  const guides = listItems("guide").map((g) => ({
    id: g.id,
    type: g.type,
    title: g.title,
    courseId: g.courseId,
    courseName: g.courseName,
    topics: g.topics,
    createdAt: g.createdAt,
  }));
  const quizzes = listItems("quiz").map((q) => ({
    id: q.id,
    type: "quiz" as const,
    title: q.title,
    courseId: q.courseId,
    courseName: q.courseName,
    topics: q.topics,
    createdAt: q.createdAt,
  }));
  const plans = listItems("plan").map((p) => ({ id: p.id, type: "plan" as const, title: p.title, createdAt: p.createdAt }));
  return [...guides, ...quizzes, ...plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function latestPlan(): SavedPlan | null {
  return listItems("plan")[0] ?? null;
}

export function appendFeedback(entry: Record<string, unknown>) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(path.join(DATA_DIR, "feedback.jsonl"), JSON.stringify(entry) + "\n");
}
