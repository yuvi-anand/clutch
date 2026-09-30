"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { dateKey, fmtDateKey, fmtRange } from "@/lib/text";
import type { PersonalItem, PersonalState } from "@/lib/types";

type Result = { state: PersonalState; added?: PersonalItem[] };

function describe(i: PersonalItem): string {
  if (i.kind === "busy") {
    const when = i.start && i.end ? fmtRange(i.start, i.end) : "";
    const avail = i.availability === "limited" ? `less time${i.hours ? `, about ${i.hours} h a day` : ""}` : "can't study";
    return [when, avail].filter(Boolean).join(" · ");
  }
  return [i.end ? `due ${fmtDateKey(i.end)}` : "no due date", i.hours ? `about ${i.hours} h` : null].filter(Boolean).join(" · ");
}

/** Upcoming busy times first by date, then to-dos by due date, undated and done ones last. */
function visible(items: PersonalItem[]): PersonalItem[] {
  const today = dateKey(new Date());
  const key = (i: PersonalItem) => `${i.done ? 1 : 0}${(i.kind === "busy" ? i.start : i.end) ?? "9999"}`;
  return items.filter((i) => i.kind === "task" || (i.end ?? "") >= today).sort((a, b) => key(a).localeCompare(key(b)));
}

export function YourWeek({ onChange }: { onChange: (state: PersonalState) => void }) {
  const [state, setState] = useState<PersonalState | null>(null);
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);

  useEffect(() => {
    api<PersonalState>("/api/personal")
      .then((s) => {
        setState(s);
        setNotes(s.notes);
      })
      .catch(() => {});
  }, []);

  async function act(body: object): Promise<Result> {
    const r = await api<Result>("/api/personal", body);
    setState(r.state);
    onChange(r.state);
    return r;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    setMessage(null);
    try {
      const r = await act({ action: "add", text });
      if (r.added?.length) setText("");
      else setMessage("Couldn't find a date or task in that. Try adding a day, like “all day Saturday” or “by Oct 15”.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function saveNotes() {
    if (!state || notes === state.notes) return setNotesSaved(true);
    await act({ action: "notes", notes }).catch(() => {});
    setNotesSaved(true);
  }

  const items = state ? visible(state.items) : [];
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">Your week</h2>
        <p className="text-sm muted">Anything outside class your plan should work around.</p>
      </div>
      <form onSubmit={add} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="your-week-input"
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. “debate tournament all day Saturday” or “apply to 5 internships by Oct 15”"
          disabled={adding}
        />
        <button className="btn btn-primary shrink-0" disabled={adding || !text.trim()}>
          {adding ? (
            <>
              <Spinner /> Adding…
            </>
          ) : (
            "Add"
          )}
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{message}</p>}

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-stone-100 dark:divide-stone-800">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
              {i.kind === "task" ? (
                <input
                  type="checkbox"
                  checked={Boolean(i.done)}
                  onChange={() => act({ action: "toggle", id: i.id }).catch(() => {})}
                  className="h-4 w-4 shrink-0 accent-indigo-600"
                  title={i.done ? "Mark not done" : "Mark done"}
                />
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span
                className={`chip w-14 shrink-0 justify-center ${
                  i.kind === "busy"
                    ? "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                    : "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"
                }`}
              >
                {i.kind === "busy" ? "Busy" : "To-do"}
              </span>
              <span className={`min-w-0 flex-1 ${i.done ? "line-through muted" : ""}`}>
                <span className="font-medium">{i.title}</span>
                <span className="block text-xs muted">{describe(i)}</span>
              </span>
              <button onClick={() => act({ action: "delete", id: i.id }).catch(() => {})} className="shrink-0 text-xs muted hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4" open={Boolean(state?.notes)}>
        <summary className="cursor-pointer text-sm font-medium">Notes for your plan</summary>
        <textarea
          id="your-week-notes"
          rows={2}
          className="input mt-2"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesSaved(false);
          }}
          onBlur={saveNotes}
          placeholder="e.g. I focus best in the mornings. Weekdays I have about 2 hours."
        />
        <p className="mt-1 text-xs muted">{notesSaved ? "Saved" : "Saves when you click away"}</p>
      </details>
    </section>
  );
}
