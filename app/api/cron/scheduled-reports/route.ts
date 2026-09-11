// app/api/cron/scheduled-reports/route.ts

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { APP_NAME } from "@/lib/constants/app";
import { scheduledReportEmail } from "@/lib/email-templates";
import {
  buildPeriodReport,
  buildPeriodReportWorkbook,
  dueWindowForFrequency,
  FREQUENCY_LABELS,
  LAST_SENT_FIELD,
} from "@/lib/report-builder";
import { logger } from "@/lib/logger";

/**
 * Replaces the old daily-only `/api/cron/daily-report` — one email per
 * store per *enabled* frequency (Daily/Monthly/Quarterly/Annual — a store
 * can have several checked at once, per its own Reports & Notifications
 * settings), sent to the recipients it configured, when that frequency's
 * period is due.
 *
 * Runs once a day (see vercel.json) just after midnight IST (19:00 UTC) —
 * dueWindowForFrequency decides per store+frequency whether *today* is
 * actually due (always true for DAILY; only the 1st of the
 * month/quarter/year for the others).
 */

/** Building a workbook per store/frequency takes longer than the default budget. */
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

    const now = new Date();

    // Archived stores are skipped: nobody can sign in to act on the figures,
    // and a shop that has been shut down should not keep mailing its owner.
    // Only stores that opted in (reportSettings.enabled) are considered at
    // all — unlike the old daily-report cron, this is never unconditional.
    const stores = await prisma.store.findMany({
      where: { isActive: true, reportSettings: { enabled: true } },
      select: {
        id: true,
        name: true,
        reportSettings: {
          select: {
            frequencies: true,
            recipientEmails: true,
            dailyLastSentAt: true,
            monthlyLastSentAt: true,
            quarterlyLastSentAt: true,
            annualLastSentAt: true,
          },
        },
      },
    });

    let sent = 0;
    let skippedNotDue = 0;
    let skippedAlreadySent = 0;
    let skippedNoRecipient = 0;
    let skippedNoActivity = 0;
    const failures: string[] = [];

    for (const store of stores) {
      const settings = store.reportSettings;
      if (!settings) continue; // filtered by the query's `where` above; keeps TS honest.

      const recipients = [...new Set(settings.recipientEmails)];

      for (const frequency of settings.frequencies) {
        const label = `${store.name} (${FREQUENCY_LABELS[frequency]})`;

        try {
          const window = dueWindowForFrequency(frequency, now);
          if (!window) {
            skippedNotDue += 1;
            continue;
          }

          const lastSentField = LAST_SENT_FIELD[frequency];
          const lastSentAt = settings[lastSentField];

          // Guards against double-sending the same period — the same gate a
          // manual "Generate & Email Now" click updates too, so an earlier
          // manual send today stops this run from repeating it.
          if (lastSentAt && lastSentAt >= window.start) {
            skippedAlreadySent += 1;
            continue;
          }

          if (recipients.length === 0) {
            skippedNoRecipient += 1;
            continue;
          }

          const report = await buildPeriodReport(store.id, store.name, window);

          // Nothing traded, nothing to report. A shop that was shut that
          // period should not get an email saying so — an empty report every
          // cycle is how a useful report becomes one nobody opens.
          if (report.isEmpty) {
            skippedNoActivity += 1;
            continue;
          }

          const workbook = buildPeriodReportWorkbook(report, frequency);

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

          const mail = scheduledReportEmail({
            storeName: store.name,
            appName: APP_NAME,
            frequencyLabel: FREQUENCY_LABELS[frequency],
            periodLabel: window.label,
            fileName: workbook.fileName,
            sections,
            netPosition: report.sale.total - report.purchase.total,
          });

          const result = await sendMail({
            to: recipients.join(", "),
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

          if (result.sent) {
            sent += 1;
            await prisma.reportSettings.update({
              where: { storeId: store.id },
              data: { [lastSentField]: now },
            });
          } else {
            failures.push(`${label}: ${result.message}`);
          }
        } catch (error) {
          // One store/frequency's failure must not stop the rest of the run
          // — the next one is still waiting on its report.
          logger.error("scheduled-report failed", error, { storeName: store.name, frequency });
          failures.push(
            `${label}: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      storesConsidered: stores.length,
      sent,
      skippedNotDue,
      skippedAlreadySent,
      skippedNoRecipient,
      skippedNoActivity,
      failures,
    });
  } catch (error) {
    logger.error("scheduled-reports cron error", error);
    return NextResponse.json(
      { error: "Failed to send scheduled reports" },
      { status: 500 },
    );
  }
}
