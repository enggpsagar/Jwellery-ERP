// app/api/cron/daily-report/route.ts

import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { APP_NAME } from "@/lib/constants/app";
import { dailyReportEmail } from "@/lib/email-templates";
import {
  buildDailyReport,
  buildDailyReportWorkbook,
  previousIstDay,
} from "@/lib/daily-report";

/**
 * Yesterday's trading, mailed to each store's owners.
 *
 * Scheduled just after midnight IST (19:00 UTC) so "yesterday" is the
 * business day that has just finished — see `previousIstDay`, which does not
 * rely on the server's own timezone.
 */

/** Building a workbook per store takes longer than the default budget. */
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const day = previousIstDay();

    // Archived stores are skipped: nobody can sign in to act on the figures,
    // and a shop that has been shut down should not keep mailing its owner.
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        // Where this store already asked for its records to be sent; it
        // lives on BusinessSettings rather than on Store itself.
        businessSettings: { select: { backupEmail: true } },
      },
    });

    let sent = 0;
    let skipped = 0;
    let quiet = 0;
    const failures: string[] = [];

    for (const store of stores) {
      try {
        const owners = await prisma.user.findMany({
          where: {
            storeId: store.id,
            role: UserRole.ADMIN,
            isActive: true,
            email: { not: null },
          },
          select: { email: true },
        });

        // The backup address is included when set — it is where this store
        // already asked for its records to go.
        const recipients = [
          ...owners.map((owner) => owner.email),
          store.businessSettings?.backupEmail ?? null,
        ].filter((email): email is string => Boolean(email));

        const unique = [...new Set(recipients)];

        if (unique.length === 0) {
          skipped += 1;
          continue;
        }

        const report = await buildDailyReport(store.id, store.name, day);

        // Nothing traded, nothing to report. A shop that was shut that day
        // should not get an email saying so — four empty totals every
        // morning is how a useful report becomes one nobody opens.
        if (report.isEmpty) {
          quiet += 1;
          continue;
        }

        const workbook = buildDailyReportWorkbook(report);

        const sections = [
          report.credit,
          report.debit,
          report.sale,
          report.purchase,
        ].map((section) => ({
          title: section.title,
          count: section.count,
          total: section.total,
        }));

        const mail = dailyReportEmail({
          storeName: store.name,
          appName: APP_NAME,
          dayLabel: day.label,
          fileName: workbook.fileName,
          sections,
          netPosition: report.sale.total - report.purchase.total,
        });

        const result = await sendMail({
          to: unique.join(", "),
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          attachments: [
            {
              filename: workbook.fileName,
              contentBase64: workbook.fileBase64,
              contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ],
        });

        if (result.sent) sent += 1;
        else failures.push(`${store.name}: ${result.message}`);
      } catch (error) {
        // One store's failure must not stop the rest of the run — the next
        // store's owner is still waiting on their morning summary.
        console.error(`daily-report failed for ${store.name}:`, error);
        failures.push(
          `${store.name}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      date: day.label,
      storesConsidered: stores.length,
      sent,
      skippedNoRecipient: skipped,
      skippedNoActivity: quiet,
      failures,
    });
  } catch (error) {
    console.error("daily-report cron error:", error);
    return NextResponse.json(
      { error: "Failed to send daily reports" },
      { status: 500 },
    );
  }
}
