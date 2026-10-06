import * as XLSX from "xlsx";

import { styleHeaderRow } from "@/lib/excel-export";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function fileNameFor(filePrefix: string) {
  const now = new Date();
  return `${filePrefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(
    now.getHours(),
  )}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.xlsx`;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The multi-sheet sibling of buildImportTemplateWithDropdowns (lib/excel-export.ts):
 * several data sheets (each with its own header row, rows and in-cell
 * dropdowns), then an "Instructions" sheet, then one "Options" sheet with
 * every dropdown's values. Used for files the import reads by sheet name —
 * an import template (example rows) and its export (the store's rows) are
 * the same call with different rows. Dropdowns warn on an unlisted value
 * but allow it; the import's own checks stay the real gate.
 */
export function buildMultiSheetTemplate({
  sheets,
  instructions,
  filePrefix,
  rowsWithDropdowns = 1000,
}: {
  sheets: {
    name: string;
    columns: string[];
    rows: Record<string, unknown>[];
    /** Column header → dropdown values (lists with the same header share one Options column). */
    dropdowns?: Record<string, string[]>;
  }[];
  instructions?: { notes: string[]; rows: Record<string, unknown>[] };
  filePrefix: string;
  rowsWithDropdowns?: number;
}): { fileName: string; fileBase64: string } {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.columns }),
      sheet.name.slice(0, 31),
    );
  }

  if (instructions) {
    const sheet = XLSX.utils.aoa_to_sheet([...instructions.notes.map((note) => [note]), []]);
    XLSX.utils.sheet_add_json(sheet, instructions.rows, { origin: instructions.notes.length + 1 });
    sheet["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Instructions");
  }

  // One Options column per distinct dropdown header.
  const optionLists = new Map<string, string[]>();
  for (const sheet of sheets) {
    for (const [column, values] of Object.entries(sheet.dropdowns ?? {})) {
      if (!sheet.columns.includes(column) || optionLists.has(column)) continue;
      const clean = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
      if (clean.length) optionLists.set(column, clean);
    }
  }
  const optionHeaders = [...optionLists.keys()];
  const optionsSheet = XLSX.utils.aoa_to_sheet([optionHeaders]);
  optionHeaders.forEach((header, index) => {
    XLSX.utils.sheet_add_aoa(optionsSheet, optionLists.get(header)!.map((value) => [value]), {
      origin: { r: 1, c: index },
    });
  });
  XLSX.utils.book_append_sheet(workbook, optionsSheet, "Options");

  let buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const perSheet = sheets.map((sheet) =>
    Object.keys(sheet.dropdowns ?? {})
      .filter((column) => sheet.columns.includes(column) && optionLists.has(column))
      .map((column) => {
        const target = XLSX.utils.encode_col(sheet.columns.indexOf(column));
        const sourceIndex = optionHeaders.indexOf(column);
        const source = XLSX.utils.encode_col(sourceIndex);
        const count = optionLists.get(column)!.length;
        return (
          `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="warning" ` +
          `errorTitle="Not in the list" error="This value isn't in your store's list for ${escapeXml(column)}. Check the Options sheet." ` +
          `sqref="${target}2:${target}${rowsWithDropdowns + 1}">` +
          `<formula1>Options!$${source}$2:$${source}$${count + 1}</formula1></dataValidation>`
        );
      }),
  );

  if (perSheet.some((list) => list.length)) {
    const zip = XLSX.CFB.read(buffer, { type: "buffer" });
    perSheet.forEach((validations, index) => {
      if (!validations.length) return;
      // SheetJS writes sheets as sheet1.xml, sheet2.xml, ... in append order.
      const entry = XLSX.CFB.find(zip, `/xl/worksheets/sheet${index + 1}.xml`);
      if (!entry?.content) throw new Error(`Sheet XML not found for ${sheets[index].name}`);
      const xml = Buffer.from(entry.content as Uint8Array).toString("utf8");
      const withValidations = xml.replace(
        "</sheetData>",
        `</sheetData><dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`,
      );
      entry.content = Buffer.from(withValidations, "utf8");
      entry.size = entry.content.length;
    });
    buffer = Buffer.from(XLSX.CFB.write(zip, { fileType: "zip", type: "buffer" }) as Uint8Array);
  }

  // Same frozen bold header row as every other export.
  buffer = styleHeaderRow(buffer);

  return { fileName: fileNameFor(filePrefix), fileBase64: buffer.toString("base64") };
}
