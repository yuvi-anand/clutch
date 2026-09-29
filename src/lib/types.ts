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

export type Status = {
  canvasConnected: boolean;
  canvasBaseUrl: string | null;
  aiConfigured: boolean;
  model: string;
  models: ModelOption[];
  canvasFromEnv: boolean;
  aiFromEnv: boolean;
};

export type ItemStatus = "missing" | "submitted" | "graded" | "upcoming" | "excused" | "note";

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
  source: "canvas" | "syllabus" | "module";
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
  kind: "file" | "page";
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
};

export type CourseView = {
  course: CourseInfo;
  modules: ModuleView[];
  otherFiles: Material[];
  otherPages: Material[];
  upcoming: DashItem[];
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
