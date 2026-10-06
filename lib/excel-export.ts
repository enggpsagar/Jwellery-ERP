import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
 * Same rows, same call shape as `buildExcelExport` ({ fileName, fileBase64
 * }) — a drop-in for whichever format the export toolbar's dropdown picked,
 * so a call site only ever needs one ternary between the two builders
 * rather than two different result shapes to route through
 * DataTableExportResult/downloadBase64File.
 */
export function buildCsvExportBase64(
  rows: Record<string, unknown>[],
  filePrefix: string,
): { fileName: string; fileBase64: string } {
  const { fileName, content } = buildCsvExport(rows, filePrefix);
  return { fileName, fileBase64: Buffer.from(content, "utf-8").toString("base64") };
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
  const buffer = styleHeaderRow(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

  return { fileName, fileBase64: Buffer.from(buffer).toString("base64") };
}

/**
 * Same rows, same { fileName, fileBase64 } shape as buildExcelExport/
 * buildCsvExportBase64 — a table export as an actual PDF, via jsPDF +
 * jspdf-autotable (already a dependency, used the same way for the
 * metal-rates export and the invoice PDF at app/api/billing/[id]/pdf).
 * Landscape by default: these row shapes carry as many columns as their
 * Excel export does, and most of these tables are wider than they are
 * tall.
 */
export function buildPdfExportBase64(
  rows: Record<string, unknown>[],
  title: string,
  filePrefix: string,
): { fileName: string; fileBase64: string } {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 14, 21);
  doc.setTextColor(0);

  const headers = rows.length ? Object.keys(rows[0]) : [];

  // jsPDF's built-in Helvetica has no "₹" glyph (it printed as "¹"), so
  // it's spelled "Rs." in PDF output only.
  const pdfSafe = (text: string) => text.replace(/₹\s?/g, "Rs. ");
  const cellText = (value: unknown) => (value === null || value === undefined ? "" : pdfSafe(String(value)));

  autoTable(doc, {
    startY: 26,
    head: headers.length ? [headers.map(pdfSafe)] : undefined,
    body: rows.map((row) => headers.map((key) => cellText(row[key]))),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [212, 175, 55], textColor: 255 },
    didDrawPage: () => {
      if (rows.length === 0) {
        doc.setFontSize(10);
        doc.text("No records to export.", 14, 32);
      }
    },
  });

  const pdf = doc.output("arraybuffer");
  return { fileName: timestampedFileName(filePrefix, "pdf"), fileBase64: Buffer.from(pdf).toString("base64") };
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
  const buffer = styleHeaderRow(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

  return { fileName, fileBase64: Buffer.from(buffer).toString("base64") };
}

/**
 * An import template with in-cell dropdowns: the template sheet first (the
 * import reads the first sheet), then an optional "Instructions" sheet, then
 * an "Options" sheet listing each dropdown's values (also a readable
 * reference). SheetJS's community build can't write data validation, so the
 * dropdowns are added to the saved file's sheet XML directly. They warn on a
 * value that isn't listed but still allow it — the import's own name checks
 * stay the real gate, and free-text columns (e.g. several comma-joined Stone
 * Types) remain typeable.
 */
export function buildImportTemplateWithDropdowns({
  sheetName,
  rows,
  columns,
  dropdowns,
  filePrefix,
  instructions,
  rowsWithDropdowns = 1000,
}: {
  sheetName: string;
  rows: Record<string, unknown>[];
  columns: string[];
  /** Template column header → the values its dropdown offers. Empty lists get no dropdown. */
  dropdowns: Record<string, string[]>;
  filePrefix: string;
  /** General notes (one per line) above a table explaining each column. */
  instructions?: { notes: string[]; rows: Record<string, unknown>[] };
  rowsWithDropdowns?: number;
}): { fileName: string; fileBase64: string } {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows, { header: columns }),
    sheetName.slice(0, 31),
  );

  if (instructions) {
    const sheet = XLSX.utils.aoa_to_sheet([...instructions.notes.map((note) => [note]), []]);
    XLSX.utils.sheet_add_json(sheet, instructions.rows, { origin: instructions.notes.length + 1 });
    sheet["!cols"] = [{ wch: 4 }, { wch: 24 }, { wch: 26 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Instructions");
  }

  const lists = Object.entries(dropdowns)
    .map(([column, values]) => [column, [...new Set(values.map((v) => v.trim()).filter(Boolean))]] as const)
    .filter(([column, values]) => values.length > 0 && columns.includes(column));

  const optionsSheet = XLSX.utils.aoa_to_sheet([lists.map(([column]) => column)]);
  lists.forEach(([, values], listIndex) => {
    XLSX.utils.sheet_add_aoa(optionsSheet, values.map((value) => [value]), {
      origin: { r: 1, c: listIndex },
    });
  });
  XLSX.utils.book_append_sheet(workbook, optionsSheet, "Options");

  const validations = lists.map(([column, values], listIndex) => {
    const target = XLSX.utils.encode_col(columns.indexOf(column));
    const source = XLSX.utils.encode_col(listIndex);
    return (
      `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="warning" ` +
      `errorTitle="Not in the list" error="This value isn't in your store's list for ${escapeXml(column)}. Check the Options sheet." ` +
      `sqref="${target}2:${target}${rowsWithDropdowns + 1}">` +
      `<formula1>Options!$${source}$2:$${source}$${values.length + 1}</formula1></dataValidation>`
    );
  });

  let buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  if (validations.length) {
    const zip = XLSX.CFB.read(buffer, { type: "buffer" });
    const entry = XLSX.CFB.find(zip, "/xl/worksheets/sheet1.xml");
    if (!entry?.content) throw new Error("Template sheet XML not found");
    const xml = Buffer.from(entry.content as Uint8Array).toString("utf8");
    // dataValidations sits right after sheetData in the schema's element
    // order (before ignoredErrors/pageMargins that SheetJS may add).
    const withValidations = xml.replace(
      "</sheetData>",
      `</sheetData><dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`,
    );
    entry.content = Buffer.from(withValidations, "utf8");
    entry.size = entry.content.length;
    buffer = Buffer.from(XLSX.CFB.write(zip, { fileType: "zip", type: "buffer" }) as Uint8Array);
  }

  buffer = styleHeaderRow(buffer);

  return {
    fileName: timestampedFileName(filePrefix, "xlsx"),
    fileBase64: buffer.toString("base64"),
  };
}


/**
 * Every workbook this app writes gets the same header treatment: row 1 frozen
 * (stays in view while scrolling) and filled yellow + bold, so a column's
 * name is never lost on a long sheet. SheetJS's community build can't write
 * styles or panes, so — like the dropdowns in buildImportTemplateWithDropdowns
 * — it's patched into the saved file's XML: one extra cellXfs entry in
 * styles.xml, a frozen pane in each sheet's sheetView, and that style on
 * every row-1 cell. Sheets whose row 1 isn't a header (Instructions, which
 * opens with notes) are left alone.
 */
const HEADERLESS_SHEETS = new Set(["Instructions"]);

export function styleHeaderRow(buffer: Buffer): Buffer {
  const zip = XLSX.CFB.read(buffer, { type: "buffer" });
  const read = (path: string) => {
    const entry = XLSX.CFB.find(zip, path);
    return entry?.content ? Buffer.from(entry.content as Uint8Array).toString("utf8") : null;
  };
  const write = (path: string, xml: string) => {
    const entry = XLSX.CFB.find(zip, path)!;
    entry.content = Buffer.from(xml, "utf8");
    entry.size = entry.content.length;
  };

  const stylesXml = read("/xl/styles.xml");
  const workbookXml = read("/xl/workbook.xml");
  if (!stylesXml || !workbookXml) return buffer;

  // Append a bold font, a solid yellow fill and an xf using both; the new
  // xf's index is the old cellXfs count.
  const bump = (xml: string, tag: string, add: string) => {
    const m = xml.match(new RegExp(`<${tag} count="(\\d+)">`));
    if (!m) return { xml, index: -1 };
    const index = Number(m[1]);
    return {
      xml: xml.replace(m[0], `<${tag} count="${index + 1}">`).replace(`</${tag}>`, `${add}</${tag}>`),
      index,
    };
  };
  let styles = stylesXml;
  const font = bump(styles, "fonts", '<font><b/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>');
  styles = font.xml;
  const fill = bump(styles, "fills", '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>');
  styles = fill.xml;
  if (font.index < 0 || fill.index < 0) return buffer;
  const xf = bump(
    styles,
    "cellXfs",
    `<xf numFmtId="0" fontId="${font.index}" fillId="${fill.index}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`,
  );
  if (xf.index < 0) return buffer;
  write("/xl/styles.xml", xf.xml);

  const sheetNames = [...workbookXml.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]);
  sheetNames.forEach((name, i) => {
    if (HEADERLESS_SHEETS.has(name)) return;
    const path = `/xl/worksheets/sheet${i + 1}.xml`;
    let xml = read(path);
    if (!xml) return;

    const pane =
      '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>';
    if (/<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml)) {
      xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, `<sheetViews>${pane}</sheetViews>`);
    } else {
      xml = xml.replace(/(<sheetFormatPr|<cols>|<sheetData)/, `<sheetViews>${pane}</sheetViews>$1`);
    }

    xml = xml.replace(/<row r="1"([^>]*)>([\s\S]*?)<\/row>/, (_m, attrs: string, cells: string) =>
      `<row r="1"${attrs}>${cells.replace(/<c r="([A-Z]+1)"(?: s="\d+")?/g, `<c r="$1" s="${xf.index}"`)}</row>`,
    );
    write(path, xml);
  });

  return Buffer.from(XLSX.CFB.write(zip, { fileType: "zip", type: "buffer" }) as Uint8Array);
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
