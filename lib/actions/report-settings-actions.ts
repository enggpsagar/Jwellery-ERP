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
} from "@/lib/report-builder";
import { logger } from "@/lib/logger";

export type ReportSettingsData = {
  enabled: boolean;
  frequency: ReportFrequency;
  recipientEmails: string[];
  lastSentAt: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Settings > Reports & Notifications' initial load — defaults for a store that hasn't configured this yet, rather than requiring a row to exist first. */
export async function getReportSettings(): Promise<ReportSettingsData> {
  const storeId = await requireStoreScope();

  const settings = await prisma.reportSettings.findUnique({
    where: { storeId },
    select: { enabled: true, frequency: true, recipientEmails: true, lastSentAt: true },
  });

  return {
    enabled: settings?.enabled ?? false,
    frequency: settings?.frequency ?? ReportFrequency.DAILY,
    recipientEmails: settings?.recipientEmails ?? [],
    lastSentAt: settings?.lastSentAt?.toISOString() ?? null,
  };
}

export type ReportSettingsActionState = {
  success: boolean;
  message: string;
};

export async function updateReportSettings(input: {
  enabled: boolean;
  frequency: ReportFrequency;
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

    await prisma.reportSettings.upsert({
      where: { storeId },
      create: { storeId, enabled: input.enabled, frequency: input.frequency, recipientEmails },
      update: { enabled: input.enabled, frequency: input.frequency, recipientEmails },
    });

    revalidatePath("/settings/reports");
    return { success: true, message: "Report settings saved." };
  } catch (error) {
    logger.error("updateReportSettings failed", error);
    return { success: false, message: "Could not save report settings." };
  }
}

/**
 * "Generate & Email Now" — unlike the scheduled cron, this always sends
 * even when the period turned out empty: a merchant clicking this button is
 * deliberately asking for a report right now, not receiving an unsolicited
 * daily/monthly check-in that should stay quiet when there's nothing to say.
 * Still updates lastSentAt on success, so the automatic cron won't re-send
 * the same period again later.
 */
export async function generateAndSendReportNow(): Promise<ReportSettingsActionState> {
  try {
    const storeId = await requireStoreScope();

    const [store, settings] = await Promise.all([
      prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } }),
      prisma.reportSettings.findUnique({
        where: { storeId },
        select: { frequency: true, recipientEmails: true },
      }),
    ]);

    const recipients = [...new Set(settings?.recipientEmails ?? [])];
    if (recipients.length === 0) {
      return { success: false, message: "Add at least one recipient email first." };
    }

    const frequency = settings?.frequency ?? ReportFrequency.DAILY;
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

    if (!result.sent) {
      return { success: false, message: result.message };
    }

    await prisma.reportSettings.update({ where: { storeId }, data: { lastSentAt: new Date() } });
    revalidatePath("/settings/reports");
    return { success: true, message: `Report emailed to ${recipients.join(", ")}.` };
  } catch (error) {
    logger.error("generateAndSendReportNow failed", error);
    return { success: false, message: "Could not generate and send the report." };
  }
}
