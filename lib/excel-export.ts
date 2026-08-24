import * as XLSX from "xlsx";

function pad(value: number) {
  return String(value).padStart(2, "0");
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

  const now = new Date();
  const fileName = `${filePrefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.xlsx`;

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return { fileName, fileBase64: Buffer.from(buffer).toString("base64") };
}
