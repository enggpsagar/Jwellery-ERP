// File: lib/actions/support-ticket-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { UserRole, TicketStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAuth, requireRole } from "@/lib/auth/auth";
import { getEffectiveStoreId } from "@/lib/store-context";
import { sendMail } from "@/lib/mailer";
import { getSuperAdminEmails } from "@/lib/super-admin";
import { APP_NAME } from "@/lib/constants/app";
import { sanitizeTicketHtml } from "@/lib/sanitize-html";
import { validateTicketAttachment } from "@/lib/ticket-attachments";
import {
  newSupportTicketEmail,
  supportTicketReplyEmail,
} from "@/lib/email-templates";

/**
 * The "Contact Us becomes a support ticket" workflow — see
 * prisma/schema.prisma's doc comments on SupportTicket/SupportTicketMessage
 * for the shape, and the module doc comment on
 * lib/actions/platform-content-actions.ts for the sibling read-only content
 * this sits alongside.
 *
 * Two entry points create a ticket (submitPublicSupportTicket for the
 * unauthenticated /contact page, submitAuthenticatedSupportTicket for the
 * signed-in app's /contact-faq page); everything after that — reading,
 * replying, changing status — is shared, gated by the same rule everywhere:
 * a caller may act on a ticket only if they ARE a SUPER_ADMIN or they ARE
 * the ticket's own submittedById. Never trust the UI to have hidden a
 * button; every function below re-checks this itself.
 */

function isHtmlEmpty(html: string): boolean {
  return html.replace(/<[^>]+>/g, "").trim().length === 0;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Same 10-digit rule as profile-security-actions.ts's isValidPhone — kept as
// its own local copy rather than a shared import, matching that module's own
// choice not to export it.
function isValidPhone(phone: string) {
  return /^\d{10}$/.test(phone);
}

function baseUrl() {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

/**
 * `TKT-{YYYYMMDD}-{HHMM}-{padded daily sequence}`, e.g. `TKT-20260903-1745-0003`
 * — unlike every other numbered document in this app (see e.g.
 * generateInvoiceNumber in invoice-actions.ts, generateQuotationNumber in
 * quotation-actions.ts, which are just `{prefix}-{year}-{padded count}`), a
 * ticket ID needs to be readable at a glance without opening it — when it
 * was raised, not just its position in a yearly count — so the date and
 * time it was created are encoded directly into the number itself. The
 * trailing sequence (reset daily, via the same startsWith-then-count
 * approach every sibling numbering function already uses, same
 * no-explicit-locking tradeoff) exists only to keep two tickets filed in
 * the same minute unique; it isn't meant to be read as "the Nth ticket
 * ever." Counted across every store rather than one: a SupportTicket is
 * platform-wide, not per-store (see its own doc comment in
 * prisma/schema.prisma).
 */
async function generateTicketNumber() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const timePart = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const prefix = `TKT-${datePart}-`;
  const count = await prisma.supportTicket.count({
    where: { ticketNumber: { startsWith: prefix } },
  });
  return `${prefix}${timePart}-${String(count + 1).padStart(4, "0")}`;
}

export type SupportTicketFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

export type TicketMessageRow = {
  id: string;
  authorName: string;
  isFromSuperAdmin: boolean;
  body: string;
  createdAt: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
};

/** The four optional attachment fields, as persisted on SupportTicketMessage. */
type TicketAttachmentFields = {
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
};

/**
 * Reads the attachment fields a client populates as hidden form fields
 * after its direct-to-Blob upload completes (see
 * app/api/support-tickets/upload/route.ts and the file-picker wiring in
 * support-ticket-form.tsx / ticket-reply-form.tsx). All four are optional —
 * a message with no attachment omits them entirely, same as today.
 *
 * Re-validates mimeType/size here too: the upload route is the real
 * enforcement boundary for what actually lands in Blob storage, but nothing
 * stops a crafted POST straight at this server action from attaching
 * arbitrary metadata to a message. Rather than failing the whole
 * submission over a bad attachment, invalid/incomplete attachment data is
 * silently dropped and the message is still created without one.
 */
function readAttachmentFields(formData: FormData): TicketAttachmentFields {
  const url = String(formData.get("attachmentUrl") || "").trim();
  const name = String(formData.get("attachmentName") || "").trim();
  const mimeType = String(formData.get("attachmentMimeType") || "").trim();
  const sizeRaw = String(formData.get("attachmentSize") || "").trim();
  const size = sizeRaw ? Number(sizeRaw) : NaN;

  if (!url || !name || !mimeType || !Number.isFinite(size)) {
    return { attachmentUrl: null, attachmentName: null, attachmentMimeType: null, attachmentSize: null };
  }

  if (validateTicketAttachment({ mimeType, size })) {
    return { attachmentUrl: null, attachmentName: null, attachmentMimeType: null, attachmentSize: null };
  }

  return { attachmentUrl: url, attachmentName: name, attachmentMimeType: mimeType, attachmentSize: size };
}

export type SupportTicketRow = {
  id: string;
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  storeName: string | null;
  submitterName: string;
  submitterEmail: string;
  submitterPhone: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
};

export type SupportTicketDetail = SupportTicketRow & {
  messages: TicketMessageRow[];
};

const TICKET_LIST_SELECT = {
  id: true,
  ticketNumber: true,
  subject: true,
  status: true,
  submitterName: true,
  submitterEmail: true,
  submitterPhone: true,
  createdAt: true,
  lastMessageAt: true,
  store: { select: { name: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketSelect;

type TicketListRow = Prisma.SupportTicketGetPayload<{
  select: typeof TICKET_LIST_SELECT;
}>;

function toTicketRow(ticket: TicketListRow): SupportTicketRow {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    status: ticket.status,
    storeName: ticket.store?.name ?? null,
    submitterName: ticket.submitterName,
    submitterEmail: ticket.submitterEmail,
    submitterPhone: ticket.submitterPhone,
    createdAt: ticket.createdAt.toISOString(),
    lastMessageAt: ticket.lastMessageAt.toISOString(),
    messageCount: ticket._count.messages,
  };
}

function toMessageRow(message: {
  id: string;
  authorName: string;
  isFromSuperAdmin: boolean;
  body: string;
  createdAt: Date;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
}): TicketMessageRow {
  return {
    id: message.id,
    authorName: message.authorName,
    isFromSuperAdmin: message.isFromSuperAdmin,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    attachmentUrl: message.attachmentUrl,
    attachmentName: message.attachmentName,
    attachmentMimeType: message.attachmentMimeType,
    attachmentSize: message.attachmentSize,
  };
}

/** Best-effort — a notification failure must never fail the ticket action itself. */
async function notifySuperAdminsOfNewTicket(params: {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  submitterName: string;
  submitterEmail: string;
  submitterPhone: string;
  storeName: string | null;
  messageHtml: string;
  attachment?: { name: string; url: string } | null;
}) {
  try {
    const recipients = getSuperAdminEmails();
    if (recipients.length === 0) return;

    const mail = newSupportTicketEmail({
      appName: APP_NAME,
      ticketNumber: params.ticketNumber,
      subject: params.subject,
      submitterName: params.submitterName,
      submitterEmail: params.submitterEmail,
      submitterPhone: params.submitterPhone,
      storeName: params.storeName,
      messageHtml: params.messageHtml,
      viewUrl: `${baseUrl()}/support-tickets/${params.ticketId}`,
      attachment: params.attachment,
    });

    await Promise.all(
      recipients.map((to) =>
        sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text }),
      ),
    );
  } catch (error) {
    console.error("notifySuperAdminsOfNewTicket error:", error);
  }
}

/** Best-effort notification to the submitter that a Super Admin replied. */
async function notifySubmitterOfReply(params: {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  submitterName: string;
  submitterEmail: string;
  messageHtml: string;
  attachment?: { name: string; url: string } | null;
}) {
  try {
    const mail = supportTicketReplyEmail({
      appName: APP_NAME,
      ticketNumber: params.ticketNumber,
      subject: params.subject,
      recipientName: params.submitterName,
      replierLabel: "The Support Team",
      messageHtml: params.messageHtml,
      viewUrl: `${baseUrl()}/contact-faq?ticket=${params.ticketId}`,
      attachment: params.attachment,
    });

    await sendMail({
      to: params.submitterEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (error) {
    console.error("notifySubmitterOfReply error:", error);
  }
}

/** Best-effort notification to every Super Admin that a submitter replied. */
async function notifySuperAdminsOfReply(params: {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  submitterName: string;
  messageHtml: string;
  attachment?: { name: string; url: string } | null;
}) {
  try {
    const recipients = getSuperAdminEmails();
    if (recipients.length === 0) return;

    const mail = supportTicketReplyEmail({
      appName: APP_NAME,
      ticketNumber: params.ticketNumber,
      subject: params.subject,
      recipientName: "Team",
      replierLabel: params.submitterName,
      messageHtml: params.messageHtml,
      viewUrl: `${baseUrl()}/support-tickets/${params.ticketId}`,
      attachment: params.attachment,
    });

    await Promise.all(
      recipients.map((to) =>
        sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text }),
      ),
    );
  } catch (error) {
    console.error("notifySuperAdminsOfReply error:", error);
  }
}

/**
 * Validates the four fields both submission forms share. Returns field
 * errors keyed the same way platform-content-actions.ts does, so both forms
 * render errors the same way the rest of the app already does.
 */
function validateTicketFields(fields: {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}) {
  const errors: Record<string, string[]> = {};

  if (!fields.name) errors.name = ["Name is required"];
  if (!fields.email) {
    errors.email = ["Email is required"];
  } else if (!isValidEmail(fields.email)) {
    errors.email = ["Enter a valid email address"];
  }
  if (!fields.phone) {
    errors.phone = ["Phone number is required"];
  } else if (!isValidPhone(fields.phone)) {
    errors.phone = ["Enter a valid 10-digit phone number"];
  }
  if (!fields.subject) errors.subject = ["Subject is required"];
  if (isHtmlEmpty(fields.message)) errors.message = ["Please describe your question or issue"];

  return errors;
}

/**
 * Public, unauthenticated Contact Us submission (app/contact/page.tsx). No
 * session, so name/email/phone are exactly what the visitor typed — there is
 * no account to attribute this to, and no way for this visitor to log back
 * in and see a reply (see the module doc comment / CLAUDE-facing report for
 * why that's an accepted limitation rather than a gap to fix).
 */
export async function submitPublicSupportTicket(
  prevState: SupportTicketFormState,
  formData: FormData,
): Promise<SupportTicketFormState> {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  // Sanitized immediately — this is the one HTML field in this app a fully
  // unauthenticated party can submit (see lib/sanitize-html.ts).
  const message = sanitizeTicketHtml(String(formData.get("message") || "").trim());
  const attachmentFields = readAttachmentFields(formData);

  const errors = validateTicketFields({ name, email, phone, subject, message });
  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Please fix the form errors", errors };
  }

  try {
    const ticketNumber = await generateTicketNumber();

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject,
        submitterName: name,
        submitterEmail: email,
        submitterPhone: phone,
        messages: {
          create: {
            authorName: name,
            isFromSuperAdmin: false,
            body: message,
            ...attachmentFields,
          },
        },
      },
    });

    await notifySuperAdminsOfNewTicket({
      ticketId: ticket.id,
      ticketNumber,
      subject,
      submitterName: name,
      submitterEmail: email,
      submitterPhone: phone,
      storeName: null,
      messageHtml: message,
      attachment: attachmentFields.attachmentUrl
        ? { name: attachmentFields.attachmentName!, url: attachmentFields.attachmentUrl }
        : null,
    });

    revalidatePath("/support-tickets");

    return {
      success: true,
      message: "Thanks — your message has been received. We'll get back to you at the email you provided.",
    };
  } catch (error) {
    console.error("submitPublicSupportTicket error:", error);
    return { success: false, message: "Failed to submit your message. Please try again." };
  }
}

/**
 * Authenticated Contact Us submission (app/(dashboard)/contact-faq/page.tsx)
 * — reachable by every signed-in role including KARIGAR (see
 * KARIGAR_ALLOWED_PREFIXES in middleware.ts, which already allowlists
 * /contact-faq). Attributed to the real signed-in user and their current
 * store; email/phone are still real form fields (pre-filled from the
 * user's own profile by the caller, not silently derived here) because a
 * signed-in user with no email or no phone on file must be prompted to
 * supply one, not have the ticket silently created without it.
 */
export async function submitAuthenticatedSupportTicket(
  prevState: SupportTicketFormState,
  formData: FormData,
): Promise<SupportTicketFormState> {
  const user = await requireAuth();

  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const message = sanitizeTicketHtml(String(formData.get("message") || "").trim());
  const name = user.name || "User";
  const attachmentFields = readAttachmentFields(formData);

  const errors = validateTicketFields({ name, email, phone, subject, message });
  if (Object.keys(errors).length > 0) {
    return { success: false, message: "Please fix the form errors", errors };
  }

  try {
    const storeId = await getEffectiveStoreId();
    const ticketNumber = await generateTicketNumber();

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject,
        storeId,
        submittedById: user.id,
        submitterName: name,
        submitterEmail: email,
        submitterPhone: phone,
        messages: {
          create: {
            authorId: user.id,
            authorName: name,
            // The submission itself is always the submitter's own side of
            // the conversation, never a "support reply" — even when the
            // submitter happens to be a SUPER_ADMIN filing their own ticket.
            isFromSuperAdmin: false,
            body: message,
            ...attachmentFields,
          },
        },
      },
      select: { id: true, store: { select: { name: true } } },
    });

    await notifySuperAdminsOfNewTicket({
      ticketId: ticket.id,
      ticketNumber,
      subject,
      submitterName: name,
      submitterEmail: email,
      submitterPhone: phone,
      storeName: ticket.store?.name ?? null,
      messageHtml: message,
      attachment: attachmentFields.attachmentUrl
        ? { name: attachmentFields.attachmentName!, url: attachmentFields.attachmentUrl }
        : null,
    });

    revalidatePath("/contact-faq");
    revalidatePath("/support-tickets");

    return {
      success: true,
      message: "Your ticket has been submitted. You can track its status below.",
    };
  } catch (error) {
    console.error("submitAuthenticatedSupportTicket error:", error);
    return { success: false, message: "Failed to submit your ticket. Please try again." };
  }
}

/** Every ticket the signed-in user has submitted, most recent activity first. */
export async function getMyTickets(): Promise<SupportTicketRow[]> {
  const user = await requireAuth();

  const tickets = await prisma.supportTicket.findMany({
    where: { submittedById: user.id },
    orderBy: { lastMessageAt: "desc" },
    select: TICKET_LIST_SELECT,
  });

  return tickets.map(toTicketRow);
}

/**
 * One ticket's full thread, for the submitter's own "My Tickets" view.
 * Gate: the caller must be the ticket's own submitter (a SUPER_ADMIN uses
 * getSupportTicketForAdmin instead — kept as a separate function rather than
 * branching here, so each call site's permission story stays a straight
 * line to read).
 */
export async function getMyTicketThread(ticketId: string): Promise<SupportTicketDetail | null> {
  const user = await requireAuth();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      ...TICKET_LIST_SELECT,
      submittedById: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) return null;
  if (ticket.submittedById !== user.id) {
    throw new Error("Forbidden");
  }

  return { ...toTicketRow(ticket), messages: ticket.messages.map(toMessageRow) };
}

/** Every ticket across every store — SUPER_ADMIN's support inbox. */
export async function getAllSupportTickets(params: {
  status?: TicketStatus;
} = {}): Promise<SupportTicketRow[]> {
  await requireRole(UserRole.SUPER_ADMIN);

  const tickets = await prisma.supportTicket.findMany({
    where: params.status ? { status: params.status } : undefined,
    orderBy: { lastMessageAt: "desc" },
    select: TICKET_LIST_SELECT,
  });

  return tickets.map(toTicketRow);
}

/** One ticket's full thread, for the SUPER_ADMIN inbox's detail view. */
export async function getSupportTicketForAdmin(ticketId: string): Promise<SupportTicketDetail | null> {
  await requireRole(UserRole.SUPER_ADMIN);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      ...TICKET_LIST_SELECT,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) return null;

  return { ...toTicketRow(ticket), messages: ticket.messages.map(toMessageRow) };
}

/**
 * Reply into a ticket's thread — the one action both a SUPER_ADMIN and the
 * ticket's own submitter can call, which is exactly what makes this a real
 * two-way thread rather than a one-way "admin responds, user only reads"
 * ticket system. Every other caller is rejected here, not just hidden from
 * the UI.
 *
 * Status auto-transitions on a reply (see TicketStatus's own doc comment):
 * a Super Admin reply on an OPEN ticket moves it to IN_PROGRESS; a
 * submitter reply on a RESOLVED/CLOSED ticket reopens it to OPEN. Any other
 * status change is explicit, via updateSupportTicketStatus.
 */
export async function replySupportTicket(
  prevState: SupportTicketFormState,
  formData: FormData,
): Promise<SupportTicketFormState> {
  try {
    const user = await requireAuth();
    const ticketId = String(formData.get("ticketId") || "").trim();
    const body = sanitizeTicketHtml(String(formData.get("body") || "").trim());
    const attachmentFields = readAttachmentFields(formData);

    if (!ticketId) return { success: false, message: "Ticket not found" };
    if (isHtmlEmpty(body)) {
      return {
        success: false,
        message: "Please fix the form errors",
        errors: { body: ["Enter a reply before sending"] },
      };
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        submittedById: true,
        submitterName: true,
        submitterEmail: true,
      },
    });

    if (!ticket) return { success: false, message: "Ticket not found" };

    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN;
    const isOwnTicket = ticket.submittedById === user.id;

    // The one gate this whole feature depends on: SUPER_ADMIN, or the
    // ticket's own submitter — nobody else, regardless of what the UI shows.
    if (!isSuperAdmin && !isOwnTicket) {
      return { success: false, message: "You do not have access to this ticket." };
    }

    // A SUPER_ADMIN replying to their OWN ticket is acting as the submitter,
    // not as support — see submitAuthenticatedSupportTicket's own comment
    // for why the two must stay distinguishable in the thread UI.
    const isFromSuperAdmin = isSuperAdmin && !isOwnTicket;

    const nextStatus: TicketStatus | undefined = isFromSuperAdmin
      ? ticket.status === TicketStatus.OPEN
        ? TicketStatus.IN_PROGRESS
        : undefined
      : ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED
        ? TicketStatus.OPEN
        : undefined;

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: new Date(),
        ...(nextStatus ? { status: nextStatus } : {}),
        messages: {
          create: {
            authorId: user.id,
            authorName: user.name || (isFromSuperAdmin ? "Support Team" : "User"),
            isFromSuperAdmin,
            body,
            ...attachmentFields,
          },
        },
      },
    });

    const attachment = attachmentFields.attachmentUrl
      ? { name: attachmentFields.attachmentName!, url: attachmentFields.attachmentUrl }
      : null;

    if (isFromSuperAdmin) {
      await notifySubmitterOfReply({
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        submitterName: ticket.submitterName,
        submitterEmail: ticket.submitterEmail,
        messageHtml: body,
        attachment,
      });
    } else {
      await notifySuperAdminsOfReply({
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        submitterName: ticket.submitterName,
        messageHtml: body,
        attachment,
      });
    }

    revalidatePath("/support-tickets");
    revalidatePath(`/support-tickets/${ticketId}`);
    revalidatePath("/contact-faq");

    return { success: true, message: "Reply sent" };
  } catch (error) {
    console.error("replySupportTicket error:", error);
    return { success: false, message: "Failed to send your reply. Please try again." };
  }
}

/** SUPER_ADMIN-only: change a ticket's status without necessarily replying. */
export async function updateSupportTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<SupportTicketFormState> {
  try {
    await requireRole(UserRole.SUPER_ADMIN);

    if (!Object.values(TicketStatus).includes(status)) {
      return { success: false, message: "Invalid status" };
    }

    const updated = await prisma.supportTicket.updateMany({
      where: { id: ticketId },
      data: { status },
    });

    if (updated.count === 0) {
      return { success: false, message: "Ticket not found" };
    }

    revalidatePath("/support-tickets");
    revalidatePath(`/support-tickets/${ticketId}`);
    revalidatePath("/contact-faq");

    return { success: true, message: "Status updated" };
  } catch (error) {
    console.error("updateSupportTicketStatus error:", error);
    return { success: false, message: "Failed to update status" };
  }
}

/**
 * The signed-in user's own name/email/phone, to pre-fill the authenticated
 * Contact Us form — still editable, and still validated server-side in
 * submitAuthenticatedSupportTicket, so a user with no email or phone on file
 * is prompted to enter one rather than silently allowed to skip it.
 */
export async function getMyContactDefaults(): Promise<{
  name: string;
  email: string;
  phone: string;
}> {
  const user = await getCurrentUser();
  return {
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
  };
}
