import Anthropic from "@anthropic-ai/sdk";
import { CanvasError } from "./canvas";
import type { StreamEvent } from "./types";

// The app holds a Canvas token and an API key, so the API only answers the
// browser on this machine: the Host must be local (blocks DNS rebinding) and
// writes need a custom header (forces a CORS preflight other sites can't pass).
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function guard(req: Request): Response | null {
  if (!LOCAL.test(req.headers.get("host") ?? "")) return new Response("Forbidden", { status: 403 });
  if (req.method !== "GET") {
    if (req.headers.get("x-clutch") !== "1") return new Response("Forbidden", { status: 403 });
    const origin = req.headers.get("origin");
    if (origin && !LOCAL.test(new URL(origin).host)) return new Response("Forbidden", { status: 403 });
  }
  return null;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The Anthropic API rejected your key. Check it on the Connect page.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Your Anthropic API key doesn't have access to that model.";
  if (e instanceof Anthropic.RateLimitError) return "Hit the API rate limit. Wait a minute and try again.";
  if (e instanceof Anthropic.BadRequestError) return `The AI service couldn't take this request: ${e.message}`;
  if (e instanceof Anthropic.InternalServerError) return "The AI service is overloaded or having trouble right now. Try again in a minute.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `AI service error ${e.status}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function jsonError(e: unknown): Response {
  const status = e instanceof CanvasError ? (e.status >= 400 && e.status < 600 ? e.status : 502) : 500;
  if (!(e instanceof CanvasError)) console.error(e);
  return Response.json({ error: errorMessage(e) }, { status });
}

/**
 * Stream newline-delimited JSON events to the browser. If the browser goes
 * away, `signal` aborts so the model request stops too (no wasted spend).
 */
export function ndjson(
  req: Request,
  run: (send: (e: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const ac = new AbortController();
  req.signal?.addEventListener("abort", () => ac.abort());
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => {
        if (ac.signal.aborted) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          // The browser disconnected.
        }
      };
      try {
        await run(send, ac.signal);
      } catch (e) {
        if (!ac.signal.aborted) {
          console.error(e);
          send({ t: "error", message: errorMessage(e) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      ac.abort();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
