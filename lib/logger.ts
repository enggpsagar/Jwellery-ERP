// lib/logger.ts
// Server-only — never import this from a "use client" file. It reads
// BETTER_STACK_SOURCE_TOKEN, and Next only strips env vars from the client
// bundle when they're not NEXT_PUBLIC_-prefixed; importing this from client
// code wouldn't leak the token today, but "server-only" makes that
// invariant load-bearing instead of accidental.
//
// Ships via a plain `fetch` POST to Better Stack's HTTP log-ingestion API
// (https://betterstack.com/docs/logs/http-rest-api/) rather than the
// @logtail/node SDK — that SDK batches internally and only ships on flush,
// which is a real risk on Vercel's serverless functions (an instance can
// freeze right after the response is sent, before a batch flushes) and it
// depends on Node's http/https modules, so it can't run on the Edge
// runtime at all. A single awaited fetch has neither problem: it resolves
// only once the log has actually been sent, and it works identically in a
// Node serverless function, Edge middleware, or instrumentation.ts's
// non-Node runtime branch.
import "server-only";

type LogContext = Record<string, unknown>;

const sourceToken = process.env.BETTER_STACK_SOURCE_TOKEN;
const ingestingHost = process.env.BETTER_STACK_INGESTING_HOST;

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

function fallbackToConsole(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  const log = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  log(message, context ?? "");
}

async function send(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  if (!sourceToken || !ingestingHost) {
    fallbackToConsole(level, message, context);
    return;
  }

  try {
    const response = await fetch(`https://${ingestingHost}/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sourceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dt: new Date().toISOString(), level, message, ...context }),
    });

    if (!response.ok) {
      console.error(`logger: Better Stack ingest responded ${response.status}`);
      fallbackToConsole(level, message, context);
    }
  } catch (shippingError) {
    console.error("logger: failed to ship log to Better Stack", shippingError);
    fallbackToConsole(level, message, context);
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => send("info", message, context),
  warn: (message: string, context?: LogContext) => send("warn", message, context),
  /**
   * `error` is a positional convenience param (the caught error/rejection),
   * kept separate from `context` since it's what nearly every call site
   * actually has — `logger.error("addVendor error", error)` is a drop-in
   * replacement for the old `console.error("addVendor error:", error)`.
   */
  error: (message: string, error?: unknown, context?: LogContext) =>
    send("error", message, {
      ...(error !== undefined ? { error: serializeError(error) } : {}),
      ...context,
    }),
};
