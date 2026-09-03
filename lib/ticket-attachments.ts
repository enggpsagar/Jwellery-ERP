/**
 * Shared MIME/size rules for a support ticket message's single optional
 * attachment (see prisma/schema.prisma's SupportTicketMessage doc comment).
 * Used both client-side (support-ticket-form.tsx / ticket-reply-form.tsx,
 * for fast feedback before an upload even starts) and server-side
 * (app/api/support-tickets/upload/route.ts's onBeforeGenerateToken, which
 * is the actual security boundary — anyone can call that route directly,
 * so client-side validation alone is not enough).
 */

export const TICKET_ATTACHMENT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const TICKET_ATTACHMENT_PDF_TYPES = ["application/pdf"] as const;

export const TICKET_ATTACHMENT_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const TICKET_ATTACHMENT_ALLOWED_TYPES: readonly string[] = [
  ...TICKET_ATTACHMENT_IMAGE_TYPES,
  ...TICKET_ATTACHMENT_PDF_TYPES,
  ...TICKET_ATTACHMENT_VIDEO_TYPES,
];

const MB = 1024 * 1024;

/** Per-category size caps — screen recordings are large, images/PDFs aren't. */
export const TICKET_ATTACHMENT_SIZE_LIMITS = {
  image: 5 * MB,
  pdf: 10 * MB,
  video: 100 * MB,
} as const;

export type TicketAttachmentKind = "image" | "pdf" | "video";

export function ticketAttachmentKind(mimeType: string): TicketAttachmentKind | null {
  if ((TICKET_ATTACHMENT_IMAGE_TYPES as readonly string[]).includes(mimeType)) return "image";
  if ((TICKET_ATTACHMENT_PDF_TYPES as readonly string[]).includes(mimeType)) return "pdf";
  if ((TICKET_ATTACHMENT_VIDEO_TYPES as readonly string[]).includes(mimeType)) return "video";
  return null;
}

export function ticketAttachmentMaxSize(mimeType: string): number | null {
  const kind = ticketAttachmentKind(mimeType);
  return kind ? TICKET_ATTACHMENT_SIZE_LIMITS[kind] : null;
}

function formatMb(bytes: number) {
  return `${Math.round(bytes / MB)}MB`;
}

/**
 * Validates a file's declared MIME type and size against the rules above.
 * Returns `null` when valid, or a user-facing error message otherwise.
 * Shared by the client-side file picker and the server-side upload route so
 * neither can silently drift from the other.
 */
export function validateTicketAttachment(params: {
  mimeType: string;
  size: number;
}): string | null {
  const kind = ticketAttachmentKind(params.mimeType);
  if (!kind) {
    return "Only images (JPEG, PNG, WebP, GIF), PDF, or video (MP4, WebM, MOV) files are allowed.";
  }

  const maxSize = TICKET_ATTACHMENT_SIZE_LIMITS[kind];
  if (params.size > maxSize) {
    const label = kind === "image" ? "Images" : kind === "pdf" ? "PDF files" : "Videos";
    return `${label} must be under ${formatMb(maxSize)}.`;
  }

  return null;
}
