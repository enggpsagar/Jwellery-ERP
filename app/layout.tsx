import "./globals.css";
import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";

import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/providers/toast-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/constants/app";

// Inter (body) + Playfair Display (headings) — the premium-jewellery pairing
// behind the app-wide theme in globals.css: a warm, high-contrast serif for
// titles reads as considered/high-end without touching dense UI text (forms,
// tables), which stays in the plain, highly-legible sans throughout.
const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const headingFont = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-heading-serif",
});

export const metadata: Metadata = {
  title: {
    template: `%s · ${APP_NAME}`,
    default: APP_NAME,
  },
  description: "Admin dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("font-sans", bodyFont.variable, headingFont.variable)}
    >
      <body>
        <SessionProvider>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
