function formatCurrency(value: number) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function wrapEmail(storeName: string, title: string, bodyHtml: string) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
    <div style="padding: 20px 24px; background: #111827; border-radius: 8px 8px 0 0;">
      <h1 style="margin: 0; color: #ffffff; font-size: 18px;">${storeName}</h1>
    </div>
    <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
      <h2 style="margin-top: 0; font-size: 16px; color: #111827;">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="padding: 16px 24px; font-size: 12px; color: #9ca3af;">
      This is an automated email from ${storeName}. Please do not reply directly to this message.
    </p>
  </div>`;
}

function itemsTable(
  items: {
    itemName: string;
    quantity: number;
    netWeight: number | null;
    rate: number | null;
    makingCharge: number;
    stoneCharge: number;
    lineTotal: number;
  }[],
) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.itemName}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${item.netWeight ? item.netWeight.toFixed(3) + " g" : "-"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${item.rate ? formatCurrency(item.rate) : "-"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  return `
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
    <thead>
      <tr style="background: #f9fafb;">
        <th style="padding: 8px; text-align: left;">Item</th>
        <th style="padding: 8px; text-align: center;">Qty</th>
        <th style="padding: 8px; text-align: right;">Net Wt</th>
        <th style="padding: 8px; text-align: right;">Rate</th>
        <th style="padding: 8px; text-align: right;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function summaryRow(label: string, value: string, bold = false) {
  return `
  <div style="display: flex; justify-content: space-between; padding: 4px 0; ${bold ? "font-weight: bold; border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 8px;" : ""}">
    <span>${label}</span>
    <span>${value}</span>
  </div>`;
}

export function disabledAccountEmail(params: {
  name: string;
  storeName: string;
  contactInstruction: string;
}) {
  const { name, storeName, contactInstruction } = params;

  const body = `
    <p>Hi ${name},</p>
    <p>Someone just tried to sign in to your account at <strong>${storeName}</strong>, but this account is currently <strong>disabled</strong> and cannot access the application.</p>
    <p>If this wasn't you, no action is needed. To regain access, please ${contactInstruction} to have your account re-enabled.</p>
  `;

  return {
    subject: `Sign-in blocked — your ${storeName} account is disabled`,
    html: wrapEmail(storeName, "Account access blocked", body),
  };
}

export function inviteUserEmail(params: {
  name: string;
  roleLabel: string;
  storeName: string;
  hasEmailLogin: boolean;
  hasPhoneLogin: boolean;
  loginUrl: string;
}) {
  const { name, roleLabel, storeName, hasEmailLogin, hasPhoneLogin, loginUrl } = params;

  const loginInstructions = [
    hasEmailLogin
      ? `<li>Sign in with Google using this email address.</li>`
      : "",
    hasPhoneLogin
      ? `<li>Or sign in with your registered mobile number using an OTP.</li>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const body = `
    <p>Hi ${name},</p>
    <p>An account has been created for you on <strong>${storeName}</strong> with the role of <strong>${roleLabel}</strong>.</p>
    <p>To get started:</p>
    <ul>${loginInstructions}</ul>
    <p style="margin-top: 20px;">
      <a href="${loginUrl}" style="background: #111827; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; display: inline-block;">
        Go to ${storeName}
      </a>
    </p>
  `;

  return {
    subject: `You've been added to ${storeName}`,
    html: wrapEmail(storeName, "Welcome aboard", body),
  };
}

export function invoiceEmail(params: {
  storeName: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  items: Parameters<typeof itemsTable>[0];
  subtotal: number;
  makingCharges: number;
  stoneCharges: number;
  discount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
}) {
  const body = `
    <p>Hi ${params.customerName || "Customer"},</p>
    <p>Here is your invoice <strong>${params.invoiceNumber}</strong> dated ${formatDate(params.invoiceDate)}.</p>
    ${itemsTable(params.items)}
    <div style="font-size: 13px; max-width: 260px; margin-left: auto;">
      ${summaryRow("Subtotal", formatCurrency(params.subtotal))}
      ${summaryRow("Making Charges", formatCurrency(params.makingCharges))}
      ${summaryRow("Stone Charges", formatCurrency(params.stoneCharges))}
      ${summaryRow("Discount", `-${formatCurrency(params.discount)}`)}
      ${summaryRow("Tax", formatCurrency(params.taxAmount))}
      ${summaryRow("Total", formatCurrency(params.totalAmount), true)}
      ${summaryRow("Paid", formatCurrency(params.paidAmount))}
      ${summaryRow("Balance Due", formatCurrency(params.balanceAmount), true)}
    </div>
  `;

  return {
    subject: `Invoice ${params.invoiceNumber} from ${params.storeName}`,
    html: wrapEmail(params.storeName, `Invoice ${params.invoiceNumber}`, body),
  };
}

export function kachaSlipEmail(params: {
  storeName: string;
  slipNumber: string;
  invoiceDate: string;
  customerName: string;
  items: Parameters<typeof itemsTable>[0];
  subtotal: number;
  makingCharges: number;
  stoneCharges: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
}) {
  const body = `
    <p>Hi ${params.customerName || "Customer"},</p>
    <p>Here is your Kacha slip <strong>${params.slipNumber}</strong> dated ${formatDate(params.invoiceDate)}.</p>
    ${itemsTable(params.items)}
    <div style="font-size: 13px; max-width: 260px; margin-left: auto;">
      ${summaryRow("Subtotal", formatCurrency(params.subtotal))}
      ${summaryRow("Making Charges", formatCurrency(params.makingCharges))}
      ${summaryRow("Stone Charges", formatCurrency(params.stoneCharges))}
      ${summaryRow("Discount", `-${formatCurrency(params.discount)}`)}
      ${summaryRow("Total", formatCurrency(params.totalAmount), true)}
      ${summaryRow("Paid", formatCurrency(params.paidAmount))}
      ${summaryRow("Balance Due", formatCurrency(params.balanceAmount), true)}
    </div>
    <p style="font-size: 12px; color: #6b7280;">This is a provisional Kacha slip, not a tax invoice.</p>
  `;

  return {
    subject: `Kacha Slip ${params.slipNumber} from ${params.storeName}`,
    html: wrapEmail(params.storeName, `Kacha Slip ${params.slipNumber}`, body),
  };
}

export function ledgerStatementEmail(params: {
  storeName: string;
  customerName: string;
  openingBalance: number;
  ledgerDebitTotal: number;
  ledgerCreditTotal: number;
  currentBalance: number;
  entries: {
    entryDate: string;
    sourceType: string;
    description: string;
    type: "DEBIT" | "CREDIT";
    amount: number;
    invoiceNumber?: string | null;
  }[];
}) {
  const rows = params.entries
    .map(
      (entry) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${entry.entryDate}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${entry.sourceType}${entry.invoiceNumber ? ` (${entry.invoiceNumber})` : ""}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${entry.description || "-"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: ${entry.type === "DEBIT" ? "#dc2626" : "#059669"};">
          ${entry.type === "DEBIT" ? "-" : "+"}${formatCurrency(entry.amount)}
        </td>
      </tr>`,
    )
    .join("");

  const body = `
    <p>Hi ${params.customerName},</p>
    <p>Here is your account statement with <strong>${params.storeName}</strong>.</p>
    <div style="font-size: 13px; max-width: 300px;">
      ${summaryRow("Opening Balance", formatCurrency(params.openingBalance))}
      ${summaryRow("Total Sales (Debit)", formatCurrency(params.ledgerDebitTotal))}
      ${summaryRow("Total Received (Credit)", formatCurrency(params.ledgerCreditTotal))}
      ${summaryRow("Current Balance", formatCurrency(params.currentBalance), true)}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
      <thead>
        <tr style="background: #f9fafb;">
          <th style="padding: 8px; text-align: left;">Date</th>
          <th style="padding: 8px; text-align: left;">Type</th>
          <th style="padding: 8px; text-align: left;">Description</th>
          <th style="padding: 8px; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4" style="padding: 8px; text-align: center; color: #9ca3af;">No entries yet</td></tr>`}</tbody>
    </table>
  `;

  return {
    subject: `Your account statement — ${params.storeName}`,
    html: wrapEmail(params.storeName, "Account Statement", body),
  };
}
