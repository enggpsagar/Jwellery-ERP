// lib/logger.ts
// Server-only — @logtail/node shells out to Node's http/https modules, so
// this must never be imported from a "use client" file (e.g.
// app/(dashboard)/error.tsx's error boundary keeps plain console.error for
// that reason).
import "server-only";
import { Logtail } from "@logtail/node";

type LogContext = Record<string, unknown>;

const sourceToken = process.env.BETTER_STACK_SOURCE_TOKEN;

// Undefined until BETTER_STACK_SOURCE_TOKEN is set in the environment — every
// call below falls back to plain console output until then, so nothing here
// depends on Better Stack actually being configured yet.
const client = sourceToken ? new Logtail(sourceToken) : null;

function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

async function send(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  if (!client) {
    const log = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    log(message, context ?? "");
    return;
  }

  try {
    await client[level](message, context);
    // A Vercel function instance can freeze or exit right after the
    // response is sent — flush forces this log out over the wire now
    // instead of risking it being dropped along with the batch.
    await client.flush();
  } catch (shippingError) {
    console.error("logger: failed to ship log to Better Stack", shippingError);
    console.error(message, context ?? "");
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
