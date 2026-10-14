"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GuideBody, Markdown } from "@/components/Markdown";
import { Spinner } from "@/components/ui";
import { api, streamEvents } from "@/lib/client";
import { DEFAULT_NOTE_QUESTION, type GuideNote, type SavedGuide } from "@/lib/types";

// Highlight a passage in a guide, ask about it, and the answer stays as a
// sticky note in the margin beside that passage (or below the guide on narrow
// screens). Notes are saved with the guide.

type Pending = { quote: string; occurrence: number; question: string; answer: string; error?: string };
type Ask = { quote: string; occurrence: number; x: number; y: number; open: boolean };

// Each formula is in the page twice: a hidden MathML copy for screen readers
// and the visible one. Notes only ever look at visible text.
const isHidden = (n: Node) => Boolean(n.parentElement?.closest(".katex-mathml"));

function visibleText(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (isHidden(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Every place the quote appears in the rendered guide, ignoring whitespace (selections span blocks and inline tags). */
function findRanges(root: HTMLElement, quote: string, nodes = visibleText(root)): Range[] {
  const target = quote.replace(/\s+/g, "");
  if (!target) return [];
  let flat = "";
  const map: [Text, number][] = [];
  for (const n of nodes) {
    for (let i = 0; i < n.data.length; i++) {
      if (/\s/.test(n.data[i])) continue;
      flat += n.data[i];
      map.push([n, i]);
    }
  }
  const out: Range[] = [];
  for (let at = flat.indexOf(target); at >= 0; at = flat.indexOf(target, at + 1)) {
    const [startNode, startOffset] = map[at];
    const [endNode, endOffset] = map[at + target.length - 1];
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset + 1);
    out.push(range);
  }
  return out;
}

const BLOCK = "p,li,h1,h2,h3,h4,h5,h6,td,th,pre,blockquote,.katex-display";

/** The visible text of a selection: formulas once, as shown, with a space between blocks. */
function selectionText(range: Range, root: HTMLElement): string {
  let out = "";
  let lastBlock: Element | null = null;
  for (const n of visibleText(root)) {
    if (!range.intersectsNode(n)) continue;
    const start = n === range.startContainer ? range.startOffset : 0;
    const end = n === range.endContainer ? range.endOffset : n.data.length;
    const piece = n.data.slice(start, end);
    if (!piece) continue;
    const block = n.parentElement?.closest(BLOCK) ?? null;
    if (out && block !== lastBlock && !/\s$/.test(out)) out += " ";
    out += piece;
    lastBlock = block;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Notes saved before formulas were read once have their quote polluted by the
 * hidden copy, e.g. "𝑓\n=\n𝑜\n(\n𝑔\n)\nf=o(g)". Drop those one-symbol lines
 * and fold the math letters back to plain ones.
 */
function repairQuote(quote: string): string {
  const out: string[] = [];
  let run: string[] = [];
  const endRun = () => {
    if (run.length === 1) out.push(run[0]);
    run = [];
  };
  for (const line of quote.split("\n")) {
    const t = line.trim();
    if (t && t.length <= 4 && !/\s/.test(t)) run.push(t);
    else {
      endRun();
      out.push(line);
    }
  }
  endRun();
  return out.join(" ").normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Find a note's passage. Returns the range and the quote as it reads on the page. */
function locate(root: HTMLElement, note: { quote: string; occurrence?: number; anchor?: 2 }): { range: Range; quote: string } | null {
  const nodes = visibleText(root);
  for (const quote of note.anchor === 2 ? [note.quote] : [note.quote, repairQuote(note.quote)]) {
    const all = findRanges(root, quote, nodes);
    if (!all.length) continue;
    let i = note.occurrence ?? 0;
    if (note.anchor !== 2 && i > 0) {
      // Older notes counted hidden copies too: find that spot, then the visible copy at or after it.
      const old = findRangesAll(root, note.quote)[i];
      i = old ? Math.max(0, all.findIndex((r) => r.compareBoundaryPoints(Range.START_TO_START, old) >= 0)) : 0;
    }
    return { range: all[i] ?? all[0], quote };
  }
  return null;
}

/** The old way of matching, over every text node (hidden formula copies included). Only for placing older notes. */
function findRangesAll(root: HTMLElement, quote: string): Range[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return findRanges(root, quote, nodes);
}

/** The parts of a range that are ordinary text, leaving out formulas. */
function textOnly(range: Range): Range[] {
  const rootNode = range.commonAncestorContainer;
  const out: Range[] = [];
  for (const n of visibleText(rootNode.nodeType === Node.TEXT_NODE ? rootNode.parentNode! : rootNode)) {
    if (!range.intersectsNode(n) || n.parentElement?.closest(".katex")) continue;
    const part = document.createRange();
    part.setStart(n, n === range.startContainer ? range.startOffset : 0);
    part.setEnd(n, n === range.endContainer ? range.endOffset : n.data.length);
    if (!part.collapsed) out.push(part);
  }
  return out;
}

/** Which copy of the quote the selection is on (0 when it appears once). */
function occurrenceOf(root: HTMLElement, quote: string, sel: Range): number {
  const all = findRanges(root, quote);
  const i = all.findIndex((r) => r.compareBoundaryPoints(Range.END_TO_START, sel) <= 0 && r.compareBoundaryPoints(Range.START_TO_END, sel) >= 0);
  return Math.max(0, i);
}

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
const highlights = () => (typeof CSS !== "undefined" ? (CSS as unknown as { highlights?: HighlightRegistry }).highlights : undefined);
const HighlightCtor = () => (typeof window !== "undefined" ? (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight : undefined);

export function NotedGuide({ guide }: { guide: SavedGuide }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef(new Map<string, HTMLDivElement>());
  const [notes, setNotes] = useState<GuideNote[]>(guide.notes ?? []);
  const [pending, setPending] = useState<Pending | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [question, setQuestion] = useState("");
  const [tops, setTops] = useState<Record<string, number>>({});
  const [layoutTick, setLayoutTick] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Notes whose passage isn't in the guide (it was rewritten), and quotes as they read on the page.
  const [missing, setMissing] = useState<string[]>([]);
  const [shown, setShown] = useState<Record<string, string>>({});

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
    const all = [
      ...notes.map((n) => ({ key: n.id, quote: n.quote, occurrence: n.occurrence ?? 0, anchor: n.anchor })),
      ...(pending ? [{ key: "pending", quote: pending.quote, occurrence: pending.occurrence, anchor: 2 as const }] : []),
    ];
    const base = body.getBoundingClientRect().top;
    const ranges: Range[] = [];
    const wanted: { key: string; top: number }[] = [];
    const lost: string[] = [];
    const quotes: Record<string, string> = {};
    for (const n of all) {
      const found = locate(body, n);
      if (!found) {
        lost.push(n.key);
        continue;
      }
      ranges.push(found.range);
      quotes[n.key] = found.quote;
      wanted.push({ key: n.key, top: found.range.getBoundingClientRect().top - base });
    }
    // Stack notes downward so they never overlap.
    let floor = 0;
    const next: Record<string, number> = {};
    for (const w of wanted.sort((a, b) => a.top - b.top)) {
      const top = Math.max(w.top, floor);
      next[w.key] = top;
      floor = top + (noteRefs.current.get(w.key)?.offsetHeight ?? 120) + 12;
    }
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    setTops((prev) => (same(prev, next) ? prev : next));
    setMissing((prev) => (same(prev, lost) ? prev : lost));
    setShown((prev) => (same(prev, quotes) ? prev : quotes));
    const reg = highlights();
    const Ctor = HighlightCtor();
    // Text gets the highlight; each formula gets one rounded mark instead of a box per symbol.
    body.querySelectorAll("[data-noted]").forEach((el) => el.removeAttribute("data-noted"));
    const textRanges: Range[] = [];
    for (const r of ranges) {
      body.querySelectorAll(".katex").forEach((el) => {
        if (r.intersectsNode(el)) el.setAttribute("data-noted", "");
      });
      textRanges.push(...textOnly(r));
    }
    if (reg && Ctor) reg.set("clutch-notes", new Ctor(...textRanges));
  }, [notes, pending, layoutTick]);

  useEffect(() => () => highlights()?.delete("clutch-notes"), []);

  const onMouseUp = useCallback((e: MouseEvent) => {
    if ((e.target as Element | null)?.closest?.("[data-ask-box]")) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const body = bodyRef.current;
      const inside = Boolean(body && sel && sel.rangeCount > 0 && body.contains(sel.getRangeAt(0).commonAncestorContainer));
      const text = inside ? selectionText(sel!.getRangeAt(0), body!) : "";
      if (!sel || !inside || text.length < 3) {
        setAsk((a) => (a?.open ? a : null));
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const host = rootRef.current?.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left + rect.width / 2, 170), window.innerWidth - 170) - (host?.left ?? 0);
      const quote = text.slice(0, 4000);
      setAsk({ quote, occurrence: occurrenceOf(body!, quote, sel.getRangeAt(0)), x, y: rect.bottom + 8 - (host?.top ?? 0), open: false });
    }, 0);
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [onMouseUp]);

  // Close the floating button or box on Escape or a click elsewhere.
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsk(null);
    const outside = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-ask-box]")) return;
      setAsk(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", outside);
    };
  }, [ask]);

  async function submit() {
    if (!ask) return;
    const { quote, occurrence } = ask;
    const q = question.trim();
    setAsk(null);
    setQuestion("");
    window.getSelection()?.removeAllRanges();
    setPending({ quote, occurrence, question: q || DEFAULT_NOTE_QUESTION, answer: "" });
    let answer = "";
    try {
      await streamEvents(`/api/items/guide/${guide.id}/notes`, { action: "ask", quote, occurrence, question: q }, (ev) => {
        if (ev.t === "text") {
          answer += ev.text;
          setPending((p) => p && { ...p, answer });
        } else if (ev.t === "error") {
          setPending((p) => p && { ...p, error: ev.message });
        } else if (ev.t === "done") {
          setNotes((n) => [...n, { id: ev.id, quote, occurrence, question: q || DEFAULT_NOTE_QUESTION, answer: answer.trim(), createdAt: new Date().toISOString() }]);
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
  const placed = cards.filter((c) => !missing.includes(c.key));
  const lost = cards.filter((c) => missing.includes(c.key));
  const card = (c: (typeof cards)[number], placed: boolean) => (
    <div
      key={c.key}
      ref={(el) => {
        if (placed && el) noteRefs.current.set(c.key, el);
      }}
      style={placed ? { top: tops[c.key] ?? 0 } : undefined}
      className={`${placed ? "absolute inset-x-0 transition-[top] duration-200" : ""} rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40`}
    >
      <div className="flex items-start gap-2">
        <p className="line-clamp-2 min-w-0 flex-1 border-l-2 border-amber-400 pl-2 text-xs italic muted">“{shown[c.key] ?? c.quote}”</p>
        {c.key !== "pending" && (
          <button
            onClick={() => setConfirming(c.key)}
            title="Delete note"
            aria-label="Delete note"
            className="-mt-1 -mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-base leading-none muted hover:bg-amber-100 hover:text-red-700 dark:hover:bg-amber-900/50 dark:hover:text-red-300"
          >
            ×
          </button>
        )}
      </div>
      {confirming === c.key && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-white/70 px-2 py-1.5 text-xs dark:bg-stone-900/60">
          <span className="flex-1">Delete this note?</span>
          <button
            onClick={() => {
              setConfirming(null);
              remove(c.key);
            }}
            className="font-semibold text-red-700 hover:underline dark:text-red-300"
          >
            Delete
          </button>
          <button onClick={() => setConfirming(null)} className="muted hover:underline">
            Keep
          </button>
        </div>
      )}
      <p className="mt-2 text-xs font-semibold">{c.question}</p>
      {c.answer ? (
        <div className={placed ? "mt-1 max-h-56 overflow-y-auto pr-1" : "mt-1"}>
          <Markdown className="prose-sm">{c.answer}</Markdown>
        </div>
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
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <p className="mb-2 text-xs muted print:hidden">Highlight any passage to ask about it. Answers stay as notes beside it.</p>
      <div className="relative">
        <div ref={bodyRef} className="card p-6 sm:p-8 print:border-0 print:p-0 print:shadow-none">
          <GuideBody markdown={guide.markdown} />
        </div>
        {/* Wide screens: notes float in the right margin, level with their passage. */}
        <div className="absolute top-0 left-full ml-4 hidden w-64 lg:block xl:ml-6 xl:w-72 print:hidden">{placed.map((c) => card(c, true))}</div>
      </div>
      {/* Narrow screens: notes stack below the guide. */}
      {placed.length > 0 && <div className="mt-6 space-y-3 lg:hidden print:hidden">{placed.map((c) => card(c, false))}</div>}
      {lost.length > 0 && (
        <section className="mt-6 print:hidden">
          <p className="text-xs font-semibold tracking-wide uppercase muted">Notes on text that changed</p>
          <p className="mt-1 text-xs muted">
            {(guide.refinements?.length ?? 0) > 0
              ? "These passages were reworded when the guide was refined, so the notes can't sit beside them anymore."
              : "These passages couldn't be found in the guide anymore."}{" "}
            Keep them for reference, or delete them.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{lost.map((c) => card(c, false))}</div>
        </section>
      )}

      {ask && (
        <div data-ask-box className="absolute z-40 -translate-x-1/2 print:hidden" style={{ left: ask.x, top: ask.y }} onMouseDown={(e) => e.stopPropagation()}>
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
