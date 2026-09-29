"use client";

import { useCallback, useRef, useState } from "react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-2px] ${className}`}
    />
  );
}

export function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-sm muted">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBox({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
      <p>{message}</p>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

const SCORE_STYLES = [
  { min: 90, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" },
  { min: 80, cls: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200" },
  { min: 70, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" },
  { min: -1, cls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200" },
];

export function ScorePill({ score }: { score: number | null }) {
  if (score == null) return <span className="chip">No grade yet</span>;
  const cls = SCORE_STYLES.find((s) => score >= s.min)!.cls;
  return <span className={`rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${cls}`}>{Math.round(score)}%</span>;
}

/**
 * Collects streamed text and re-renders at most every ~60ms, so long
 * Markdown documents don't re-render on every token.
 */
export function useStreamText() {
  const ref = useRef("");
  const timer = useRef<number | null>(null);
  const [text, setText] = useState("");
  const append = useCallback((s: string) => {
    ref.current += s;
    if (timer.current == null) {
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setText(ref.current);
      }, 60);
    }
  }, []);
  const flush = useCallback(() => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setText(ref.current);
  }, []);
  const reset = useCallback(() => {
    ref.current = "";
    setText("");
  }, []);
  return { text, append, flush, reset };
}
