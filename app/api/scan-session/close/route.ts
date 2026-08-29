// app/api/scan-session/close/route.ts

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/auth";

/**
 * Closes a scanning session when the billing tab goes away.
 *
 * A route rather than a server action because it is called from
 * `navigator.sendBeacon`, which fires during page teardown and can only send
 * a plain POST. Scoped to the signed-in user, so the id in the body cannot
 * close somebody else's session.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return NextResponse.json({ ok: false }, { status: 401 });

    const sessionId = (await request.text()).trim();
    if (!sessionId) return NextResponse.json({ ok: false }, { status: 400 });

    await prisma.scanSession.updateMany({
      where: { id: sessionId, userId: user.id },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Best effort by nature: the session expires on its own regardless.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
