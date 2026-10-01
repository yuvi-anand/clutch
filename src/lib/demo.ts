import type { DashItem, Dashboard, PersonalState, SavedPlan, Status } from "./types";

// Demo mode (DEMO_MODE=1) shows the dashboard with made-up sample data, so
// people can try the app, and screenshots can be taken, without a Canvas
// account. Dates are relative to today so the timeline always looks current.

export const DEMO = process.env.DEMO_MODE === "1";

/** In demo mode, block every route that would touch real Canvas data or spend on the AI. */
export function demoBlocked(): Response | null {
  return DEMO
    ? Response.json({ error: "This is the demo with sample data. Connect your own Canvas to use this part." }, { status: 400 })
    : null;
}

const DAY = 86400e3;
const pad = (n: number) => String(n).padStart(2, "0");

function at(days: number, hour: number, minute = 59): string {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateKey(days: number): string {
  const d = new Date(Date.now() + days * DAY);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Sort key: exact due time, or local midnight for all-day items. */
function when(i: DashItem): number {
  if (i.dueAt) return Date.parse(i.dueAt);
  const [y, m, d] = (i.dateOnly ?? "").split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

type Base = Pick<DashItem, "id" | "courseId" | "title" | "status">;
const item = (i: Base & Partial<DashItem>): DashItem => ({ dueAt: null, points: null, source: "canvas", ...i });

export function demoStatus(): Status {
  return {
    canvasConnected: true,
    canvasBaseUrl: "https://canvas.example.edu",
    aiConfigured: true,
    engine: "api",
    aiCommand: "",
    model: "demo",
    models: [{ id: "demo", label: "Sample data", note: "Demo mode" }],
    canvasFromEnv: false,
    aiFromEnv: false,
  };
}

export function demoDashboard(): Dashboard {
  return {
    userName: "Alex Rivera",
    generatedAt: new Date(Date.now() - 2 * 60e3).toISOString(),
    courses: [
      { id: 101, name: "MATH 221 Calculus II", code: "MATH 221", color: "#6366f1", score: 82.5, upcoming: 1, missing: 0 },
      { id: 102, name: "BIOL 110 Cell Biology", code: "BIOL 110", color: "#10b981", score: 90.8, upcoming: 1, missing: 0 },
      { id: 103, name: "ECON 201 Principles of Microeconomics", code: "ECON 201", color: "#f59e0b", score: 74.1, upcoming: 2, missing: 1 },
    ],
    hidden: [
      { id: 901, name: "First-Year Orientation", code: "ORIENT", color: "#a8a29e", score: null, upcoming: 0, missing: 0 },
      { id: 902, name: "Career Services", code: "CAREER", color: "#a8a29e", score: null, upcoming: 0, missing: 0 },
    ],
    timeline: [
      item({ id: "d1", courseId: 102, title: "Lab Report 3: Enzyme Kinetics", status: "submitted", dueAt: at(1, 21), points: 25 }),
      item({ id: "d2", courseId: 101, title: "Problem Set 5: Integration by Parts", status: "upcoming", dueAt: at(1, 23), points: 20 }),
      item({ id: "d3", courseId: 103, title: "Problem Set 4: Elasticity", status: "upcoming", dueAt: at(3, 23), points: 30 }),
      item({ id: "d4", courseId: 102, title: "Chapter 7 Quiz", status: "note", dateOnly: dateKey(4), source: "module", isAssessment: true }),
      item({ id: "d5", courseId: 103, title: "Essay 1: Price Controls", status: "upcoming", dueAt: at(5, 23), points: 100, external: true }),
      item({ id: "d6", courseId: 101, title: "Midterm 2", status: "note", dateOnly: dateKey(9), source: "syllabus", isAssessment: true }),
      item({ id: "d7", courseId: 102, title: "Lab Report 4: Photosynthesis", status: "upcoming", dueAt: at(12, 21), points: 25 }),
      item({ id: "d8", courseId: 103, title: "Midterm Exam", status: "note", dateOnly: dateKey(16), source: "syllabus", isAssessment: true }),
      item({ id: "p-p1", courseId: 0, title: "Soccer tournament", status: "busy", dateOnly: dateKey(3), source: "personal", detail: "can't study" }),
      item({ id: "p-p2", courseId: 0, title: "Interview prep", status: "task", dateOnly: dateKey(5), source: "personal", detail: "about 2 h" }),
      item({ id: "p-p3", courseId: 0, title: "Summer internship applications", status: "task", dateOnly: dateKey(15), source: "personal", detail: "about 4 h" }),
    ].sort((x, y) => when(x) - when(y)),
    missing: [item({ id: "m1", courseId: 103, title: "Reading Quiz 2", status: "missing", dueAt: at(-6, 23), points: 10 })],
    lowScores: [
      item({ id: "l1", courseId: 101, title: "Quiz 3: Sequences and Series", status: "graded", score: 5, points: 10, dueAt: at(-8, 11), isAssessment: true }),
      item({ id: "l2", courseId: 103, title: "Problem Set 2: Supply and Demand", status: "graded", score: 18, points: 30, dueAt: at(-13, 23) }),
    ],
  };
}

export function demoPlan(): SavedPlan {
  const day = (n: number) => new Date(Date.now() + n * DAY).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const markdown = `## Where you stand
- **Economics needs attention first.** Reading Quiz 2 is still missing and Problem Set 2 came back at 60%. The syllabus drops your lowest reading quiz, so that zero won't sink you if the rest land.
- **Calculus is solid, but Midterm 2 is in 9 days** and Quiz 3 (5/10) says sequences and series need another pass.
- **Biology is on track.** Lab Report 3 is in. Give the Chapter 7 quiz one focused session this weekend.

## Top priorities this week
1. **Problem Set 5**, due tomorrow night: about 2 hours.
2. **Econ Problem Set 4 and an Essay 1 outline**: about 3 hours over two days.
3. **Chapter 7 quiz prep**: one 45-minute session plus a practice quiz.

## Day by day
### ${day(0)}
- Problem Set 5, problems 1–4 (1.5 h)
- [Elasticity](/course/103?topics=Elasticity) study guide (40 min)

### ${day(1)}
- Finish and submit Problem Set 5 (1 h)
- Outline Essay 1 (45 min)
`;
  return {
    id: "demoplan",
    type: "plan",
    title: `Catch-up plan for ${day(0)}`,
    markdown,
    model: "demo",
    cost: 0.11,
    createdAt: new Date(Date.now() - 2 * 60e3).toISOString(),
  };
}

export function demoPersonal(): PersonalState {
  const created = new Date(Date.now() - 3600e3).toISOString();
  return {
    notes: "I focus best in the mornings. Weekdays I have about 3 hours.",
    items: [
      { id: "p1", kind: "busy", title: "Soccer tournament", start: dateKey(3), end: dateKey(3), availability: "none", source: "soccer tournament all day Saturday", createdAt: created },
      { id: "p2", kind: "task", title: "Interview prep", end: dateKey(5), hours: 2, source: "prep 2 hours for my interview", createdAt: created },
      { id: "p3", kind: "task", title: "Summer internship applications", end: dateKey(15), hours: 4, source: "apply to 5 internships", createdAt: created },
    ],
  };
}
