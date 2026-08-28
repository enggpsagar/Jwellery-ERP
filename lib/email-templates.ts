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

export function planExpiringReminderEmail(params: {
  name: string;
  storeName: string;
  planName: string;
  expiresAt: Date;
  daysRemaining: number;
}) {
  const { name, storeName, planName, expiresAt, daysRemaining } = params;

  const urgency = daysRemaining <= 0 ? "today" : daysRemaining === 1 ? "tomorrow" : `in ${daysRemaining} days`;

  const body = `
    <p>Hi ${name},</p>
    <p>Your <strong>${storeName}</strong> subscription on the <strong>${planName}</strong> plan expires ${urgency}, on <strong>${formatDate(expiresAt)}</strong>.</p>
    <p>Renew before then to avoid any interruption — once the plan expires, users at this store will not be able to sign in until it's renewed.</p>
    <p>Contact your Super Admin to renew or upgrade your plan.</p>
  `;

  return {
    subject: `Your ${storeName} plan expires ${urgency}`,
    html: wrapEmail(storeName, "Plan renewal reminder", body),
  };
}

/**
 * One-time code email, used for both the sign-in code and the profile
 * email-change code — only the heading and intro line differ, so they
 * share one layout rather than drifting apart as two near-copies.
 *
 * `storeName` is null when no store could be resolved for the recipient —
 * a Super Admin (whose `storeId` is always null) or an address with no
 * matching user. The Store row is then dropped entirely rather than
 * printed with a placeholder: a code that names the wrong store is worse
 * than one that names no store at all.
 *
 * Laid out with tables and inline styles only. Flexbox/grid are
 * unreliable in email clients — note the older `summaryRow()` helper above
 * uses `display: flex` and renders poorly in Outlook, which is why this
 * template does not reuse it.
 */
export function otpEmail(params: {
  code: string;
  appName: string;
  storeName: string | null;
  expiryMinutes: number;
  recipientName?: string | null;
  purpose: "login" | "email-change";
}) {
  const { code, appName, storeName, expiryMinutes, recipientName, purpose } =
    params;

  const isLogin = purpose === "login";
  const greeting = recipientName ? recipientName : "there";

  const heading = isLogin
    ? "Your sign-in code"
    : "Verify your new email address";

  const intro = isLogin
    ? `Use the code below to sign in to <strong>${appName}</strong>.`
    : `Use the code below to confirm this email address on your <strong>${appName}</strong> account.`;

  const detailRow = (label: string, value: string) => `
        <tr>
          <td style="padding: 8px 0; font-size: 13px; color: #6b7280; width: 132px; border-bottom: 1px solid #f3f4f6;">${label}</td>
          <td style="padding: 8px 0; font-size: 13px; color: #111827; font-weight: bold; border-bottom: 1px solid #f3f4f6;">${value}</td>
        </tr>`;

  const details = [
    storeName ? detailRow("Store", storeName) : "",
    detailRow("Application", appName),
    detailRow("Valid for", `${expiryMinutes} minutes`),
  ].join("");

  const body = `
    <p style="margin-top: 0;">Hi ${greeting},</p>
    <p>${intro}</p>

    <div style="margin: 24px 0; padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center;">
      <div style="font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #6b7280;">One-time code</div>
      <div style="margin-top: 10px; font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111827;">${code}</div>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 0 0 22px;">
      <tbody>${details}</tbody>
    </table>

    <div style="padding: 14px 16px; background: #fffbeb; border-left: 3px solid #d97706; border-radius: 0 6px 6px 0;">
      <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.6;">
        <strong>Keep this code to yourself.</strong> ${appName} will never ask you for it by phone, email or message. Anyone who has this code can sign in as you.
      </p>
    </div>

    <p style="margin-bottom: 0; font-size: 13px; color: #6b7280;">
      Didn't request this? You can safely ignore this email — the code expires on its own and your account stays secure.
    </p>
  `;

  // The store is the recipient's real-world context, so it leads the
  // subject and the header bar; the app name is carried in the details.
  const scopeLabel = storeName || appName;

  const text = [
    `Hi ${greeting},`,
    "",
    isLogin
      ? `Use this code to sign in to ${appName}: ${code}`
      : `Use this code to confirm your new email address on ${appName}: ${code}`,
    "",
    // Spread rather than filtering empty strings out afterwards — the ""
    // entries above and below are deliberate blank lines, and a filter
    // that drops the absent store line flattens those too.
    ...(storeName ? [`Store: ${storeName}`] : []),
    `Application: ${appName}`,
    `Valid for: ${expiryMinutes} minutes`,
    "",
    `Keep this code to yourself. ${appName} will never ask you for it by phone, email or message. Anyone who has this code can sign in as you.`,
    "",
    "Didn't request this? You can safely ignore this email.",
  ].join("\n");

  return {
    subject: isLogin
      ? `Your sign-in code for ${scopeLabel}`
      : `Verify your new email address for ${scopeLabel}`,
    html: wrapEmail(scopeLabel, heading, body),
    text,
  };
}

/**
 * Accompanies the backup file attached before a destructive bulk delete.
 * This email IS the safety net — if it does not arrive, the delete does not
 * happen — so it states plainly what was captured and what is about to go.
 */
export function dataBackupEmail(params: {
  storeName: string;
  appName: string;
  recordLabel: string;
  recordCount: number;
  fileName: string;
  triggeredBy: string;
}) {
  const {
    storeName,
    appName,
    recordLabel,
    recordCount,
    fileName,
    triggeredBy,
  } = params;

  const body = `
    <p style="margin-top: 0;">A bulk delete of <strong>${recordLabel}</strong> was requested for <strong>${storeName}</strong>.</p>
    <p>The complete backup is attached to this email. Keep it somewhere safe — once the delete completes, this file is the only remaining copy of these records.</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tbody>
        <tr>
          <td style="padding: 8px 0; font-size: 13px; color: #6b7280; width: 150px; border-bottom: 1px solid #f3f4f6;">Records backed up</td>
          <td style="padding: 8px 0; font-size: 13px; color: #111827; font-weight: bold; border-bottom: 1px solid #f3f4f6;">${recordCount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Attached file</td>
          <td style="padding: 8px 0; font-size: 13px; color: #111827; font-weight: bold; border-bottom: 1px solid #f3f4f6;">${fileName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Requested by</td>
          <td style="padding: 8px 0; font-size: 13px; color: #111827; font-weight: bold; border-bottom: 1px solid #f3f4f6;">${triggeredBy}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-size: 13px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">Application</td>
          <td style="padding: 8px 0; font-size: 13px; color: #111827; font-weight: bold; border-bottom: 1px solid #f3f4f6;">${appName}</td>
        </tr>
      </tbody>
    </table>

    <div style="padding: 14px 16px; background: #fef2f2; border-left: 3px solid #dc2626; border-radius: 0 6px 6px 0;">
      <p style="margin: 0; font-size: 13px; color: #7f1d1d; line-height: 1.6;">
        <strong>This action cannot be undone.</strong> If you did not request this, contact your Store Owner immediately and keep this email — the attachment is the only way these records can be restored.
      </p>
    </div>
  `;

  const text = [
    `A bulk delete of ${recordLabel} was requested for ${storeName}.`,
    "",
    "The complete backup is attached to this email. Once the delete completes, this file is the only remaining copy of these records.",
    "",
    `Records backed up: ${recordCount}`,
    `Attached file: ${fileName}`,
    `Requested by: ${triggeredBy}`,
    `Application: ${appName}`,
    "",
    "This action cannot be undone. If you did not request this, contact your Store Owner immediately and keep this email.",
  ].join("\n");

  return {
    subject: `Backup before deletion — ${recordCount} ${recordLabel} from ${storeName}`,
    html: wrapEmail(storeName, `Backup of your ${recordLabel}`, body),
    text,
  };
}

const detailRow = (label: string, value: string) => `
      <tr>
        <td style="padding: 8px 0; font-size: 13px; color: #6b7280; width: 140px; border-bottom: 1px solid #f3f4f6;">${label}</td>
        <td style="padding: 8px 0; font-size: 13px; color: #111827; font-weight: bold; border-bottom: 1px solid #f3f4f6;">${value}</td>
      </tr>`;

/** Sent to the owner the moment their shop is registered. */
export function storeWelcomeEmail(params: {
  ownerName: string;
  storeName: string;
  storeCode: string;
  appName: string;
  planLabel: string;
  email: string;
  phone: string;
}) {
  const { ownerName, storeName, storeCode, appName, planLabel, email, phone } =
    params;

  const body = `
    <p style="margin-top: 0;">Hi ${ownerName},</p>
    <p><strong>${storeName}</strong> is set up and ready to use.</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tbody>
        ${detailRow("Store", storeName)}
        ${detailRow("Store code", storeCode)}
        ${detailRow("Plan", planLabel)}
        ${detailRow("Sign in with", email)}
        ${detailRow("or mobile", phone)}
      </tbody>
    </table>

    <p>There is no password to remember. Sign in with your Google account, or
    ask for a one-time code sent to your email or mobile.</p>

    <p style="margin-bottom: 0;">Your shop already has starter metals,
    categories and a Main Counter location so you can add a product and bill
    it straight away. Rename any of it under Settings.</p>
  `;

  const text = [
    `Hi ${ownerName},`,
    "",
    `${storeName} is set up and ready to use.`,
    "",
    `Store: ${storeName}`,
    `Store code: ${storeCode}`,
    `Plan: ${planLabel}`,
    `Sign in with: ${email}`,
    `or mobile: ${phone}`,
    "",
    "There is no password. Sign in with Google, or ask for a one-time code.",
  ].join("\n");

  return {
    subject: `${storeName} is ready on ${appName}`,
    html: wrapEmail(storeName, "Welcome aboard", body),
    text,
  };
}

/** Sent to the platform operator when a shop signs itself up. */
export function newStoreRegisteredEmail(params: {
  storeName: string;
  storeCode: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string | null;
  planLabel: string;
  appName: string;
}) {
  const {
    storeName,
    storeCode,
    ownerName,
    email,
    phone,
    city,
    planLabel,
    appName,
  } = params;

  const body = `
    <p style="margin-top: 0;">A new store just registered itself on ${appName}.</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tbody>
        ${detailRow("Store", storeName)}
        ${detailRow("Store code", storeCode)}
        ${detailRow("Owner", ownerName)}
        ${detailRow("Email", email)}
        ${detailRow("Mobile", phone)}
        ${city ? detailRow("City", city) : ""}
        ${detailRow("Plan", planLabel)}
      </tbody>
    </table>

    <p style="margin-bottom: 0; font-size: 13px; color: #6b7280;">
      The store starts on the trial plan and expires on its own. Change or
      extend it from Stores.
    </p>
  `;

  const text = [
    `A new store just registered itself on ${appName}.`,
    "",
    `Store: ${storeName} (${storeCode})`,
    `Owner: ${ownerName}`,
    `Email: ${email}`,
    `Mobile: ${phone}`,
    ...(city ? [`City: ${city}`] : []),
    `Plan: ${planLabel}`,
  ].join("\n");

  return {
    subject: `New store registered: ${storeName}`,
    html: wrapEmail(appName, "New store registration", body),
    text,
  };
}

/**
 * Sent to a store's owner when someone is turned away because the store has
 * been archived.
 *
 * Addressed to the owner rather than whoever attempted the sign-in: staff
 * cannot do anything about an archived store, and telling them why would
 * leak the store's account status to anyone who guesses an email.
 */
export function storeArchivedEmail(params: {
  ownerName: string;
  storeName: string;
  appName: string;
  attemptedBy?: string | null;
}) {
  const { ownerName, storeName, appName, attemptedBy } = params;

  const body = `
    <p style="margin-top: 0;">Hi ${ownerName},</p>

    <p><strong>${storeName}</strong> is currently <strong>archived</strong>, so
    nobody at the store can sign in.</p>

    ${
      attemptedBy
        ? `<p style="font-size: 13px; color: #6b7280;">Someone tried to sign in just now (${attemptedBy}) and was turned away.</p>`
        : ""
    }

    <div style="padding: 14px 16px; background: #fffbeb; border-left: 3px solid #d97706; border-radius: 0 6px 6px 0;">
      <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.6;">
        <strong>Your data has not been deleted.</strong> Everything stays exactly
        as it was and returns the moment the store is restored.
      </p>
    </div>

    <p style="margin-bottom: 0;">To have ${storeName} restored, please contact
    the ${appName} team. Reply to this address and they will pick it up.</p>
  `;

  const text = [
    `Hi ${ownerName},`,
    "",
    `${storeName} is currently archived, so nobody at the store can sign in.`,
    ...(attemptedBy ? ["", `Someone tried to sign in just now (${attemptedBy}) and was turned away.`] : []),
    "",
    "Your data has not been deleted. Everything stays as it was and returns the moment the store is restored.",
    "",
    `To have ${storeName} restored, please contact the ${appName} team.`,
  ].join("\n");

  return {
    subject: `${storeName} is archived — action needed`,
    html: wrapEmail(storeName, "Your store is archived", body),
    text,
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
