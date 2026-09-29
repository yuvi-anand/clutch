"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { InlineFeedback } from "@/components/Feedback";
import { Markdown } from "@/components/Markdown";
import { ErrorBox, PageLoading } from "@/components/ui";
import { api, fmtDateTime, money } from "@/lib/client";
import type { SavedPlan } from "@/lib/types";

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SavedPlan>(`/api/items/plan/${id}`)
      .then(setPlan)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!plan) return <PageLoading label="Loading…" />;
  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm muted hover:underline print:hidden">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{plan.title}</h1>
      <p className="mt-1 text-xs muted">
        {fmtDateTime(plan.createdAt)} · {money(plan.cost)}
      </p>
      <div className="card mt-6 p-6 sm:p-8">
        <Markdown>{plan.markdown}</Markdown>
      </div>
      <InlineFeedback kind="plan" refId={plan.id} question="Is this plan realistic?" />
    </article>
  );
}
