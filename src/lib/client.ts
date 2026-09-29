"use client";

import { stripDates } from "./text";
import type { GenerateRequest, StreamEvent } from "./types";

// Browser-side helpers: API calls, streaming, and date/number formatting.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const HEADERS = { "Content-Type": "application/json", "x-clutch": "1" };

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** POST and read newline-delimited JSON events until the stream ends. */
export async function streamEvents(path: string, body: unknown, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const res = await fetch(path, { method: "POST", headers: HEADERS, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
}

// A generation request is handed from the course page to the guide/quiz page.
const PENDING = "clutch:pending";
export const setPending = (req: GenerateRequest) => sessionStorage.setItem(PENDING, JSON.stringify(req));
export const clearPending = () => sessionStorage.removeItem(PENDING);
export function getPending(): GenerateRequest | null {
  try {
    const raw = sessionStorage.getItem(PENDING);
    return raw ? (JSON.parse(raw) as GenerateRequest) : null;
  } catch {
    return null;
  }
}

export function dayKeyOf(item: { dueAt: string | null; dateOnly?: string }): string {
  if (item.dateOnly) return item.dateOnly;
  const d = new Date(item.dueAt ?? Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function keyToDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDay(key: string): string {
  const d = keyToDate(key);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400e3);
  const label = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Tomorrow · ${label}`;
  return label;
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export const fmtShortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function fmtAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return fmtShortDate(iso);
}

export const money = (n: number) => (n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

/** A heading without its dates, so it works as a study topic. */
export const topicFrom = stripDates;
