"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Kind = "general" | "guide" | "quiz" | "plan";

async function sendFeedback(body: { kind: Kind; refId?: string; rating?: "up" | "down"; comment?: string; path?: string }) {
  await api("/api/feedback", body);
}

/** Floating button on every page for general feedback on the demo. */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit() {
    if (!text.trim()) return;
    setState("sending");
    try {
      await sendFeedback({ kind: "general", comment: text.trim(), path: pathname });
      setState("sent");
      setText("");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          setState("idle");
        }}
        className="btn fixed right-4 bottom-4 z-30 rounded-full shadow-lg print:hidden"
      >
        💬 Feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">How's the demo working for you?</h2>
            <p className="mt-1 text-sm muted">What's useful, what's confusing, what's missing, what broke. It's saved to data/feedback.jsonl on this computer.</p>
            {state === "sent" ? (
              <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">Thanks! Saved. Add more any time.</p>
            ) : (
              <textarea
                autoFocus
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="input mt-4"
                placeholder="e.g. The plan was great, but the CS 3000 guide skipped the recursion tree method…"
              />
            )}
            {state === "error" && <p className="mt-2 text-sm text-red-600">Couldn't save that. Is the app still running?</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" onClick={() => setOpen(false)}>
                Close
              </button>
              {state !== "sent" && (
                <button className="btn btn-primary" disabled={!text.trim() || state === "sending"} onClick={submit}>
                  {state === "sending" ? "Saving…" : "Send feedback"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Thumbs up/down plus an optional comment under a guide, quiz or plan. */
export function InlineFeedback({ kind, refId, question = "Was this useful?" }: { kind: Kind; refId: string; question?: string }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  function rate(r: "up" | "down") {
    setRating(r);
    sendFeedback({ kind, refId, rating: r }).catch(() => {});
  }

  async function submit() {
    await sendFeedback({ kind, refId, rating: rating ?? undefined, comment: comment.trim() }).catch(() => {});
    setSent(true);
  }

  return (
    <div className="card mt-8 p-5 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-medium">{question}</p>
        <div className="flex gap-2">
          {(["up", "down"] as const).map((r) => (
            <button
              key={r}
              onClick={() => rate(r)}
              className={`btn btn-sm ${rating === r ? "border-indigo-500 ring-2 ring-indigo-500/20" : ""}`}
              aria-pressed={rating === r}
            >
              {r === "up" ? "👍 Yes" : "👎 Not really"}
            </button>
          ))}
        </div>
      </div>
      {rating && !sent && (
        <div className="mt-4">
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="input"
            placeholder={rating === "up" ? "What made it useful? (optional)" : "What was off: wrong focus, too long, errors, missing topics…"}
          />
          <button className="btn btn-primary btn-sm mt-2" disabled={!comment.trim()} onClick={submit}>
            Send
          </button>
        </div>
      )}
      {sent && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">Thanks, saved.</p>}
    </div>
  );
}
