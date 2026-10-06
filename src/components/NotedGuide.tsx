"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GuideBody, Markdown } from "@/components/Markdown";
import { Spinner } from "@/components/ui";
import { api, streamEvents } from "@/lib/client";
import { DEFAULT_NOTE_QUESTION, type GuideNote, type SavedGuide } from "@/lib/types";

// Highlight a passage in a guide, ask about it, and the answer stays as a
// sticky note in the margin beside that passage (or below the guide on narrow
// screens). Notes are saved with the guide.

type Pending = { quote: string; question: string; answer: string; error?: string };
type Ask = { quote: string; x: number; y: number; open: boolean };

/** Find the quote in the rendered guide, ignoring whitespace (selections span blocks and inline tags). */
function findRange(root: HTMLElement, quote: string): Range | null {
  const target = quote.replace(/\s+/g, "");
  if (!target) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let flat = "";
  const map: [Text, number][] = [];
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    for (let i = 0; i < n.data.length; i++) {
      if (/\s/.test(n.data[i])) continue;
      flat += n.data[i];
      map.push([n, i]);
    }
  }
  const at = flat.indexOf(target);
  if (at < 0) return null;
  const [startNode, startOffset] = map[at];
  const [endNode, endOffset] = map[at + target.length - 1];
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset + 1);
  return range;
}

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
const highlights = () => (typeof CSS !== "undefined" ? (CSS as unknown as { highlights?: HighlightRegistry }).highlights : undefined);
const HighlightCtor = () => (typeof window !== "undefined" ? (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight : undefined);

export function NotedGuide({ guide }: { guide: SavedGuide }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef(new Map<string, HTMLDivElement>());
  const [notes, setNotes] = useState<GuideNote[]>(guide.notes ?? []);
  const [pending, setPending] = useState<Pending | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [question, setQuestion] = useState("");
  const [tops, setTops] = useState<Record<string, number>>({});
  const [layoutTick, setLayoutTick] = useState(0);

  // Re-place notes when the guide's layout changes (answer key opened, window resized).
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const ro = new ResizeObserver(() => setLayoutTick((t) => t + 1));
    ro.observe(body);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const all = [...notes.map((n) => ({ key: n.id, quote: n.quote })), ...(pending ? [{ key: "pending", quote: pending.quote }] : [])];
    const base = body.getBoundingClientRect().top;
    const ranges: Range[] = [];
    const wanted = all.map((n, i) => {
      const r = findRange(body, n.quote);
      if (r) ranges.push(r);
      return { key: n.key, top: r ? r.getBoundingClientRect().top - base : Number.MAX_SAFE_INTEGER - all.length + i };
    });
    // Stack notes downward so they never overlap.
    let floor = 0;
    const next: Record<string, number> = {};
    for (const w of [...wanted].sort((a, b) => a.top - b.top)) {
      const top = Math.max(w.top >= Number.MAX_SAFE_INTEGER - all.length ? floor : w.top, floor);
      next[w.key] = top;
      floor = top + (noteRefs.current.get(w.key)?.offsetHeight ?? 120) + 12;
    }
    setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    const reg = highlights();
    const Ctor = HighlightCtor();
    if (reg && Ctor) reg.set("clutch-notes", new Ctor(...ranges));
  }, [notes, pending, layoutTick]);

  useEffect(() => () => highlights()?.delete("clutch-notes"), []);

  const onMouseUp = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || sel.rangeCount === 0 || text.length < 3 || !bodyRef.current?.contains(sel.anchorNode)) {
        setAsk((a) => (a?.open ? a : null));
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setAsk({ quote: text.slice(0, 4000), x: Math.min(Math.max(rect.left + rect.width / 2, 160), window.innerWidth - 160), y: rect.bottom + 8, open: false });
    }, 0);
  }, []);

  // Close the floating button or box on scroll, Escape, or a click elsewhere.
  useEffect(() => {
    if (!ask) return;
    const close = () => setAsk((a) => (a?.open ? a : null));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsk(null);
    const outside = () => setAsk(null);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", outside);
    };
  }, [ask]);

  async function submit() {
    if (!ask) return;
    const quote = ask.quote;
    const q = question.trim();
    setAsk(null);
    setQuestion("");
    window.getSelection()?.removeAllRanges();
    setPending({ quote, question: q || DEFAULT_NOTE_QUESTION, answer: "" });
    let answer = "";
    try {
      await streamEvents(`/api/items/guide/${guide.id}/notes`, { action: "ask", quote, question: q }, (ev) => {
        if (ev.t === "text") {
          answer += ev.text;
          setPending((p) => p && { ...p, answer });
        } else if (ev.t === "error") {
          setPending((p) => p && { ...p, error: ev.message });
        } else if (ev.t === "done") {
          setNotes((n) => [...n, { id: ev.id, quote, question: q || DEFAULT_NOTE_QUESTION, answer: answer.trim(), createdAt: new Date().toISOString() }]);
          setPending(null);
        }
      });
    } catch (e) {
      setPending((p) => p && { ...p, error: (e as Error).message });
    }
  }

  async function remove(id: string) {
    const r = await api<{ notes: GuideNote[] }>(`/api/items/guide/${guide.id}/notes`, { action: "delete", noteId: id }).catch(() => null);
    if (r) setNotes(r.notes);
  }

  const cards = [
    ...notes.map((n) => ({ key: n.id, quote: n.quote, question: n.question, answer: n.answer, error: undefined as string | undefined, live: false })),
    ...(pending ? [{ key: "pending", ...pending, live: !pending.error }] : []),
  ];
  const card = (c: (typeof cards)[number], placed: boolean) => (
    <div
      key={c.key}
      ref={(el) => {
        if (placed && el) noteRefs.current.set(c.key, el);
      }}
      style={placed ? { top: tops[c.key] ?? 0 } : undefined}
      className={`${placed ? "absolute inset-x-0 transition-[top] duration-200" : ""} rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40`}
    >
      <p className="line-clamp-2 border-l-2 border-amber-400 pl-2 text-xs italic muted">“{c.quote}”</p>
      <p className="mt-2 text-xs font-semibold">{c.question}</p>
      {c.answer ? (
        <Markdown className="prose-sm mt-1">{c.answer}</Markdown>
      ) : (
        !c.error && (
          <p className="mt-1 flex items-center gap-2 text-xs muted">
            <Spinner /> Reading your course materials…
          </p>
        )
      )}
      {c.error && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{c.error}</p>}
      {c.key === "pending" ? (
        c.error && (
          <button onClick={() => setPending(null)} className="mt-2 text-xs muted hover:underline">
            Dismiss
          </button>
        )
      ) : (
        <button onClick={() => remove(c.key)} className="mt-2 text-xs muted hover:underline">
          Remove note
        </button>
      )}
    </div>
  );

  return (
    <div className="relative">
      <p className="mb-2 text-xs muted print:hidden">Highlight any passage to ask about it. Answers stay as notes beside it.</p>
      <div className="relative">
        <div ref={bodyRef} onMouseUp={onMouseUp} className="card p-6 sm:p-8 print:border-0 print:p-0 print:shadow-none">
          <GuideBody markdown={guide.markdown} />
        </div>
        {/* Wide screens: notes float in the right margin, level with their passage. */}
        <div className="absolute top-0 left-full ml-6 hidden w-72 xl:block print:hidden">{cards.map((c) => card(c, true))}</div>
      </div>
      {/* Narrow screens: notes stack below the guide. */}
      {cards.length > 0 && <div className="mt-6 space-y-3 xl:hidden print:hidden">{cards.map((c) => card(c, false))}</div>}

      {ask && (
        <div className="fixed z-40 -translate-x-1/2 print:hidden" style={{ left: ask.x, top: ask.y }} onMouseDown={(e) => e.stopPropagation()}>
          {!ask.open ? (
            <button
              className="btn btn-primary btn-sm shadow-lg"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAsk({ ...ask, open: true })}
            >
              Ask about this
            </button>
          ) : (
            <form
              className="card w-80 p-3 shadow-lg"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <p className="line-clamp-2 text-xs italic muted">“{ask.quote}”</p>
              <input
                id="note-question"
                autoFocus
                className="input mt-2"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={DEFAULT_NOTE_QUESTION}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" className="btn btn-sm" onClick={() => setAsk(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-sm" disabled={pending !== null && !pending.error}>
                  Ask
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
