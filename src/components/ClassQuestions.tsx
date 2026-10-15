"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Spinner, useStreamText } from "@/components/ui";
import { api, fmtAgo, streamEvents } from "@/lib/client";
import type { ClassQA } from "@/lib/types";

// "Are exams curved?" Ask how a class works and get an answer from its
// syllabus, Canvas grade setup and announcements. Answers are saved per class.

const IDEAS = [
  "How much is each part of my grade worth?",
  "Are exams curved?",
  "What's the late homework policy?",
  "Can I drop my lowest score?",
  "What do I need on the final for a B?",
];

export function ClassQuestions({ courseId, manual }: { courseId: number; manual: boolean }) {
  const [questions, setQuestions] = useState<ClassQA[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Only an answer asked on this visit stays open; older ones fold into the list.
  const [fresh, setFresh] = useState<string | null>(null);
  const answer = useStreamText();
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    api<{ questions: ClassQA[] }>(`/api/course/${courseId}/ask`)
      .then((r) => setQuestions(r.questions))
      .catch(() => {});
    return () => abort.current?.abort();
  }, [courseId]);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 3 || asking) return;
    const ac = new AbortController();
    abort.current = ac;
    setAsking(q);
    setQuestion("");
    setError(null);
    setStatus("Reading the class documents…");
    answer.reset();
    try {
      await streamEvents(
        `/api/course/${courseId}/ask`,
        { action: "ask", question: q },
        (ev) => {
          if (ev.t === "status") setStatus(ev.text);
          else if (ev.t === "text") answer.append(ev.text);
          else if (ev.t === "error") setError(ev.message);
        },
        ac.signal,
      );
      const r = await api<{ questions: ClassQA[] }>(`/api/course/${courseId}/ask`);
      setQuestions(r.questions);
      setFresh(r.questions.at(-1)?.id ?? null);
    } catch (e) {
      if (!ac.signal.aborted) setError((e as Error).message);
    } finally {
      answer.reset();
      setAsking(null);
    }
  }

  async function remove(id: string) {
    const r = await api<{ questions: ClassQA[] }>(`/api/course/${courseId}/ask`, { action: "delete", qaId: id }).catch(() => null);
    if (r) setQuestions(r.questions);
  }

  const latest = !asking && fresh ? questions.find((q) => q.id === fresh) : undefined;
  const earlier = questions.filter((q) => q !== latest).reverse();

  return (
    <section className="card p-5" aria-label="Ask about this class">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-semibold">Ask about this class</h2>
        <p className="text-xs muted">
          Answered from {manual ? "the website, files and notes you added" : "your syllabus, Canvas grade setup and announcements"}
        </p>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          className="input flex-1"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Are exams curved? What's the late homework policy?"
          maxLength={1000}
          disabled={Boolean(asking)}
          aria-label="Your question about the class"
        />
        <button className="btn btn-primary" disabled={Boolean(asking) || question.trim().length < 3}>
          Ask
        </button>
      </form>
      {!asking && !latest && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {IDEAS.map((idea) => (
            <button key={idea} type="button" className="chip hover:bg-stone-200 dark:hover:bg-stone-700" onClick={() => ask(idea)}>
              {idea}
            </button>
          ))}
        </div>
      )}

      {asking && (
        <div className="mt-4 rounded-lg bg-stone-50 p-4 dark:bg-stone-800/50">
          <p className="text-sm font-medium">{asking}</p>
          {answer.text ? (
            <Markdown className="prose-sm mt-2">{answer.text}</Markdown>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-sm muted">
              <Spinner /> {status}
            </p>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {latest && <Answer qa={latest} onDelete={() => remove(latest.id)} open />}

      {earlier.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm muted hover:underline">
            {latest ? "Earlier questions" : "Your questions"} ({earlier.length})
          </summary>
          <div className="mt-2 space-y-2">
            {earlier.map((qa) => (
              <Answer key={qa.id} qa={qa} onDelete={() => remove(qa.id)} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function Answer({ qa, onDelete, open = false }: { qa: ClassQA; onDelete: () => void; open?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <details open={open} className="group mt-4 rounded-lg bg-stone-50 p-4 dark:bg-stone-800/50 [&:not(:first-child)]:mt-2">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <span className="text-sm font-medium">{qa.question}</span>
        <span className="shrink-0 text-xs muted">{fmtAgo(qa.createdAt)}</span>
      </summary>
      <Markdown className="prose-sm mt-2">{qa.answer}</Markdown>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs muted">
        {qa.sources.length > 0 && <span>From: {qa.sources.join(", ")}</span>}
        {confirming ? (
          <span className="ml-auto flex items-center gap-2">
            Delete this answer?
            <button className="font-semibold text-red-700 hover:underline dark:text-red-300" onClick={onDelete}>
              Delete
            </button>
            <button className="hover:underline" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button className="ml-auto hover:underline" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
    </details>
  );
}
