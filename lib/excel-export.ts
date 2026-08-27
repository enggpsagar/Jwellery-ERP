import * as XLSX from "xlsx";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function timestampedFileName(filePrefix: string, extension: string) {
  const now = new Date();
  return `${filePrefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.${extension}`;
}

function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Builds a .csv file from plain-object rows (same row shape as
 * buildExcelExport, so callers can offer both formats off one row-mapping
 * function) with proper quote/comma/newline escaping — unlike the
 * hand-rolled `"${value}"` join in app/api/metal-rates/export/route.ts,
 * which breaks on any cell containing a comma or quote.
 */
export function buildCsvExport(
  rows: Record<string, unknown>[],
  filePrefix: string,
): { fileName: string; content: string } {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
  ];

  return { fileName: timestampedFileName(filePrefix, "csv"), content: lines.join("\n") };
}

/**
 * Builds an .xlsx workbook from plain-object rows and returns it as a
 * base64 string ready to send across a server action boundary, plus a
 * timestamped filename. Mirrors the export-building logic already
 * hand-duplicated in customer-actions.ts/vendor-actions.ts/karigar-actions.ts
 * (left as-is there) — new export actions should call this instead of
 * re-copying that boilerplate a fourth+ time.
 */
export function buildExcelExport(
  rows: Record<string, unknown>[],
  sheetName: string,
  filePrefix: string,
): { fileName: string; fileBase64: string } {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const fileName = timestampedFileName(filePrefix, "xlsx");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return { fileName, fileBase64: Buffer.from(buffer).toString("base64") };
}

/**
 * Same as `buildExcelExport` but writes several named sheets into one
 * workbook. Needed wherever a flat sheet would lose data — a backup taken
 * before a destructive operation, for instance, has to carry parent rows
 * and their line items, and must be complete enough to rebuild from.
 *
 * A sheet with no rows is still written (as headers only, when `columns`
 * is given) so the workbook's shape stays predictable for whoever reads it.
 */
export function buildMultiSheetExcelExport(
  sheets: { name: string; rows: Record<string, unknown>[]; columns?: string[] }[],
  filePrefix: string,
): { fileName: string; fileBase64: string } {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = sheet.rows.length
      ? XLSX.utils.json_to_sheet(sheet.rows)
      : XLSX.utils.aoa_to_sheet([sheet.columns ?? []]);

    // Excel rejects sheet names over 31 characters outright.
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }

  const fileName = timestampedFileName(filePrefix, "xlsx");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return { fileName, fileBase64: Buffer.from(buffer).toString("base64") };
}

/**
 * Reads every sheet of an uploaded workbook, keyed by sheet name. Needed to
 * re-import a backup, which splits parent rows and line items across two
 * sheets — reading only the first would silently drop every line item.
 */
export function parseExcelWorkbook(
  fileBuffer: ArrayBuffer,
): Record<string, Record<string, unknown>[]> {
  const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
  const sheets: Record<string, Record<string, unknown>[]> = {};

  for (const name of workbook.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      defval: "",
      raw: false,
    });
  }

  return sheets;
}

/** Reads the first sheet of an uploaded .xlsx/.csv into plain-object rows. */
export function parseExcelUpload(fileBuffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) return [];

  // `defval: ""` keeps blank cells as empty strings rather than dropping the
  // key entirely, so a missing required column reads as empty instead of
  // silently looking like a row that never had that field.
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: "",
    raw: false,
  });
}
