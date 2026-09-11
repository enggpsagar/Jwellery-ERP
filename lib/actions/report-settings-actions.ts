// lib/actions/report-settings-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { ReportFrequency } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireStoreScope } from "@/lib/store-context";
import { sendMail } from "@/lib/mailer";
import { APP_NAME } from "@/lib/constants/app";
import { scheduledReportEmail } from "@/lib/email-templates";
import {
  buildPeriodReport,
  buildPeriodReportWorkbook,
  currentWindowForFrequency,
  FREQUENCY_LABELS,
  LAST_SENT_FIELD,
} from "@/lib/report-builder";
import { logger } from "@/lib/logger";

export type ReportSettingsData = {
  enabled: boolean;
  frequencies: ReportFrequency[];
  recipientEmails: string[];
  lastSentAt: Partial<Record<ReportFrequency, string | null>>;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Settings > Reports & Notifications' initial load — defaults for a store that hasn't configured this yet, rather than requiring a row to exist first. */
export async function getReportSettings(): Promise<ReportSettingsData> {
  const storeId = await requireStoreScope();

  const settings = await prisma.reportSettings.findUnique({
    where: { storeId },
    select: {
      enabled: true,
      frequencies: true,
      recipientEmails: true,
      dailyLastSentAt: true,
      monthlyLastSentAt: true,
      quarterlyLastSentAt: true,
      annualLastSentAt: true,
    },
  });

  return {
    enabled: settings?.enabled ?? false,
    frequencies: settings?.frequencies ?? [],
    recipientEmails: settings?.recipientEmails ?? [],
    lastSentAt: {
      [ReportFrequency.DAILY]: settings?.dailyLastSentAt?.toISOString() ?? null,
      [ReportFrequency.MONTHLY]: settings?.monthlyLastSentAt?.toISOString() ?? null,
      [ReportFrequency.QUARTERLY]: settings?.quarterlyLastSentAt?.toISOString() ?? null,
      [ReportFrequency.ANNUAL]: settings?.annualLastSentAt?.toISOString() ?? null,
    },
  };
}

export type ReportSettingsActionState = {
  success: boolean;
  message: string;
};

export async function updateReportSettings(input: {
  enabled: boolean;
  frequencies: ReportFrequency[];
  recipientEmails: string[];
}): Promise<ReportSettingsActionState> {
  try {
    const storeId = await requireStoreScope();

    const recipientEmails = [
      ...new Set(input.recipientEmails.map((email) => email.trim()).filter(Boolean)),
    ];

    const invalid = recipientEmails.filter((email) => !EMAIL_PATTERN.test(email));
    if (invalid.length > 0) {
      return { success: false, message: `Not a valid email address: ${invalid.join(", ")}` };
    }

    const frequencies = [...new Set(input.frequencies)];

    await prisma.reportSettings.upsert({
      where: { storeId },
      create: { storeId, enabled: input.enabled, frequencies, recipientEmails },
      update: { enabled: input.enabled, frequencies, recipientEmails },
    });

    revalidatePath("/settings/reports");
    return { success: true, message: "Report settings saved." };
  } catch (error) {
    logger.error("updateReportSettings failed", error);
    return { success: false, message: "Could not save report settings." };
  }
}

/**
 * "Generate & Email Now" — sends one email per currently-enabled frequency
 * (a store may have several checked at once), each covering its own most
 * recently completed period. Unlike the scheduled cron, this always sends
 * even when a period turned out empty: a merchant clicking this button is
 * deliberately asking for a report right now, not receiving an unsolicited
 * check-in that should stay quiet when there's nothing to say. Still
 * updates each frequency's own lastSentAt on success, so the automatic
 * cron won't re-send the same period again later.
 */
export async function generateAndSendReportNow(): Promise<ReportSettingsActionState> {
  try {
    const storeId = await requireStoreScope();

    const [store, settings] = await Promise.all([
      prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } }),
      prisma.reportSettings.findUnique({
        where: { storeId },
        select: { frequencies: true, recipientEmails: true },
      }),
    ]);

    const recipients = [...new Set(settings?.recipientEmails ?? [])];
    if (recipients.length === 0) {
      return { success: false, message: "Add at least one recipient email first." };
    }

    const frequencies = settings?.frequencies ?? [];
    if (frequencies.length === 0) {
      return { success: false, message: "Select at least one report frequency first." };
    }

    const sentLabels: string[] = [];
    const failures: string[] = [];

    for (const frequency of frequencies) {
      try {
        const window = currentWindowForFrequency(frequency);
        const report = await buildPeriodReport(storeId, store.name, window);
        const workbook = buildPeriodReportWorkbook(report, frequency);

        const sections = [report.credit, report.debit, report.sale, report.purchase].map((section) => ({
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
              contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ],
        });

        if (result.sent) {
          await prisma.reportSettings.update({
            where: { storeId },
            data: { [LAST_SENT_FIELD[frequency]]: new Date() },
          });
          sentLabels.push(FREQUENCY_LABELS[frequency]);
        } else {
          failures.push(`${FREQUENCY_LABELS[frequency]}: ${result.message}`);
        }
      } catch (error) {
        logger.error("generateAndSendReportNow failed for frequency", error, { frequency });
        failures.push(`${FREQUENCY_LABELS[frequency]}: could not generate this report`);
      }
    }

    revalidatePath("/settings/reports");

    if (sentLabels.length === 0) {
      return { success: false, message: failures.join("; ") || "Could not generate and send the report." };
    }

    const summary = `${sentLabels.join(", ")} report${sentLabels.length === 1 ? "" : "s"} emailed to ${recipients.join(", ")}.`;
    return {
      success: true,
      message: failures.length > 0 ? `${summary} Failed: ${failures.join("; ")}` : summary,
    };
  } catch (error) {
    logger.error("generateAndSendReportNow failed", error);
    return { success: false, message: "Could not generate and send the report." };
  }
}
