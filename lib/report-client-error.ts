// lib/report-client-error.ts
// Client-safe (no "server-only" import, no secrets) — the browser half of
// the client-error logging path. Ships a caught error to
// /api/log-client-error, which is the only thing allowed to call the real
// logger, since that needs BETTER_STACK_SOURCE_TOKEN.
"use client";

export function reportClientError(error: Error & { digest?: string }) {
  try {
    // fetch, not sendBeacon: this fires from an error boundary's useEffect
    // (the page is still mounted, just showing a fallback), not on
    // unload, so there's no need for sendBeacon's fire-and-forget guarantee.
    void fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
      keepalive: true,
    }).catch(() => {
      // The error boundary is already showing a fallback UI — a failed
      // report shouldn't compound that with a second visible failure.
    });
  } catch {
    // Same reasoning — swallow synchronous failures (e.g. fetch unavailable)
    // too.
  }
}
