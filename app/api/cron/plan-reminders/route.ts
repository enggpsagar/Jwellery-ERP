// app/api/cron/plan-reminders/route.ts

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveStoreName } from "@/lib/invite-email";
import { sendMail } from "@/lib/mailer";
import { planExpiringReminderEmail } from "@/lib/email-templates";

const REMINDER_WINDOW_DAYS = 7;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // planReminderSentAt: null gates this to "once per plan cycle" — it's
    // cleared by assignPlanToStore whenever a plan is (re)assigned, so a
    // renewal re-enters the window instead of being silently skipped.
    const stores = await prisma.store.findMany({
      where: {
        planExpiresAt: { gte: now, lte: windowEnd },
        planReminderSentAt: null,
      },
      select: {
        id: true,
        planExpiresAt: true,
        plan: { select: { name: true } },
      },
    });

    let remindersSent = 0;

    for (const store of stores) {
      if (!store.planExpiresAt || !store.plan) continue;

      const storeName = await resolveStoreName(store.id);
      const admins = await prisma.user.findMany({
        where: { storeId: store.id, role: UserRole.ADMIN, isActive: true },
        select: { name: true, email: true },
      });

      const daysRemaining = Math.ceil(
        (store.planExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );

      for (const admin of admins) {
        if (!admin.email) continue;

        const { subject, html } = planExpiringReminderEmail({
          name: admin.name || "there",
          storeName,
          planName: store.plan.name,
          expiresAt: store.planExpiresAt,
          daysRemaining,
        });

        await sendMail({ to: admin.email, subject, html });
      }

      await prisma.store.update({
        where: { id: store.id },
        data: { planReminderSentAt: now },
      });

      remindersSent += 1;
    }

    return NextResponse.json({
      success: true,
      message: "Plan renewal reminders processed",
      storesReminded: remindersSent,
    });
  } catch (error: any) {
    console.error("Plan reminder cron error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unknown error",
        stack: process.env.NODE_ENV !== "production" ? error?.stack : undefined,
      },
      { status: 500 },
    );
  }
}
