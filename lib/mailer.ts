import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

export type MailAttachment = {
  filename: string;
  /** File bytes, base64-encoded — matches what `lib/excel-export.ts` returns. */
  contentBase64: string;
  contentType?: string;
};

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
};

export type SendMailResult = { sent: boolean; message: string };

/**
 * Best-effort email send. Callers should never let a failed/skipped send
 * block the primary action (user created, invoice recorded, etc.) — check
 * `sent` only to relay a status toast, not to fail the whole operation.
 */
export async function sendMail({
  to,
  subject,
  html,
  text,
  attachments,
}: SendMailInput): Promise<SendMailResult> {
  if (!to) {
    return { sent: false, message: "No recipient email on file." };
  }

  const client = getTransporter();

  if (!client) {
    console.warn(
      "sendMail skipped: SMTP_HOST/SMTP_USER/SMTP_PASS not configured.",
    );
    return { sent: false, message: "Email is not configured for this server." };
  }

  try {
    await client.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, " "),
      attachments: attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.contentBase64, "base64"),
        contentType: attachment.contentType,
      })),
    });

    return { sent: true, message: `Email sent to ${to}` };
  } catch (error) {
    console.error("sendMail error:", error);
    return { sent: false, message: "Failed to send email. Please try again." };
  }
}
