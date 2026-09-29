"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorBox, PageLoading } from "@/components/ui";
import { api, fmtAgo } from "@/lib/client";
import type { LibraryEntry } from "@/lib/types";

const LABELS: Record<LibraryEntry["type"], string> = {
  guide: "Study guide",
  practice: "Practice set",
  cheatsheet: "Cheat sheet",
  quiz: "Quiz",
  plan: "Plan",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "guides", label: "Guides & sheets" },
  { id: "quiz", label: "Quizzes" },
  { id: "plan", label: "Plans" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

const hrefFor = (i: LibraryEntry) => (i.type === "quiz" ? `/quiz/${i.id}` : i.type === "plan" ? `/plan/${i.id}` : `/guide/${i.id}`);

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: LibraryEntry[] }>("/api/items")
      .then((r) => setItems(r.items))
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!items) return <PageLoading label="Loading your library…" />;

  const shown = items.filter((i) =>
    filter === "all" ? true : filter === "guides" ? ["guide", "practice", "cheatsheet"].includes(i.type) : i.type === filter,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Library</h1>
      <p className="mt-1 text-sm muted">Everything you&apos;ve made. It&apos;s saved on this computer in the data folder.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`btn btn-sm ${filter === f.id ? "border-indigo-500 ring-2 ring-indigo-500/20" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="card mt-6 p-8 text-center text-sm muted">
          Nothing here yet.{" "}
          <Link href="/" className="link">
            Open a class from the dashboard
          </Link>{" "}
          and make your first study guide.
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {shown.map((i) => (
            <li key={`${i.type}-${i.id}`}>
              <Link href={hrefFor(i)} className="card flex items-center gap-4 p-4 transition-colors hover:border-stone-300 dark:hover:border-stone-700">
                <span className="chip w-24 shrink-0 justify-center">{LABELS[i.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.title}</span>
                  <span className="block truncate text-xs muted">{[i.courseName, i.topics].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 text-xs muted">{fmtAgo(i.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
