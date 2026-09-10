// app/api/log-client-error/route.ts
//
// The server-side landing spot for browser-caught errors — a React error
// boundary (app/(dashboard)/error.tsx, app/global-error.tsx) can't import
// lib/logger.ts directly (it's server-only, and shipping the log itself
// needs BETTER_STACK_SOURCE_TOKEN, which must never reach the browser), so
// it POSTs here instead and this route calls the real logger. Deliberately
// unauthenticated — an error can happen before a session exists (e.g. on
// the login page) — so treat the body as untrusted: cap every field's
// length before logging it, rather than trusting the client to behave.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { logger } from "@/lib/logger";
import { authOptions } from "@/lib/auth/auth-options";

const MAX_FIELD_LENGTH = 2000;

function truncate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > MAX_FIELD_LENGTH ? `${value.slice(0, MAX_FIELD_LENGTH)}…` : value;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const session = await getServerSession(authOptions);

    await logger.error("Unhandled client error", undefined, {
      message: truncate(body?.message) ?? "(no message)",
      stack: truncate(body?.stack),
      digest: truncate(body?.digest),
      path: truncate(body?.path),
      userAgent: truncate(request.headers.get("user-agent")),
      userId: session?.user?.id,
    });
  } catch (error) {
    // A malformed report (bad JSON, etc.) is still worth a server-side
    // trace — just don't let it throw back at the client error boundary
    // that's already mid-failure.
    logger.error("log-client-error: failed to process report", error);
  }

  // Always 204 — this endpoint's job is "don't make the client's error
  // handling depend on us," not to report success/failure back.
  return new NextResponse(null, { status: 204 });
}
