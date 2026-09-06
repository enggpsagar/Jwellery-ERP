import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import {
  TICKET_ATTACHMENT_ALLOWED_TYPES,
  validateTicketAttachment,
} from "@/lib/ticket-attachments";

/**
 * Mints short-lived client tokens for support-ticket attachment uploads.
 * Deliberately reachable by anonymous, unauthenticated visitors — ticket
 * submission itself is anonymous-accessible from the public Contact Us form
 * (see submitPublicSupportTicket in lib/actions/support-ticket-actions.ts,
 * and middleware.ts's matcher, which excludes /api entirely from its auth
 * check). There is no other capability here to gate: this route only ever
 * issues a token constrained to an allowed content type and a maximum size,
 * it never touches the database or reads any file's bytes itself — the
 * actual file goes straight from the browser to Vercel Blob storage,
 * bypassing this server (and its serverless body-size limit) entirely.
 *
 * Uses the client-upload flow (`handleUpload` here + `@vercel/blob/client`'s
 * `upload()` in the browser) rather than the `put()`-through-a-route-handler
 * pattern the other upload routes in this app use (app/api/store/logo,
 * app/api/platform-content/image, app/api/payments/upload) — those all cap
 * at 2MB, well under Vercel's serverless request-body limit; a screen
 * recording here can be up to 100MB, so the file must never pass through
 * this handler's own request body.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // clientPayload carries the file's declared name/type/size (set by
        // the browser before the token is requested) — re-validated here
        // since this is the actual security boundary; the client-side check
        // in the picker is only ever fast feedback, not enforcement.
        let declared: { mimeType?: string; size?: number } = {};
        try {
          declared = clientPayload ? JSON.parse(clientPayload) : {};
        } catch {
          declared = {};
        }

        if (
          typeof declared.mimeType !== "string" ||
          typeof declared.size !== "number"
        ) {
          throw new Error("Missing file metadata for upload validation.");
        }

        const validationError = validateTicketAttachment({
          mimeType: declared.mimeType,
          size: declared.size,
        });
        if (validationError) {
          throw new Error(validationError);
        }

        return {
          allowedContentTypes: [...TICKET_ATTACHMENT_ALLOWED_TYPES],
          maximumSizeInBytes: declared.size,
          addRandomSuffix: true,
          // pathname is built client-side as
          // `support-tickets/{ticketId or "new"}/{timestamp}-{filename}` —
          // nothing server-generated to merge in here.
        };
      },
      // No onUploadCompleted needed: the blob URL/metadata is returned to
      // the browser by `upload()` directly and carried into the surrounding
      // form's hidden fields, then persisted by the server action that
      // creates the SupportTicketMessage row — there's no async webhook gap
      // to reconcile here.
    });

    return Response.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
