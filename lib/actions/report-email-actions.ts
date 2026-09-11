// lib/actions/report-email-actions.ts
"use server";

import type { DateRange } from "@/lib/actions/report-actions";
import { requireStoreScope } from "@/lib/store-context";
import { getCurrentUser } from "@/lib/auth/auth";
import { sendMail } from "@/lib/mailer";
import { APP_NAME } from "@/lib/constants/app";
import { buildExcelExport, buildMultiSheetExcelExport } from "@/lib/excel-export";
import { getReportRows, REPORT_LABELS, ALL_REPORT_TYPES, type ReportType } from "@/lib/report-rows";
import { logger } from "@/lib/logger";

export type ReportEmailActionState = {
  success: boolean;
  message: string;
};

/**
 * "Email this report" — for a report too slow/heavy to comfortably wait on
 * in the browser (Item Ledger and Gold Flow especially: unbounded,
 * deeply-joined queries with no pagination), delivers the same data as an
 * Excel attachment instead, via the same mailer every other automated
 * report already uses. Mailed to the signed-in user themselves, not the
 * Reports & Notifications recipient list — this is "send me what I'm
 * looking at right now", a different intent from that scheduled digest.
 */
export async function emailReportToMe(type: ReportType, range: DateRange): Promise<ReportEmailActionState> {
  try {
    await requireStoreScope();
    const user = await getCurrentUser();
    if (!user?.email) {
      return { success: false, message: "Your account has no email on file." };
    }

    const label = REPORT_LABELS[type];
    const rows = await getReportRows(type, range);
    const { fileName, fileBase64 } = buildExcelExport(rows, label, `report-${type}`);

    const result = await sendMail({
      to: user.email,
      subject: `${label} report — ${APP_NAME}`,
      html: `<p>Your <strong>${label}</strong> report is attached as an Excel file.</p>`,
      text: `Your ${label} report is attached.`,
      attachments: [
        {
          filename: fileName,
          contentBase64: fileBase64,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    if (!result.sent) {
      return { success: false, message: result.message };
    }

    return { success: true, message: `${label} report emailed to ${user.email}.` };
  } catch (error) {
    logger.error("emailReportToMe failed", error, { type });
    return { success: false, message: "Could not email this report." };
  }
}

/**
 * Used by the Reports page's loading state — the page itself runs all 9
 * reports in parallel on every load (app/(dashboard)/reports/page.tsx), so
 * if that's taking a while there's no single "active tab" to know which
 * one to send. Sends every report as one multi-sheet workbook instead.
 */
export async function emailAllReportsToMe(range: DateRange): Promise<ReportEmailActionState> {
  try {
    await requireStoreScope();
    const user = await getCurrentUser();
    if (!user?.email) {
      return { success: false, message: "Your account has no email on file." };
    }

    const sheets = await Promise.all(
      ALL_REPORT_TYPES.map(async (type) => ({
        name: REPORT_LABELS[type],
        rows: await getReportRows(type, range),
      })),
    );

    const { fileName, fileBase64 } = buildMultiSheetExcelExport(sheets, "reports");

    const result = await sendMail({
      to: user.email,
      subject: `Your reports — ${APP_NAME}`,
      html: `<p>All ${ALL_REPORT_TYPES.length} reports are attached, one sheet each.</p>`,
      text: `All ${ALL_REPORT_TYPES.length} reports are attached, one sheet each.`,
      attachments: [
        {
          filename: fileName,
          contentBase64: fileBase64,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    if (!result.sent) {
      return { success: false, message: result.message };
    }

    return { success: true, message: `All reports emailed to ${user.email}.` };
  } catch (error) {
    logger.error("emailAllReportsToMe failed", error);
    return { success: false, message: "Could not email your reports." };
  }
}
