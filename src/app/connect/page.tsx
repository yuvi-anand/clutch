"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorBox, PageLoading, Spinner } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { api } from "@/lib/client";
import type { Status } from "@/lib/types";

type ConnectResult = { errors: Record<string, string>; canvasUser?: string; aiOk?: boolean; status: Status };

function originOf(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.includes(".") ? u.origin : null;
  } catch {
    return null;
  }
}

const OK = "chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200";

export default function ConnectPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [modelTouched, setModelTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Status>("/api/status")
      .then((s) => {
        setStatus(s);
        setBaseUrl(s.canvasBaseUrl ?? "");
        setModel(s.model);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    setError(null);
    try {
      const r = await api<ConnectResult>("/api/connect", {
        canvasBaseUrl: baseUrl.trim() || undefined,
        canvasToken: token.trim() || undefined,
        anthropicApiKey: apiKey.trim() || undefined,
        model: modelTouched ? model : undefined,
      });
      setResult(r);
      setStatus(r.status);
      setModel(r.status.model);
      setModelTouched(false);
      if (!r.errors.canvas) setToken("");
      if (!r.errors.ai) setApiKey("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(which: "canvas" | "ai") {
    const r = await api<ConnectResult>("/api/connect", { clear: which });
    setStatus(r.status);
    setResult(null);
  }

  if (!status) return error ? <ErrorBox message={error} /> : <PageLoading label="Loading…" />;
  const origin = originOf(baseUrl);
  const ready = status.canvasConnected && status.aiConfigured;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Connect your accounts</h1>
      <p className="mt-2 muted">{APP_NAME} needs read access to your Canvas, plus an API key for the AI that writes your guides. Both stay on this computer.</p>

      <form onSubmit={save} className="mt-8 space-y-6">
        <section className="card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">1. Canvas</h2>
            {status.canvasConnected && <span className={OK}>Connected</span>}
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-medium">Canvas address</span>
            <input
              className="input mt-1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://yourschool.instructure.com"
              autoComplete="url"
            />
          </label>
          <p className="mt-1 text-xs muted">
            Northeastern:{" "}
            <button type="button" className="link" onClick={() => setBaseUrl("https://northeastern.instructure.com")}>
              northeastern.instructure.com
            </button>
            . Anywhere else, copy the address from your browser while you&apos;re on Canvas.
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-medium">Access token</span>
            <input
              type="password"
              autoComplete="off"
              className="input mt-1 font-mono"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={status.canvasConnected ? "Saved. Paste a new token to replace it" : "Paste your token here"}
            />
          </label>
          <details className="mt-3 rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-800/50" open={!status.canvasConnected}>
            <summary className="cursor-pointer font-medium">How to make a token (1 minute)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 muted">
              <li>
                Open{" "}
                {origin ? (
                  <a className="link" href={`${origin}/profile/settings`} target="_blank" rel="noreferrer">
                    Canvas → Account → Settings ↗
                  </a>
                ) : (
                  "Canvas → Account → Settings"
                )}
                .
              </li>
              <li>
                Scroll to <b>Approved Integrations</b> and click <b>+ New Access Token</b>.
              </li>
              <li>For the purpose, type “{APP_NAME}”. Set the expiry to the end of the semester, or leave it blank.</li>
              <li>
                Click <b>Generate Token</b>, copy it (Canvas only shows it once), and paste it above.
              </li>
            </ol>
          </details>
          {status.canvasFromEnv && <p className="mt-2 text-xs muted">Using CANVAS_TOKEN from .env.local.</p>}
          {result?.canvasUser && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">✓ Connected as {result.canvasUser}</p>}
          {result?.errors.canvas && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{result.errors.canvas}</p>}
          {status.canvasConnected && !status.canvasFromEnv && (
            <button type="button" onClick={() => disconnect("canvas")} className="mt-3 text-xs muted hover:underline">
              Remove the saved token
            </button>
          )}
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">2. AI model</h2>
            {status.engine === "command" ? (
              <span className={OK}>Using local AI command</span>
            ) : (
              status.aiConfigured && <span className={OK}>Key saved</span>
            )}
          </div>
          {status.engine === "command" && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Guides, quizzes and plans run through the local AI command in your config, so no API key or credits are needed. An API key
              is only used if you remove that command.
            </p>
          )}
          <label className="mt-4 block">
            <span className="text-sm font-medium">Anthropic API key</span>
            <input
              type="password"
              autoComplete="off"
              className="input mt-1 font-mono"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status.aiConfigured ? "Saved. Paste a new key to replace it" : "sk-ant-…"}
            />
          </label>
          <p className="mt-1 text-xs muted">
            Create one at{" "}
            <a className="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              console.anthropic.com ↗
            </a>
            . The account also needs prepaid credits (Plans & Billing), or requests are refused. A study guide usually costs $0.20–$0.50, depending on how much material you pick.
          </p>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Model</legend>
            {status.models.length === 0 && (
              <p className="mt-1 text-xs muted">Save a working key and the available models show up here. The newest top-tier model is used by default.</p>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {status.models.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${
                    model === m.id ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-stone-300 dark:border-stone-700"
                  }`}
                >
                  <input type="radio" name="model" value={m.id} checked={model === m.id} onChange={() => { setModel(m.id); setModelTouched(true); }} className="mt-0.5 accent-indigo-600" />
                  <span>
                    <span className="font-medium">{m.label}</span>
                    <span className="block text-xs muted">{m.note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {status.aiFromEnv && <p className="mt-2 text-xs muted">Using ANTHROPIC_API_KEY from .env.local.</p>}
          {result?.aiOk && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">✓ The API key works</p>}
          {result?.errors.ai && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{result.errors.ai}</p>}
          {status.aiConfigured && !status.aiFromEnv && (
            <button type="button" onClick={() => disconnect("ai")} className="mt-3 text-xs muted hover:underline">
              Remove the saved key
            </button>
          )}
        </section>

        {error && <ErrorBox message={error} />}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? (
              <>
                <Spinner /> Checking…
              </>
            ) : (
              "Save and test"
            )}
          </button>
          {ready && (
            <Link href="/" className="btn">
              Go to the dashboard →
            </Link>
          )}
        </div>
        <p className="text-xs muted">
          🔒 Your token and key are saved only on this computer, in <code>data/config.json</code>. The app runs at 127.0.0.1 and only
          talks to your Canvas and the Anthropic API. The token can read everything you can see in Canvas, so keep that file private.
        </p>
      </form>
    </div>
  );
}
