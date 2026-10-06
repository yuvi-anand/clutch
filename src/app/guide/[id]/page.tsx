"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { InlineFeedback } from "@/components/Feedback";
import { GuideBody } from "@/components/Markdown";
import { NotedGuide } from "@/components/NotedGuide";
import { ErrorBox, PageLoading, Spinner, useStreamText } from "@/components/ui";
import { api, clearPending, fmtDateTime, getPending, money, setPending, streamEvents } from "@/lib/client";
import { MODE_LABELS, type GenerateRequest, type Mode, type SavedGuide } from "@/lib/types";

export default function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return id === "new" ? <GenerateGuide /> : <GuideView id={id} />;
}

function GenerateGuide() {
  const router = useRouter();
  const [req, setReq] = useState<GenerateRequest | null | undefined>(undefined);
  const [log, setLog] = useState<string[]>([]);
  const [thinking, setThinking] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { text, append, flush } = useStreamText();

  useEffect(() => setReq(getPending()), []);

  useEffect(() => {
    if (!req || req.mode === "quiz") return;
    const ac = new AbortController();
    streamEvents(
      "/api/generate",
      req,
      (ev) => {
        if (ev.t === "status") setLog((l) => [...l, ev.text]);
        else if (ev.t === "thinking") setThinking((t) => (t + ev.text).slice(-420));
        else if (ev.t === "text") append(ev.text);
        else if (ev.t === "error") setError(ev.message);
        else if (ev.t === "done") {
          clearPending();
          router.replace(`/guide/${ev.id}`);
        }
      },
      ac.signal,
    )
      .catch((e) => {
        if (!ac.signal.aborted) setError((e as Error).message);
      })
      .finally(flush);
    return () => ac.abort();
  }, [req, router, append, flush]);

  if (req === undefined) return <PageLoading label="Starting…" />;
  if (req === null || req.mode === "quiz") {
    return (
      <div className="py-16 text-center">
        <p className="muted">Nothing to write right now. Pick a class and some materials first.</p>
        <Link href="/" className="btn mt-4">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  const writing = text.length > 0;
  return (
    <article className="mx-auto max-w-3xl">
      <Link href={`/course/${req.courseId}`} className="text-sm muted hover:underline">
        ← Back to the course
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="chip">{MODE_LABELS[req.mode]}</span>
        {!error && (
          <span className="flex items-center gap-2 text-sm muted">
            <Spinner /> {writing ? "Writing… (this can take a minute or two)" : "Reading your course materials…"}
          </span>
        )}
      </div>
      {req.topics && <h1 className="mt-3 text-xl font-semibold">{req.topics}</h1>}
      <details className="card mt-4 p-4 text-sm" open={!writing}>
        <summary className="cursor-pointer font-medium">Progress ({log.length} steps)</summary>
        <ul className="mt-2 space-y-1 muted">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        {thinking && <p className="mt-3 border-l-2 border-indigo-300 pl-3 text-xs italic muted">{thinking}</p>}
      </details>
      {error && (
        <div className="mt-4">
          <ErrorBox message={error}>
            <button className="btn" onClick={() => window.location.reload()}>
              Try again
            </button>
            <Link className="btn" href={`/course/${req.courseId}`}>
              Change the materials
            </Link>
          </ErrorBox>
        </div>
      )}
      {writing && (
        <div className="card mt-6 p-6 sm:p-8">
          <GuideBody markdown={text} streaming={!error} />
        </div>
      )}
    </article>
  );
}

function GuideView({ id }: { id: string }) {
  const router = useRouter();
  const [guide, setGuide] = useState<SavedGuide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<SavedGuide>(`/api/items/guide/${id}`)
      .then(setGuide)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) {
    return (
      <ErrorBox message={error}>
        <Link href="/library" className="btn">
          Go to the library
        </Link>
      </ErrorBox>
    );
  }
  if (!guide) return <PageLoading label="Loading…" />;
  const g = guide;

  function next(mode: Mode) {
    setPending({ courseId: g.courseId, mode, topics: g.topics, note: g.note, keys: g.keys, visual: g.visual, count: 10 });
    router.push(mode === "quiz" ? "/quiz/new" : "/guide/new");
  }

  async function copy() {
    await navigator.clipboard.writeText(g.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <article className="mx-auto max-w-3xl xl:mr-[20rem] xl:ml-auto">
      <Link href={`/course/${g.courseId}`} className="text-sm muted hover:underline print:hidden">
        ← {g.courseName}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs muted">
        <span className="chip">{MODE_LABELS[g.type]}</span>
        <span>{fmtDateTime(g.createdAt)}</span>
        <span>·</span>
        <span>
          {g.sources.length} source{g.sources.length === 1 ? "" : "s"}
          {g.visual ? " (read visually)" : ""}
        </span>
        <span>·</span>
        <span>{money(g.cost)}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        <button className="btn btn-primary btn-sm" onClick={() => next("quiz")}>
          Quiz me on this
        </button>
        {g.type !== "practice" && (
          <button className="btn btn-sm" onClick={() => next("practice")}>
            More practice problems
          </button>
        )}
        {g.type !== "cheatsheet" && (
          <button className="btn btn-sm" onClick={() => next("cheatsheet")}>
            Cheat sheet
          </button>
        )}
        {g.type !== "guide" && (
          <button className="btn btn-sm" onClick={() => next("guide")}>
            Full study guide
          </button>
        )}
        <button className="btn btn-sm" onClick={copy}>
          {copied ? "Copied ✓" : "Copy Markdown"}
        </button>
        <button className="btn btn-sm" onClick={() => window.print()}>
          Print
        </button>
      </div>
      {g.truncated && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          This stopped early because it hit the length limit. Pick fewer materials for a complete guide.
        </p>
      )}
      <div className="mt-6">
        <NotedGuide guide={g} />
      </div>
      <div className="mt-6 print:hidden">
        <p className="text-xs font-semibold tracking-wide uppercase muted">Built from</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {g.sources.map((s) => (
            <li key={s.key} className="chip" title={s.lowText ? "Very little text could be read from this file" : undefined}>
              {s.title}
              {s.units && s.unitLabel && s.unitLabel !== "section" ? ` · ${s.units} ${s.unitLabel}s` : ""}
              {s.lowText ? " ⚠" : ""}
            </li>
          ))}
        </ul>
      </div>
      <InlineFeedback kind="guide" refId={g.id} question="Did this help you catch up?" />
    </article>
  );
}
