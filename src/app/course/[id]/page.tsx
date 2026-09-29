"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import { ErrorBox, PageLoading, ScorePill, Spinner } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { api, dayKeyOf, fmtDay, fmtTime, setPending } from "@/lib/client";
import type { CourseView, DashItem, Material, MaterialPreview, Mode, ModuleEntry, ModuleView, Status } from "@/lib/types";

const MODES: { id: Mode; label: string; desc: string; cta: string }[] = [
  { id: "guide", label: "Study guide", desc: "Explanations, worked examples, practice", cta: "Write my study guide" },
  { id: "practice", label: "Practice set", desc: "Exam-style problems + answer key", cta: "Make a practice set" },
  { id: "cheatsheet", label: "Cheat sheet", desc: "One page to review or print", cta: "Make a cheat sheet" },
  { id: "quiz", label: "Quiz me", desc: "Interactive, instant feedback", cta: "Start a quiz" },
];

type Toggle = (keys: string[], on: boolean) => void;
type Preview = (m: Material) => void;

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<PageLoading label="Loading course…" />}>
      <CourseScreen courseId={Number(id)} />
    </Suspense>
  );
}

function CourseScreen({ courseId }: { courseId: number }) {
  const router = useRouter();
  const search = useSearchParams();
  const initialTopics = search.get("topics") ?? "";
  const [data, setData] = useState<CourseView | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topics, setTopics] = useState(initialTopics);
  const [mode, setMode] = useState<Mode>("guide");
  const [visual, setVisual] = useState(false);
  const [count, setCount] = useState(10);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{ text: string; ok: boolean } | null>(null);
  const autoRan = useRef(false);
  const [previewing, setPreviewing] = useState<Material | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      setRefreshing(refresh);
      setError(null);
      try {
        setData(await api<CourseView>(`/api/course/${courseId}${refresh ? "?refresh=1" : ""}`));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setRefreshing(false);
      }
    },
    [courseId],
  );

  useEffect(() => {
    load();
    api<Status>("/api/status")
      .then(setStatus)
      .catch(() => {});
  }, [load]);

  const suggest = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setSuggesting(true);
      setSuggestion(null);
      try {
        const r = await api<{ keys: string[]; reason: string }>("/api/suggest", { courseId, topics: text });
        setSelected(new Set(r.keys));
        setSuggestion(
          r.keys.length
            ? { text: `Selected ${r.keys.length}: ${r.reason}`, ok: true }
            : { text: "Couldn't find matching materials. Pick them yourself below.", ok: false },
        );
      } catch (e) {
        setSuggestion({ text: (e as Error).message, ok: false });
      } finally {
        setSuggesting(false);
      }
    },
    [courseId],
  );

  // Coming from the plan or dashboard with ?topics=…, find the matching materials right away.
  useEffect(() => {
    if (data && status?.aiConfigured && initialTopics && !autoRan.current) {
      autoRan.current = true;
      suggest(initialTopics);
    }
  }, [data, status, initialTopics, suggest]);

  const toggle: Toggle = (keys, on) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  function generate() {
    setPending({ courseId, mode, topics: topics.trim(), note: "", keys: [...selected], visual, count });
    router.push(mode === "quiz" ? "/quiz/new" : "/guide/new");
  }

  if (error && !data) {
    return (
      <ErrorBox message={error}>
        <button className="btn" onClick={() => load(true)}>
          Try again
        </button>
        <Link href="/" className="btn">
          Back to the dashboard
        </Link>
      </ErrorBox>
    );
  }
  if (!data) return <PageLoading label="Loading course materials from Canvas…" />;

  const { course } = data;
  const current = MODES.find((m) => m.id === mode)!;
  const aiReady = Boolean(status?.aiConfigured);

  return (
    <div>
      <Link href="/" className="text-sm muted hover:underline">
        ← Dashboard
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-2 h-3 w-3 shrink-0 rounded-full" style={{ background: course.color }} />
          <div>
            <p className="text-xs font-semibold tracking-wide uppercase muted">{course.code}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{course.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScorePill score={course.score} />
          <a href={course.url} target="_blank" rel="noreferrer" className="btn btn-sm">
            Open in Canvas ↗
          </a>
          <button className="btn btn-sm" onClick={() => load(true)} disabled={refreshing}>
            {refreshing ? <Spinner /> : "↻"} Refresh
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 lg:order-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Course materials</h2>
            <p className="text-sm muted">
              {selected.size} selected
              {selected.size > 0 && (
                <>
                  {" · "}
                  <button className="link" onClick={() => setSelected(new Set())}>
                    clear
                  </button>
                </>
              )}
            </p>
          </div>
          <Materials data={data} selected={selected} toggle={toggle} preview={setPreviewing} />
        </div>

        <aside className="order-1 space-y-4 lg:sticky lg:top-20 lg:order-2 lg:self-start">
          <div className="card p-5">
            <label htmlFor="topics" className="font-semibold">
              What feels shaky?
            </label>
            <textarea
              id="topics"
              rows={4}
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              className="input mt-2"
              placeholder="e.g. “integration by parts, I always pick the wrong u” or “everything for Tuesday's quiz”"
            />
            <button className="btn mt-2 w-full" disabled={!topics.trim() || suggesting || !aiReady} onClick={() => suggest(topics)}>
              {suggesting ? (
                <>
                  <Spinner /> Finding materials…
                </>
              ) : (
                "Find the right materials"
              )}
            </button>
            {suggestion && (
              <p className={`mt-2 text-sm ${suggestion.ok ? "muted" : "text-amber-700 dark:text-amber-400"}`}>{suggestion.text}</p>
            )}

            <p className="mt-5 text-sm font-medium">Make a…</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  aria-pressed={mode === m.id}
                  className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${
                    mode === m.id
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20 dark:bg-indigo-950/40"
                      : "border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
                  }`}
                >
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs muted">{m.desc}</span>
                </button>
              ))}
            </div>
            {mode === "quiz" && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                Questions:
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="input w-auto py-1">
                  {[5, 10, 15].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={visual && status?.engine !== "command"}
                disabled={status?.engine === "command"}
                onChange={(e) => setVisual(e.target.checked)}
                className="mt-1 accent-indigo-600"
              />
              <span className={status?.engine === "command" ? "opacity-60" : ""}>
                Read PDFs visually
                <span className="block text-xs muted">
                  {status?.engine === "command"
                    ? "Needs an API key. Your local AI command reads slides as text."
                    : "Better for math, diagrams and scanned slides. Costs several times more."}
                </span>
              </span>
            </label>
            <button className="btn btn-primary mt-5 w-full" disabled={!selected.size || !aiReady} onClick={generate}>
              {current.cta}
              {selected.size > 0 ? ` from ${selected.size} item${selected.size === 1 ? "" : "s"}` : ""}
            </button>
            {status && !aiReady && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Add your API key on the{" "}
                <Link href="/connect" className="link">
                  Connect page
                </Link>{" "}
                first.
              </p>
            )}
            {aiReady && selected.size === 0 && (
              <p className="mt-2 text-xs muted">Pick materials from the list, or describe a topic and click “Find the right materials”.</p>
            )}
          </div>
          {data.upcoming.length > 0 && <Upcoming items={data.upcoming} />}
        </aside>
      </div>
      {previewing && <PreviewModal courseId={courseId} material={previewing} onClose={() => setPreviewing(null)} />}
    </div>
  );
}

function Materials({ data, selected, toggle, preview }: { data: CourseView; selected: Set<string>; toggle: Toggle; preview: Preview }) {
  const empty = data.modules.every((m) => m.entries.length === 0) && !data.otherFiles.length && !data.otherPages.length;
  if (empty) return <div className="card p-6 text-sm muted">This course doesn&apos;t have any modules or files on Canvas yet.</div>;
  return (
    <div className="space-y-3">
      {data.modules.map((m) => (
        <ModuleCard key={m.id} mod={m} selected={selected} toggle={toggle} preview={preview} />
      ))}
      {data.otherFiles.length > 0 && (
        <ExtraCard title="Other course files" note="Files that aren't linked from a module" items={data.otherFiles} selected={selected} toggle={toggle} preview={preview} />
      )}
      {data.otherPages.length > 0 && (
        <ExtraCard title="Other course pages" note="Pages that aren't linked from a module" items={data.otherPages} selected={selected} toggle={toggle} preview={preview} />
      )}
    </div>
  );
}

function SelectAll({ keys, selected, toggle }: { keys: string[]; selected: Set<string>; toggle: Toggle }) {
  if (!keys.length) return null;
  const chosen = keys.filter((k) => selected.has(k)).length;
  return (
    <>
      <span className="text-xs tabular-nums muted">
        {chosen}/{keys.length}
      </span>
      <button
        type="button"
        className="link text-xs"
        onClick={(e) => {
          e.preventDefault();
          toggle(keys, chosen < keys.length);
        }}
      >
        {chosen < keys.length ? "Select all" : "Clear"}
      </button>
    </>
  );
}

function ModuleCard({ mod, selected, toggle, preview }: { mod: ModuleView; selected: Set<string>; toggle: Toggle; preview: Preview }) {
  const keys = mod.entries.flatMap((e) => (e.type === "material" && e.material.supported ? [e.material.key] : []));
  return (
    <details open className="card overflow-hidden">
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <span className="flex-1 font-medium">{mod.name}</span>
        <SelectAll keys={keys} selected={selected} toggle={toggle} />
      </summary>
      <ul className="border-t border-stone-100 pb-2 dark:border-stone-800">
        {mod.entries.length === 0 && <li className="px-4 py-3 text-sm muted">Nothing posted yet.</li>}
        {mod.entries.map((e, i) => (
          <EntryRow key={i} entry={e} selected={selected} toggle={toggle} preview={preview} />
        ))}
      </ul>
    </details>
  );
}

function ExtraCard({
  title,
  note,
  items,
  selected,
  toggle,
  preview,
}: {
  title: string;
  note: string;
  items: Material[];
  selected: Set<string>;
  toggle: Toggle;
  preview: Preview;
}) {
  const keys = items.filter((m) => m.supported).map((m) => m.key);
  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <span className="flex-1">
          <span className="font-medium">{title}</span> <span className="text-xs muted">· {note}</span>
        </span>
        <SelectAll keys={keys} selected={selected} toggle={toggle} />
      </summary>
      <ul className="border-t border-stone-100 pb-2 dark:border-stone-800">
        {items.map((m) => (
          <MaterialRow key={m.key} m={m} selected={selected} toggle={toggle} preview={preview} />
        ))}
      </ul>
    </details>
  );
}

function EntryRow({ entry: e, selected, toggle, preview }: { entry: ModuleEntry; selected: Set<string>; toggle: Toggle; preview: Preview }) {
  if (e.type === "header") return <li className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase muted">{e.title}</li>;
  if (e.type === "link") {
    return (
      <li className="flex items-center gap-3 px-4 py-1.5 text-sm muted">
        <span className="w-4 shrink-0" />
        <span className="w-14 shrink-0 text-center text-[10px] font-semibold tracking-wide uppercase">{e.itemType}</span>
        {e.url ? (
          <a href={e.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
            {e.title}
          </a>
        ) : (
          <span className="truncate">{e.title}</span>
        )}
      </li>
    );
  }
  return <MaterialRow m={e.material} selected={selected} toggle={toggle} preview={preview} />;
}

const KIND_TAG: Record<string, [string, string]> = {
  pdf: ["PDF", "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"],
  pptx: ["Slides", "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"],
  docx: ["Doc", "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"],
  text: ["Text", "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"],
  page: ["Page", "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"],
  recording: ["Video", "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"],
  legacy: ["Office", "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"],
  unsupported: ["File", "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"],
};

const fmtSize = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function MaterialRow({ m, selected, toggle, preview }: { m: Material; selected: Set<string>; toggle: Toggle; preview: Preview }) {
  const tag = KIND_TAG[m.kind === "page" ? "page" : (m.fileKind ?? "unsupported")] ?? KIND_TAG.unsupported;
  const on = selected.has(m.key);
  return (
    <li>
      <label
        className={`flex items-center gap-3 px-4 py-2 text-sm ${
          m.supported ? "cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50" : "opacity-60"
        }`}
      >
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-indigo-600"
          disabled={!m.supported}
          checked={on}
          onChange={() => toggle([m.key], !on)}
        />
        <span className={`w-14 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold tracking-wide uppercase ${tag[1]}`}>{tag[0]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{m.title}</span>
          {!m.supported && m.reason && <span className="block text-xs muted">{m.reason}</span>}
        </span>
        {m.size ? <span className="hidden text-xs tabular-nums muted sm:inline">{fmtSize(m.size)}</span> : null}
        {m.supported && (
          <button
            type="button"
            onClick={(ev) => {
              ev.preventDefault();
              preview(m);
            }}
            className="shrink-0 text-xs muted hover:underline"
            title="See the text the app reads from this (free)"
          >
            preview
          </button>
        )}
        {m.url && (
          <a href={m.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs muted hover:underline">
            open ↗
          </a>
        )}
      </label>
    </li>
  );
}

function Upcoming({ items }: { items: DashItem[] }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold">Coming up in this class</h3>
      <ul className="mt-3 space-y-2.5">
        {items.slice(0, 8).map((i) => (
          <li key={i.id} className="text-sm">
            <p className="leading-snug font-medium">{i.title}</p>
            <p className="text-xs muted">
              {fmtDay(dayKeyOf(i))}
              {i.dueAt ? ` · ${fmtTime(i.dueAt)}` : ""}
              {i.status === "submitted" || i.status === "graded" ? " · done ✓" : ""}
              {i.status === "missing" ? " · missing" : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewModal({ courseId, material, onClose }: { courseId: number; material: Material; onClose: () => void }) {
  const [data, setData] = useState<MaterialPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MaterialPreview>(`/api/course/${courseId}/material?key=${encodeURIComponent(material.key)}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [courseId, material.key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stats = data
    ? [
        data.units && data.unitLabel && data.unitLabel !== "section" ? `${data.units} ${data.unitLabel}s` : null,
        `${data.chars.toLocaleString()} characters`,
        `~${Math.max(1, Math.round(data.approxTokens / 1000))}k tokens`,
        data.cached ? "cached" : "just downloaded",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card flex max-h-[85vh] w-full max-w-3xl flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-4 dark:border-stone-800">
          <div className="min-w-0">
            <p className="text-xs muted">What {APP_NAME} reads from</p>
            <h2 className="truncate font-semibold">{material.title}</h2>
            {stats && <p className="mt-0.5 text-xs muted">{stats}</p>}
          </div>
          <button className="btn btn-sm shrink-0" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {!data && !error && <PageLoading label="Downloading and reading the file…" />}
          {error && <ErrorBox message={error} />}
          {data?.lowText && (
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Very little text came out of this file. It may be mostly images, diagrams or math. Turn on “Read PDFs visually” to
              capture more.
            </p>
          )}
          {data && <pre className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{data.text || "(no text found)"}</pre>}
          {data?.truncated && <p className="mt-3 text-xs muted">Showing the first 80,000 characters.</p>}
        </div>
      </div>
    </div>
  );
}
