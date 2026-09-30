"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui";
import { api, ApiError, fmtAgo } from "@/lib/client";
import type { ExtrasSummary } from "@/lib/types";

const fmtSize = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** Course websites, uploaded files and pasted notes for one class. */
export function CourseExtras({
  courseId,
  extras,
  manual,
  onChange,
}: {
  courseId: number;
  extras: ExtrasSummary;
  manual: boolean;
  onChange: () => void;
}) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState(extras.notes);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const hasAny = extras.sites.length > 0 || extras.files.length > 0 || extras.notes.trim().length > 0;

  async function act(label: string, body: object, done?: (r: ExtrasSummary) => string) {
    setBusy(label);
    setMessage(null);
    try {
      const r = await api<ExtrasSummary>(`/api/course/${courseId}/extras`, body);
      if (done) setMessage({ text: done(r), ok: true });
      onChange();
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    await act("site", { action: "addSite", url }, (r) => {
      const s = r.sites[r.sites.length - 1];
      setUrl("");
      return s ? `Read ${s.pages} page${s.pages === 1 ? "" : "s"} and found ${s.dates} date${s.dates === 1 ? "" : "s"}.` : "Added.";
    });
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    setMessage(null);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      const res = await fetch(`/api/course/${courseId}/upload`, { method: "POST", headers: { "x-clutch": "1" }, body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string; skipped?: string[] };
      if (!res.ok) throw new ApiError(res.status, data.error ?? `Upload failed (${res.status})`);
      const skipped = data.skipped ?? [];
      setMessage(
        skipped.length
          ? { text: `Skipped ${skipped.join(", ")}.`, ok: false }
          : { text: `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}. They're in the list below.`, ok: true },
      );
      onChange();
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="card overflow-hidden" open={manual}>
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50">
        <span className="flex-1">
          <span className="font-medium">{manual ? "Add this class's materials" : "Add materials from outside Canvas"}</span>
          <span className="block text-xs muted">A course website, files you downloaded, or a syllabus you paste in. Dates found here go on your dashboard.</span>
        </span>
        {hasAny && (
          <span className="text-xs muted">
            {[extras.sites.length && `${extras.sites.length} site`, extras.files.length && `${extras.files.length} file`, extras.notes.trim() && "notes"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </summary>

      <div className="space-y-6 border-t border-stone-100 p-4 dark:border-stone-800">
        <section>
          <h3 className="text-sm font-semibold">Course website</h3>
          <p className="text-xs muted">Public sites only. For a site you have to log in to, upload the files or paste the schedule below.</p>
          <form onSubmit={addSite} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="extras-url"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://professor-site.edu/course/fall26/"
              disabled={busy !== null}
            />
            <button className="btn shrink-0" disabled={busy !== null || !url.trim()}>
              {busy === "site" ? (
                <>
                  <Spinner /> Reading the site…
                </>
              ) : (
                "Add website"
              )}
            </button>
          </form>
          {extras.sites.length > 0 && (
            <ul className="mt-3 space-y-2">
              {extras.sites.map((s) => (
                <li key={s.url} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {s.title}
                  </a>
                  <span className="text-xs muted">
                    {s.pages} page{s.pages === 1 ? "" : "s"} · {s.files} file{s.files === 1 ? "" : "s"} · {s.dates} date{s.dates === 1 ? "" : "s"} · read{" "}
                    {fmtAgo(s.fetchedAt)}
                  </span>
                  <button
                    className="text-xs link"
                    disabled={busy !== null}
                    onClick={() => act(`refresh-${s.url}`, { action: "refreshSite", url: s.url }, (r) => `Checked the site. ${r.sites.find((x) => x.url === s.url)?.dates ?? 0} dates.`)}
                  >
                    {busy === `refresh-${s.url}` ? "Checking…" : "Check for updates"}
                  </button>
                  <button className="text-xs muted hover:underline" disabled={busy !== null} onClick={() => act("remove", { action: "removeSite", url: s.url })}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Upload files</h3>
          <p className="text-xs muted">PDF, PowerPoint, Word or text. They show up in the list below, ready to study from.</p>
          <label className={`btn mt-2 ${busy ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
            {busy === "upload" ? (
              <>
                <Spinner /> Uploading…
              </>
            ) : (
              "Choose files"
            )}
            <input
              id="extras-files"
              type="file"
              multiple
              accept=".pdf,.pptx,.docx,.txt,.md,.tex"
              className="sr-only"
              onChange={(e) => {
                upload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {extras.files.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm">
              {extras.files.map((f) => (
                <li key={f.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-xs tabular-nums muted">{fmtSize(f.size)}</span>
                  <button className="text-xs muted hover:underline" disabled={busy !== null} onClick={() => act("remove", { action: "removeFile", id: f.id })}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Syllabus or schedule</h3>
          <p className="text-xs muted">Paste the syllabus, schedule or assignment list. The app pulls out exam and due dates and uses the text when studying.</p>
          <textarea
            id="extras-notes"
            rows={5}
            className="input mt-2 font-mono text-xs"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Paste text copied from the course site or syllabus…"
            disabled={busy !== null}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              className="btn btn-sm"
              disabled={busy !== null || notes === extras.notes}
              onClick={() => act("notes", { action: "notes", notes }, (r) => (r.notes ? `Saved. Found ${r.notesDates} date${r.notesDates === 1 ? "" : "s"}.` : "Cleared."))}
            >
              {busy === "notes" ? (
                <>
                  <Spinner /> Reading…
                </>
              ) : (
                "Save"
              )}
            </button>
            {extras.notes && notes === extras.notes && (
              <span className="text-xs muted">
                {extras.notesDates} date{extras.notesDates === 1 ? "" : "s"} found
              </span>
            )}
          </div>
        </section>

        {message && <p className={`text-sm ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>{message.text}</p>}
      </div>
    </details>
  );
}
