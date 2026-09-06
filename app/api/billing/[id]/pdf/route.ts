// FILE PATH: app/api/billing/[id]/pdf/route.ts
//
// Generates the same invoice the print page shows, as an actual PDF file —
// what "Share on WhatsApp" needs to hand over a real attachment instead of
// a text-only wa.me link (WhatsApp's click-to-chat URL scheme has no
// attachment parameter at all; it's a platform limitation, not something
// fixable client-side). Built with jsPDF/jspdf-autotable rather than a
// headless-browser HTML render — no such renderer exists in this codebase,
// and adding one (Puppeteer + Chromium) is a heavy, fragile dependency for
// a Vercel deployment. jsPDF was already a dependency (used for the
// metal-rates export), so this reuses it rather than adding another.

import { NextRequest, NextResponse } from "next/server";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { getInvoiceById } from "@/lib/actions/invoice-actions";
import { getBusinessSettings } from "@/lib/actions/settings-actions";
import { amountInWords } from "@/lib/number-to-words";
import { documentHeading, COMPOSITION_DISCLAIMER } from "@/lib/gst";

function fmt(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [invoice, settings] = await Promise.all([
      getInvoiceById(id),
      getBusinessSettings(),
    ]);

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 32;
    let y = margin;

    // Heading — "TAX INVOICE" or "BILL OF SUPPLY" for a Composition
    // dealer, same rule the print page follows (see documentHeading()).
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(documentHeading(settings.gstScheme), pageWidth / 2, y, { align: "center" });
    y += 18;

    if (settings.gstScheme === "COMPOSITION") {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text(COMPOSITION_DISCLAIMER, pageWidth / 2, y, { align: "center" });
      y += 14;
    }

    // Invoice No / Date / Status
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, margin, y);
    doc.text(`Date: ${fmtDate(invoice.invoiceDate)}`, pageWidth / 2 - 40, y);
    doc.text(`Status: ${invoice.status}`, pageWidth - margin, y, { align: "right" });
    y += 18;

    // Business (left) / Customer (right)
    const colWidth = (pageWidth - margin * 2 - 16) / 2;
    const businessLines = [
      settings.businessName,
      settings.address,
      [settings.city, settings.state].filter(Boolean).join(", "),
      settings.pincode ? `PIN: ${settings.pincode}` : null,
      settings.phone ? `Phone: ${settings.phone}` : null,
      settings.gstNumber ? `GSTIN: ${settings.gstNumber}` : null,
    ].filter((line): line is string => Boolean(line));

    const customerLines = [
      invoice.customer?.name ?? "-",
      invoice.customer?.addressLine1,
      invoice.customer?.addressLine2,
      [invoice.customer?.city, invoice.customer?.state].filter(Boolean).join(", "),
      invoice.customer?.phone ? `Phone: ${invoice.customer.phone}` : null,
    ].filter((line): line is string => Boolean(line));

    doc.setFont("helvetica", "bold");
    doc.text("From", margin, y);
    doc.text("Bill To", margin + colWidth + 16, y);
    doc.setFont("helvetica", "normal");
    let lineY = y + 12;
    const maxLines = Math.max(businessLines.length, customerLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (businessLines[i]) doc.text(businessLines[i], margin, lineY, { maxWidth: colWidth });
      if (customerLines[i]) doc.text(customerLines[i], margin + colWidth + 16, lineY, { maxWidth: colWidth });
      lineY += 12;
    }
    y = lineY + 10;

    // Line items
    const isInterState = invoice.items.some((item) => item.igstAmount > 0);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [212, 175, 55], textColor: 255 },
      head: [[
        "Item",
        "Purity",
        "Qty",
        "Net Wt (g)",
        "Rate",
        "Making",
        "Stone",
        "Discount",
        isInterState ? "IGST" : "SGST+CGST",
        "Total",
      ]],
      body: invoice.items.map((item) => [
        item.itemName,
        item.purity ?? "-",
        `${item.quantity}N`,
        (item.netWeight ?? 0).toFixed(3),
        fmt(item.rate ?? 0),
        fmt(item.makingCharge),
        fmt(item.stoneCharge),
        fmt(item.schemeDiscount),
        fmt(isInterState ? item.igstAmount : item.sgstAmount + item.cgstAmount),
        fmt(item.lineTotal),
      ]),
    });

    // @ts-expect-error -- lastAutoTable is attached by the autoTable plugin at runtime
    y = doc.lastAutoTable.finalY + 20;

    // Totals — right-aligned block, same figures as the print page's
    // "Additional Other Charges" panel.
    const totalsRows: [string, string][] = [
      ["Subtotal", fmt(invoice.subtotal)],
      ["Making Charges", fmt(invoice.makingCharges)],
      ["Stone Charges", fmt(invoice.stoneCharges)],
      ["Discount", `-${fmt(invoice.discount)}`],
      ["Tax", fmt(invoice.taxAmount)],
      ["Total", fmt(invoice.totalAmount)],
      ["Paid", fmt(invoice.paidAmount)],
      ["Balance Due", fmt(invoice.balanceAmount)],
    ];

    doc.setFontSize(9);
    for (const [label, value] of totalsRows) {
      const isTotal = label === "Total" || label === "Balance Due";
      doc.setFont("helvetica", isTotal ? "bold" : "normal");
      doc.text(label, pageWidth - margin - 140, y);
      // jsPDF's built-in fonts (helvetica/times/courier) are the old PDF
      // base-14 set — pre-Unicode, no ₹ (U+20B9) glyph at all — so it drew
      // as a broken/missing character in the generated file even though the
      // HTML email and browser print view render ₹ fine (real Unicode
      // fonts). "Rs." is the safe ASCII fallback rather than embedding a
      // custom Unicode font just for one symbol.
      doc.text(`Rs. ${value}`, pageWidth - margin, y, { align: "right" });
      y += 14;
    }

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Value in words: ${amountInWords(invoice.totalAmount)}`, margin, y, {
      maxWidth: pageWidth - margin * 2,
    });
    y += 22;

    if (invoice.notes) {
      doc.setFont("helvetica", "bold");
      doc.text("Notes", margin, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
      doc.text(noteLines, margin, y);
      y += noteLines.length * 11 + 10;
    }

    if (settings.invoiceTerms) {
      doc.setFont("helvetica", "bold");
      doc.text("Terms & Conditions", margin, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const termLines = doc.splitTextToSize(settings.invoiceTerms, pageWidth - margin * 2);
      doc.text(termLines, margin, y);
    }

    const pdfBuffer = doc.output("arraybuffer");
    const fileName = `${invoice.invoiceNumber}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Invoice PDF generation failed:", error);
    return NextResponse.json({ error: "Failed to generate invoice PDF" }, { status: 500 });
  }
}
