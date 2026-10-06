// lib/report-frequencies.ts
// Client-safe report-frequency constants. Lives apart from lib/report-builder
// (which imports lib/prisma) so the settings form can use them without
// pulling the Postgres driver into the browser bundle.
import { ReportFrequency } from "@prisma/client";

export const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  [ReportFrequency.DAILY]: "Daily",
  [ReportFrequency.MONTHLY]: "Monthly",
  [ReportFrequency.QUARTERLY]: "Quarterly",
  [ReportFrequency.ANNUAL]: "Annual",
};

/** Every frequency, in the fixed display order used across the settings
 *  form and email/report content. */
export const ALL_FREQUENCIES: ReportFrequency[] = [
  ReportFrequency.DAILY,
  ReportFrequency.MONTHLY,
  ReportFrequency.QUARTERLY,
  ReportFrequency.ANNUAL,
];
