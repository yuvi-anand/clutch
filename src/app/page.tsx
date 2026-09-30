"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineFeedback } from "@/components/Feedback";
import { YourWeek } from "@/components/YourWeek";
import { Markdown } from "@/components/Markdown";
import { ErrorBox, PageLoading, ScorePill, Spinner, useStreamText } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { api, dayKeyOf, fmtAgo, fmtDay, fmtShortDate, fmtTime, money, streamEvents, topicFrom } from "@/lib/client";
import type { DashCourse, DashItem, Dashboard, ItemStatus, SavedPlan, Status } from "@/lib/types";

export default function DashboardPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [personalAt, setPersonalAt] = useState<string | undefined>(undefined);

  const load = useCallback(async (refresh = false) => {
    setError(null);
    setRefreshing(refresh);
    try {
      const st = await api<Status>("/api/status");
      setStatus(st);
      if (st.canvasConnected) setDash(await api<Dashboard>(`/api/dashboard${refresh ? "?refresh=1" : ""}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setVisible(courseId: number, show: boolean) {
    await api("/api/courses/visibility", { courseId, show });
    load(true);
  }

  if (!status) return error ? <ErrorBox message={error} /> : <PageLoading label="Starting up…" />;
  if (!status.canvasConnected) return <Welcome />;
  if (!dash) {
    return error ? (
      <ErrorBox message={error}>
        <button className="btn" onClick={() => load(true)}>
          Try again
        </button>
        <Link className="btn" href="/connect">
          Check the connection
        </Link>
      </ErrorBox>
    ) : (
      <PageLoading label="Reading your Canvas courses… (the first load takes a few seconds)" />
    );
  }

  const courseById = new Map(dash.courses.map((c) => [c.id, c]));
  const firstName = dash.userName.split(/\s+/)[0];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Hi {firstName}, here&apos;s where you stand</h1>
          <p className="mt-1 text-sm muted">
            {dash.courses.length} course{dash.courses.length === 1 ? "" : "s"} this semester · updated {fmtAgo(dash.generatedAt)}
          </p>
        </div>
        <button className="btn" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? <Spinner /> : "↻"} Refresh
        </button>
      </div>
      {error && <ErrorBox message={error} />}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dash.courses.map((c) => (
          <CourseCard key={c.id} course={c} onHide={() => setVisible(c.id, false)} />
        ))}
      </section>
      <div className="-mt-4 flex flex-wrap items-start gap-x-8 gap-y-3">
        <AddClass />
        <HiddenCourses hidden={dash.hidden} onShow={(id) => setVisible(id, true)} />
      </div>

      <YourWeek
        onChange={(s) => {
          setPersonalAt(s.updatedAt);
          load(false);
        }}
      />

      <PlanCard aiConfigured={status.aiConfigured} personalAt={personalAt} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Timeline items={dash.timeline} courses={courseById} />
        <Attention missing={dash.missing} lowScores={dash.lowScores} courses={courseById} />
      </div>
    </div>
  );
}

function Welcome() {
  const steps = [
    ["Connect Canvas", "Paste a Canvas access token. It takes about a minute."],
    ["Add an AI API key", "The AI writes your guides. Each one costs a few cents."],
    ["Tell it what feels shaky", "Pick a class, describe the topic, and get a guide built from your own slides."],
  ];
  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Feeling behind? Let&apos;s catch up.</h1>
      <p className="mt-4 text-lg muted">
        {APP_NAME} reads your Canvas courses, shows what&apos;s due and what&apos;s missing, builds a day-by-day plan, and writes study
        guides, practice sets and quizzes from your own lecture materials.
      </p>
      <ol className="mt-8 space-y-4">
        {steps.map(([title, detail], n) => (
          <li key={title} className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-100 font-semibold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200">
              {n + 1}
            </span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-sm muted">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/connect" className="btn btn-primary mt-10">
        Connect Canvas →
      </Link>
    </div>
  );
}

const shortName = (c: DashCourse) => c.name.replace(/^[A-Z]{2,5}\s?\d{4}\s*/, "").trim() || c.name;

function CourseCard({ course: c, onHide }: { course: DashCourse; onHide: () => void }) {
  return (
    <div className="card group relative overflow-hidden p-5 pl-6">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.color }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide uppercase muted">{c.code}</p>
          <h3 className="mt-0.5 leading-snug font-semibold">{shortName(c)}</h3>
        </div>
        {c.manual ? <span className="chip">Not on Canvas</span> : <ScorePill score={c.score} />}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="chip">{c.upcoming === 0 ? "Nothing due this week" : `${c.upcoming} due this week`}</span>
        {c.missing > 0 && <span className="chip bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">{c.missing} missing</span>}
      </div>
      <div className="mt-5 flex items-center justify-between">
        <Link href={`/course/${c.id}`} className="link text-sm">
          Study for this class →
        </Link>
        {!c.manual && <button
          onClick={onHide}
          title="Not a real class? Hide it from the dashboard."
          className="text-xs opacity-0 transition-opacity muted group-hover:opacity-100 hover:underline focus:opacity-100"
        >
          Hide
        </button>}
      </div>
    </div>
  );
}

function HiddenCourses({ hidden, onShow }: { hidden: DashCourse[]; onShow: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  if (!hidden.length) return null;
  return (
    <div className="text-sm muted">
      <button className="hover:underline" onClick={() => setOpen(!open)}>
        {open ? "Hide the list of" : "Show"} {hidden.length} other Canvas course{hidden.length === 1 ? "" : "s"} (past semesters, orientation…)
      </button>
      {open && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {hidden.map((c) => (
            <li key={c.id}>
              <button className="chip hover:bg-stone-200 dark:hover:bg-stone-700" onClick={() => onShow(c.id)} title="Show on the dashboard">
                + {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanCard({ aiConfigured, personalAt }: { aiConfigured: boolean; personalAt?: string }) {
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { text, append, flush, reset } = useStreamText();

  useEffect(() => {
    api<{ plan: SavedPlan | null }>("/api/plan")
      .then((r) => setPlan(r.plan))
      .catch(() => {});
  }, []);

  async function build() {
    setRunning(true);
    setError(null);
    setExpanded(true);
    reset();
    setStatusText("Starting…");
    try {
      await streamEvents("/api/plan", {}, (ev) => {
        if (ev.t === "status") setStatusText(ev.text);
        else if (ev.t === "thinking") setStatusText("Thinking through your deadlines…");
        else if (ev.t === "text") append(ev.text);
        else if (ev.t === "error") setError(ev.message);
        else if (ev.t === "done") {
          api<{ plan: SavedPlan | null }>("/api/plan").then((r) => setPlan(r.plan));
        }
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      flush();
      setRunning(false);
    }
  }

  const markdown = running || error ? text : (plan?.markdown ?? "");
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Your catch-up plan</h2>
          <p className="text-sm muted">
            {plan && !running
              ? `Built ${fmtAgo(plan.createdAt)} · ${money(plan.cost)}`
              : "A day-by-day plan for the next two weeks, based on your deadlines, grades and syllabi."}
          </p>
        </div>
        <button className="btn btn-primary" disabled={running || !aiConfigured} onClick={build}>
          {running ? (
            <>
              <Spinner /> Building…
            </>
          ) : plan ? (
            "Rebuild plan"
          ) : (
            "Build my catch-up plan"
          )}
        </button>
      </div>
      {plan && !running && personalAt && personalAt > plan.createdAt && (
        <p className="border-t border-stone-200 px-5 py-3 text-sm text-amber-800 dark:border-stone-800 dark:text-amber-300">
          Your week changed since this plan was built. Rebuild it to work around the new items.
        </p>
      )}
      {!aiConfigured && (
        <p className="border-t border-stone-200 px-5 py-4 text-sm muted dark:border-stone-800">
          Add your Anthropic API key on the{" "}
          <Link className="link" href="/connect">
            Connect page
          </Link>{" "}
          to build a plan.
        </p>
      )}
      {error && (
        <div className="px-5 pb-5">
          <ErrorBox message={error} />
        </div>
      )}
      {running && !text && (
        <p className="flex items-center gap-2 border-t border-stone-200 px-5 py-4 text-sm muted dark:border-stone-800">
          <Spinner /> {statusText}
        </p>
      )}
      {markdown && (
        <div className="relative border-t border-stone-200 px-5 py-5 dark:border-stone-800">
          <div className={expanded ? "" : "max-h-72 overflow-hidden"}>
            <Markdown>{markdown}</Markdown>
          </div>
          {!expanded && (
            <div className="absolute inset-x-0 bottom-0 flex h-28 items-end justify-center bg-linear-to-t from-white pb-4 dark:from-stone-900">
              <button className="btn" onClick={() => setExpanded(true)}>
                Show the full plan
              </button>
            </div>
          )}
          {expanded && !running && plan && !error && <InlineFeedback kind="plan" refId={plan.id} question="Is this plan realistic?" />}
        </div>
      )}
    </section>
  );
}

function Timeline({ items, courses }: { items: DashItem[]; courses: Map<number, DashCourse> }) {
  const groups = useMemo(() => {
    const byDay = new Map<string, DashItem[]>();
    for (const i of items) byDay.set(dayKeyOf(i), [...(byDay.get(dayKeyOf(i)) ?? []), i]);
    return [...byDay.entries()];
  }, [items]);
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold">Next 3 weeks</h2>
      {groups.length === 0 && <p className="mt-2 text-sm muted">Nothing due on Canvas in the next 3 weeks.</p>}
      {groups.map(([key, list]) => (
        <div key={key} className="mt-5">
          <h3 className="text-xs font-semibold tracking-wide uppercase muted">{fmtDay(key)}</h3>
          <ul className="mt-1 divide-y divide-stone-100 dark:divide-stone-800">
            {list.map((i) => (
              <TimelineRow key={i.id} item={i} course={courses.get(i.courseId)} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

const BADGES: Record<ItemStatus, [string, string] | null> = {
  missing: ["Missing", "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"],
  submitted: ["Submitted", "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"],
  graded: ["Graded", "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"],
  excused: ["Excused", ""],
  note: ["Exam / quiz", "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200"],
  busy: ["Busy", "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"],
  task: ["To-do", "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"],
  upcoming: null,
};

function StatusBadge({ item }: { item: DashItem }) {
  const soon = item.status === "upcoming" && item.dueAt && Date.parse(item.dueAt) - Date.now() < 48 * 3600e3;
  const badge = soon ? (["Due soon", "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"] as const) : BADGES[item.status];
  if (!badge) return null;
  const label = item.status === "graded" && item.score != null ? `Graded ${item.score}/${item.points ?? "?"}` : badge[0];
  return <span className={`chip ${badge[1]}`}>{label}</span>;
}

function TimelineRow({ item: i, course }: { item: DashItem; course?: DashCourse }) {
  const personal = i.source === "personal";
  const meta = [
    personal ? "Your week" : course?.code,
    personal ? i.detail : i.dueAt ? fmtTime(i.dueAt) : "all day",
    i.points ? `${i.points} pts` : null,
    i.source === "syllabus"
      ? "from the syllabus"
      : i.source === "module"
        ? "from the modules page"
        : i.source === "website"
          ? "from the course website"
          : i.source === "notes"
            ? "from your notes"
            : null,
    i.external && i.status === "upcoming" ? "turned in outside Canvas" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: personal ? (i.status === "busy" ? "#94a3b8" : "#38bdf8") : (course?.color ?? "#a8a29e") }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {i.url ? (
            <a href={i.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
              {i.title}
            </a>
          ) : (
            <span className="font-medium">{i.title}</span>
          )}
          <StatusBadge item={i} />
        </div>
        <p className="mt-0.5 text-xs muted" title={personal ? undefined : i.detail}>
          {meta}
        </p>
      </div>
      {i.isAssessment && i.status !== "graded" && i.status !== "submitted" && (
        <Link href={`/course/${i.courseId}?topics=${encodeURIComponent(topicFrom(i.title))}`} className="btn btn-sm shrink-0">
          Study
        </Link>
      )}
    </li>
  );
}

function Attention({ missing, lowScores, courses }: { missing: DashItem[]; lowScores: DashItem[]; courses: Map<number, DashCourse> }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-semibold">Needs attention</h2>
      {missing.length === 0 && lowScores.length === 0 && <p className="mt-2 text-sm muted">Nothing flagged on Canvas. Nice.</p>}
      {missing.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold tracking-wide text-red-700 uppercase dark:text-red-400">Missing</h3>
          <ul className="mt-2 space-y-2">
            {missing.map((i) => (
              <li key={i.id} className="text-sm">
                <a href={i.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {i.title}
                </a>
                <p className="text-xs muted">
                  {courses.get(i.courseId)?.code}
                  {i.dueAt ? ` · was due ${fmtShortDate(i.dueAt)}` : ""}
                  {i.points ? ` · ${i.points} pts` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {lowScores.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">Low scores to review</h3>
          <ul className="mt-2 space-y-2">
            {lowScores.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{i.title}</p>
                  <p className="text-xs muted">
                    {courses.get(i.courseId)?.code} · {i.score}/{i.points} ({Math.round(((i.score ?? 0) / (i.points || 1)) * 100)}%)
                  </p>
                </div>
                <Link href={`/course/${i.courseId}?topics=${encodeURIComponent(topicFrom(i.title))}`} className="btn btn-sm shrink-0">
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-6 text-xs muted">Canvas can&apos;t see work you turn in on Gradescope, Pawtograder or other sites, so double-check those.</p>
    </section>
  );
}

function AddClass() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button className="text-sm muted hover:underline" onClick={() => setOpen(true)}>
        + Add a class that isn&apos;t on Canvas
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        setError(null);
        try {
          const c = await api<{ id: number }>("/api/courses/manual", { action: "create", name });
          router.push(`/course/${c.id}`);
        } catch (err) {
          setError((err as Error).message);
          setSaving(false);
        }
      }}
    >
      <input
        id="add-class-name"
        autoFocus
        className="input w-72"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. DS 3000 Foundations of Data Science"
      />
      <button className="btn btn-sm" disabled={saving || !name.trim()}>
        {saving ? "Adding…" : "Add class"}
      </button>
      <button type="button" className="text-xs muted hover:underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
