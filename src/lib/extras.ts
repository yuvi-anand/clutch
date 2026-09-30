import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";
import type { CourseEvent, Extras, ManualCourse } from "./types";

// Things a student adds to a class beyond Canvas (course websites, uploaded
// files, pasted notes), and classes that aren't on Canvas at all. Classes the
// student adds get negative ids so they never collide with Canvas course ids.

const EXTRAS_FILE = path.join(/*turbopackIgnore: true*/ DATA_DIR, "extras.json");
const MANUAL_FILE = path.join(/*turbopackIgnore: true*/ DATA_DIR, "manual-courses.json");
export const UPLOAD_DIR = path.join(/*turbopackIgnore: true*/ DATA_DIR, "uploads");

const PALETTE = ["#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#0ea5e9", "#84cc16"];

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export const emptyExtras = (): Extras => ({ sites: [], files: [], notes: "", notesEvents: [] });

export function getExtras(courseId: number): Extras {
  const all = readJson<Record<string, Extras>>(EXTRAS_FILE, {});
  return { ...emptyExtras(), ...all[String(courseId)] };
}

export function setExtras(courseId: number, extras: Extras) {
  const all = readJson<Record<string, Extras>>(EXTRAS_FILE, {});
  all[String(courseId)] = extras;
  writeJson(EXTRAS_FILE, all);
}

export function manualCourses(): ManualCourse[] {
  return readJson<ManualCourse[]>(MANUAL_FILE, []);
}

export function manualCourse(id: number): ManualCourse | undefined {
  return manualCourses().find((c) => c.id === id);
}

export function addManualCourse(name: string, code: string): ManualCourse {
  const list = manualCourses();
  const id = -1 - list.reduce((max, c) => Math.max(max, -c.id), 0);
  const course: ManualCourse = { id, name: name.trim(), code: code.trim(), color: PALETTE[list.length % PALETTE.length], createdAt: new Date().toISOString() };
  writeJson(MANUAL_FILE, [...list, course]);
  return course;
}

export function removeManualCourse(id: number) {
  writeJson(MANUAL_FILE, manualCourses().filter((c) => c.id !== id));
  const all = readJson<Record<string, Extras>>(EXTRAS_FILE, {});
  delete all[String(id)];
  writeJson(EXTRAS_FILE, all);
  fs.rmSync(path.join(UPLOAD_DIR, String(id)), { recursive: true, force: true });
}

export function uploadPath(courseId: number, stored: string): string {
  return path.join(UPLOAD_DIR, String(courseId), path.basename(stored));
}

export const hashText = (s: string) => crypto.createHash("sha1").update(s).digest("hex");

/** Every dated event attached to a class from its websites and pasted notes. */
export function extraEvents(extras: Extras): (CourseEvent & { from: "website" | "notes" })[] {
  return [
    ...extras.sites.flatMap((s) => s.events.map((e) => ({ ...e, from: "website" as const }))),
    ...extras.notesEvents.map((e) => ({ ...e, from: "notes" as const })),
  ];
}
