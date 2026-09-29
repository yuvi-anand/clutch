"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { InlineFeedback } from "@/components/Feedback";
import { Markdown } from "@/components/Markdown";
import { ErrorBox, PageLoading, Spinner } from "@/components/ui";
import { api, clearPending, getPending, setPending, streamEvents } from "@/lib/client";
import type { GenerateRequest, Mode, QuizQuestion, SavedQuiz } from "@/lib/types";

type Answer = { choice?: number; text?: string; revealed: boolean; correct?: boolean };

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return id === "new" ? <GenerateQuiz /> : <QuizView id={id} />;
}

function GenerateQuiz() {
  const router = useRouter();
  const [req, setReq] = useState<GenerateRequest | null | undefined>(undefined);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ n: number; total?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setReq(getPending()), []);

  useEffect(() => {
    if (!req || req.mode !== "quiz") return;
    const ac = new AbortController();
    streamEvents(
      "/api/generate",
      req,
      (ev) => {
        if (ev.t === "status") setLog((l) => [...l, ev.text]);
        else if (ev.t === "progress") setProgress({ n: ev.n, total: ev.total });
        else if (ev.t === "error") setError(ev.message);
        else if (ev.t === "done") {
          clearPending();
          router.replace(`/quiz/${ev.id}`);
        }
      },
      ac.signal,
    ).catch((e) => {
      if (!ac.signal.aborted) setError((e as Error).message);
    });
    return () => ac.abort();
  }, [req, router]);

  if (req === undefined) return <PageLoading label="Starting…" />;
  if (req === null || req.mode !== "quiz") {
    return (
      <div className="py-16 text-center">
        <p className="muted">No quiz to make right now. Pick a class and some materials first.</p>
        <Link href="/" className="btn mt-4">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  const total = progress?.total ?? req.count ?? 10;
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/course/${req.courseId}`} className="text-sm muted hover:underline">
        ← Back to the course
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Making your quiz{req.topics ? `: ${req.topics}` : ""}</h1>
      {!error && (
        <div className="card mt-6 p-5">
          <p className="flex items-center gap-2 text-sm">
            <Spinner />
            {progress ? `Writing question ${Math.min(progress.n, total)} of ${total}…` : "Reading your course materials…"}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress ? (Math.min(progress.n, total) / total) * 100 : 4}%` }} />
          </div>
          <ul className="mt-4 space-y-1 text-sm muted">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <div className="mt-6">
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
    </div>
  );
}

function QuizView({ id }: { id: string }) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<SavedQuiz | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(false);

  useEffect(() => {
    api<SavedQuiz>(`/api/items/quiz/${id}`)
      .then((q) => {
        setQuiz(q);
        setAnswers(q.questions.map(() => ({ revealed: false })));
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const done = answers.length > 0 && answers.every((a) => a.correct !== undefined);

  useEffect(() => {
    if (!done || !quiz || saved.current) return;
    saved.current = true;
    api(`/api/items/quiz/${quiz.id}`, { correct: answers.map((a) => Boolean(a.correct)) }).catch(() => {});
  }, [done, quiz, answers]);

  if (error) {
    return (
      <ErrorBox message={error}>
        <Link href="/library" className="btn">
          Go to the library
        </Link>
      </ErrorBox>
    );
  }
  if (!quiz) return <PageLoading label="Loading the quiz…" />;
  const q0 = quiz;

  const update = (i: number, patch: Partial<Answer>) => setAnswers((all) => all.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const answered = answers.filter((a) => a.correct !== undefined).length;
  const right = answers.filter((a) => a.correct).length;

  function retake() {
    saved.current = false;
    setAnswers(q0.questions.map(() => ({ revealed: false })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function followUp(mode: Mode) {
    const missed = q0.questions.filter((_, i) => answers[i]?.correct === false);
    const weak = [...new Set(missed.map((q) => q.topic))];
    setPending({
      courseId: q0.courseId,
      mode,
      topics: weak.join(", ") || q0.topics,
      note: missed.length ? `I missed these practice quiz questions:\n${missed.map((q) => `- ${q.question.slice(0, 240)}`).join("\n")}` : q0.note,
      keys: q0.keys,
      visual: q0.visual,
      count: 10,
    });
    router.push(mode === "quiz" ? "/quiz/new" : "/guide/new");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/course/${quiz.courseId}`} className="text-sm muted hover:underline">
        ← {quiz.courseName}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{quiz.title}</h1>
      <div className="sticky top-14 z-10 mt-4 rounded-lg border border-stone-200 bg-stone-50/90 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="flex items-center justify-between text-sm">
          <span>
            {answered}/{quiz.questions.length} answered
          </span>
          <span className="font-medium tabular-nums">{right} correct</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div className="h-full bg-indigo-600 transition-all" style={{ width: `${(answered / quiz.questions.length) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-6 space-y-4">
        {quiz.questions.map((q, i) => (
          <QuestionCard key={i} n={i + 1} q={q} a={answers[i]} update={(p) => update(i, p)} />
        ))}
      </ol>
      {done && <Results quiz={quiz} answers={answers} onRetake={retake} onFollowUp={followUp} />}
      <InlineFeedback kind="quiz" refId={quiz.id} question="Were these good practice questions?" />
    </div>
  );
}

function QuestionCard({ n, q, a, update }: { n: number; q: QuizQuestion; a?: Answer; update: (p: Partial<Answer>) => void }) {
  if (!a) return null;
  const graded = a.correct !== undefined;
  return (
    <li className="card p-5">
      <div className="flex items-center justify-between gap-3 text-xs muted">
        <span>
          Question {n} · {q.topic}
        </span>
        <span>{q.type === "mcq" ? "Multiple choice" : "Short answer"}</span>
      </div>
      <Markdown className="mt-2">{q.question}</Markdown>
      {q.type === "mcq" ? (
        <div className="mt-4 grid gap-2">
          {q.choices.map((choice, ci) => {
            const isRight = ci === q.answer_index;
            const chosen = a.choice === ci;
            const style = !a.revealed
              ? "border-stone-300 hover:border-indigo-400 hover:bg-indigo-50/60 dark:border-stone-700 dark:hover:bg-indigo-950/30"
              : isRight
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                : chosen
                  ? "border-red-500 bg-red-50 dark:bg-red-950/40"
                  : "border-stone-200 opacity-60 dark:border-stone-800";
            return (
              <button
                key={ci}
                disabled={a.revealed}
                onClick={() => update({ choice: ci, revealed: true, correct: isRight })}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${style}`}
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-current text-[11px] font-semibold">
                  {"ABCDEFGH"[ci]}
                </span>
                <Markdown inline>{choice}</Markdown>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <textarea
            rows={3}
            value={a.text ?? ""}
            disabled={a.revealed}
            onChange={(e) => update({ text: e.target.value })}
            className="input"
            placeholder="Write your answer, then check it."
          />
          {!a.revealed && (
            <button className="btn btn-sm mt-2" onClick={() => update({ revealed: true })}>
              Check my answer
            </button>
          )}
          {a.revealed && (
            <div className="mt-3 rounded-lg bg-stone-100 p-3 dark:bg-stone-800/60">
              <p className="text-xs font-semibold tracking-wide uppercase muted">Model answer</p>
              <Markdown className="mt-1">{q.answer}</Markdown>
              {!graded && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span>Did you get it?</span>
                  <button className="btn btn-sm" onClick={() => update({ correct: true })}>
                    Yes
                  </button>
                  <button className="btn btn-sm" onClick={() => update({ correct: false })}>
                    Not quite
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {a.revealed && (
        <div className="mt-3 text-sm">
          {graded && (
            <p className={`font-medium ${a.correct ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
              {a.correct ? "Correct" : "Not quite"}
            </p>
          )}
          <Markdown className="mt-1">{q.explanation}</Markdown>
          {q.source && <p className="mt-2 text-xs muted">Source: {q.source}</p>}
        </div>
      )}
    </li>
  );
}

function Results({
  quiz,
  answers,
  onRetake,
  onFollowUp,
}: {
  quiz: SavedQuiz;
  answers: Answer[];
  onRetake: () => void;
  onFollowUp: (mode: Mode) => void;
}) {
  const total = quiz.questions.length;
  const right = answers.filter((a) => a.correct).length;
  const byTopic = new Map<string, { right: number; total: number }>();
  quiz.questions.forEach((q, i) => {
    const t = byTopic.get(q.topic) ?? { right: 0, total: 0 };
    t.total += 1;
    if (answers[i]?.correct) t.right += 1;
    byTopic.set(q.topic, t);
  });
  const weak = [...byTopic].filter(([, v]) => v.right < v.total).map(([k]) => k);
  return (
    <section className="card mt-8 p-6">
      <p className="text-sm muted">Your score</p>
      <p className="text-4xl font-semibold tabular-nums">
        {right}/{total} <span className="text-xl muted">({Math.round((right / total) * 100)}%)</span>
      </p>
      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className="text-left text-xs muted">
            <th className="pb-2 font-medium">Topic</th>
            <th className="pb-2 text-right font-medium">Correct</th>
          </tr>
        </thead>
        <tbody>
          {[...byTopic].map(([topic, v]) => (
            <tr key={topic} className="border-t border-stone-100 dark:border-stone-800">
              <td className="py-2">{topic}</td>
              <td className={`py-2 text-right tabular-nums ${v.right < v.total ? "text-red-700 dark:text-red-400" : ""}`}>
                {v.right}/{v.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {weak.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm">
            Weak spots: <b>{weak.join(", ")}</b>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => onFollowUp("guide")}>
              Study guide on what I missed
            </button>
            <button className="btn" onClick={() => onFollowUp("quiz")}>
              New quiz on my weak spots
            </button>
            <button className="btn" onClick={onRetake}>
              Retake this quiz
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm">Clean sweep. Try a harder quiz, or move on to the next topic.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn" onClick={onRetake}>
              Retake
            </button>
            <Link href={`/course/${quiz.courseId}`} className="btn">
              Pick another topic
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
