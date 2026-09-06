import "./globals.css";
import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { getServerSession } from "next-auth";

import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/providers/toast-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/constants/app";
import { authOptions } from "@/lib/auth/auth-options";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <html
      lang="en"
      className={cn("font-sans", bodyFont.variable, headingFont.variable)}
    >
      <body>
        <SessionProvider session={session}>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
