// instrumentation.ts
// A safety net underneath every explicit `logger.error(...)` call already
// added to server actions and API routes. Those only fire where a
// try/catch already existed; the two hooks below catch everything else on
// the server side:
//
// - `onRequestError`: any error Next.js itself catches (a Server Component
//   render throwing, a Route Handler or Server Action throwing with no
//   try/catch of its own) — across both the Node runtime and Edge
//   (middleware). `lib/logger.ts` ships via plain `fetch`, so it works in
//   both runtimes with no branching needed here.
// - `register()`'s process handlers: truly unhandled promise rejections or
//   uncaught exceptions that occur outside Next's own request lifecycle
//   entirely (e.g. a fire-and-forget async call with no `.catch()`) — Node
//   runtime only, since `process` isn't meaningful on Edge.
//
// Client-side errors (a React render error in the browser, an unhandled
// `window` error) are a separate path — see lib/report-client-error.ts,
// app/(dashboard)/error.tsx, and app/global-error.tsx.
import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

export async function register() {
  // `process` isn't meaningful on the Edge runtime (middleware) — only
  // register these on Node, where a truly fire-and-forget rejection could
  // otherwise vanish with no trace at all.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", reason);
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", err);
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await logger.error("Unhandled server error", error, {
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
};
