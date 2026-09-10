"use client";

// Next.js's top-level error boundary — catches errors that (dashboard)/
// error.tsx cannot, because they happen in the root layout itself (e.g. the
// getServerSession call in app/layout.tsx throwing). It replaces the whole
// document when it renders, so it must render its own <html>/<body> rather
// than relying on the root layout's — nothing from that layout (fonts,
// providers) can be assumed to be there.
import { useEffect } from "react";

import { reportClientError } from "@/lib/report-client-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
    reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1.5rem",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#6b7280" }}>
            {error.message || "An unexpected error occurred. Please try again."}
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Error ID: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
