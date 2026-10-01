// Types shared by the server (API routes) and the browser (pages).
// Keep this file free of Node-only imports.

export type StreamEvent =
  | { t: "status"; text: string }
  | { t: "thinking"; text: string }
  | { t: "text"; text: string }
  | { t: "progress"; n: number; total?: number }
  | { t: "done"; id: string; cost?: number }
  | { t: "error"; message: string };

export type ModelOption = { id: string; label: string; note: string };

/** Something outside class the plan should work around: busy time, or a non-class to-do. */
export type PersonalItem = {
  id: string;
  kind: "busy" | "task";
  title: string;
  /** YYYY-MM-DD. Busy: first day. Task: when they plan to start (optional). */
  start?: string;
  /** YYYY-MM-DD. Busy: last day (inclusive). Task: due date. */
  end?: string;
  /** Busy only: no study time at all, or some. */
  availability?: "none" | "limited";
  /** Task: estimated hours. Busy + limited: study hours still available per day. */
  hours?: number;
  notes?: string;
  done?: boolean;
  /** What the student typed. */
  source: string;
  createdAt: string;
};

export type PersonalState = { items: PersonalItem[]; notes: string; updatedAt?: string };

/** A dated item pulled from a course website or pasted syllabus. */
export type CourseEvent = {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** "HH:MM", 24-hour, or "" */
  time: string;
  kind: "exam" | "quiz" | "homework" | "project" | "lab" | "lecture" | "other";
  notes: string;
};

export type Site = {
  url: string;
  title: string;
  addedAt: string;
  fetchedAt: string;
  hash: string;
  pages: { url: string; title: string }[];
  files: { url: string; name: string; kind: FileKind }[];
  events: CourseEvent[];
};

export type UploadedFile = { id: string; name: string; size: number; kind: FileKind; stored: string; addedAt: string };

export type Extras = { sites: Site[]; files: UploadedFile[]; notes: string; notesHash?: string; notesEvents: CourseEvent[] };

export type ManualCourse = { id: number; name: string; code: string; color: string; createdAt: string };

/** What the course page shows about a class's extras. */
export type ExtrasSummary = {
  sites: { url: string; title: string; pages: number; files: number; dates: number; fetchedAt: string }[];
  files: { id: string; name: string; size: number; kind: FileKind }[];
  notes: string;
  notesDates: number;
};

export type Status = {
  canvasConnected: boolean;
  canvasBaseUrl: string | null;
  aiConfigured: boolean;
  /** "command" = the local AI command from your config; "api" = API key. */
  engine: "api" | "command" | "none";
  /** The local AI command, if one is set (it is not a secret). */
  aiCommand: string;
  model: string;
  models: ModelOption[];
  canvasFromEnv: boolean;
  aiFromEnv: boolean;
};

export type ItemStatus = "missing" | "submitted" | "graded" | "upcoming" | "excused" | "note" | "busy" | "task";

export type DashItem = {
  id: string;
  courseId: number;
  title: string;
  /** Exact due time (ISO) for Canvas items. */
  dueAt: string | null;
  /** All-day date (YYYY-MM-DD) for exams/quizzes found in the syllabus or module headers. */
  dateOnly?: string;
  points: number | null;
  score?: number | null;
  url?: string;
  status: ItemStatus;
  /** Submitted somewhere other than Canvas (Gradescope, Pawtograder, on paper...). */
  external?: boolean;
  source: "canvas" | "syllabus" | "module" | "personal" | "website" | "notes";
  detail?: string;
  isAssessment?: boolean;
};

export type DashCourse = {
  id: number;
  name: string;
  code: string;
  color: string;
  score: number | null;
  upcoming: number;
  missing: number;
  manual?: boolean;
};

export type Dashboard = {
  userName: string;
  generatedAt: string;
  courses: DashCourse[];
  hidden: DashCourse[];
  timeline: DashItem[];
  missing: DashItem[];
  lowScores: DashItem[];
};

export type FileKind = "pdf" | "pptx" | "docx" | "text" | "recording" | "legacy" | "unsupported";

export type Material = {
  /** "file:<id>" or "page:<slug>" */
  key: string;
  kind: "file" | "page" | "web" | "upload" | "notes";
  title: string;
  module: string;
  fileKind?: FileKind;
  size?: number;
  supported: boolean;
  reason?: string;
  url?: string;
};

export type ModuleEntry =
  | { type: "material"; material: Material }
  | { type: "header"; title: string }
  | { type: "link"; title: string; itemType: string; url?: string };

export type ModuleView = { id: number; name: string; entries: ModuleEntry[] };

export type CourseInfo = {
  id: number;
  name: string;
  code: string;
  color: string;
  score: number | null;
  url: string;
  /** Added by the student, not on Canvas. */
  manual?: boolean;
};

export type CourseView = {
  course: CourseInfo;
  extras: ExtrasSummary;
  modules: ModuleView[];
  otherFiles: Material[];
  otherPages: Material[];
  upcoming: DashItem[];
};

/** The text the app reads out of one course material (shown by "preview"). */
export type MaterialPreview = {
  title: string;
  text: string;
  truncated: boolean;
  chars: number;
  approxTokens: number;
  units?: number;
  unitLabel?: string;
  cached: boolean;
  lowText: boolean;
};

export type Mode = "guide" | "practice" | "cheatsheet" | "quiz";

export type GenerateRequest = {
  courseId: number;
  mode: Mode;
  topics: string;
  note: string;
  keys: string[];
  visual: boolean;
  count?: number;
};

export type UsedSource = {
  key: string;
  title: string;
  units?: number;
  unitLabel?: string;
  chars: number;
  visual?: boolean;
  lowText?: boolean;
};

export type SavedBase = {
  id: string;
  courseId: number;
  courseName: string;
  title: string;
  topics: string;
  note: string;
  keys: string[];
  sources: UsedSource[];
  visual: boolean;
  model: string;
  cost: number;
  createdAt: string;
};

export type GuideType = "guide" | "practice" | "cheatsheet";

export type SavedGuide = SavedBase & { type: GuideType; markdown: string; truncated?: boolean };

export type QuizQuestion = {
  type: "mcq" | "short";
  topic: string;
  question: string;
  choices: string[];
  answer_index: number;
  answer: string;
  explanation: string;
  source: string;
};

export type QuizAttempt = { at: string; correct: boolean[]; score: number; total: number };

export type SavedQuiz = SavedBase & { type: "quiz"; questions: QuizQuestion[]; attempts: QuizAttempt[] };

export type SavedPlan = {
  id: string;
  type: "plan";
  title: string;
  markdown: string;
  model: string;
  cost: number;
  createdAt: string;
};

export type LibraryEntry = {
  id: string;
  type: GuideType | "quiz" | "plan";
  title: string;
  courseId?: number;
  courseName?: string;
  topics?: string;
  createdAt: string;
};

export const MODE_LABELS: Record<Mode, string> = {
  guide: "Study guide",
  practice: "Practice set",
  cheatsheet: "Cheat sheet",
  quiz: "Quiz",
};
