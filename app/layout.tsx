import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";

import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/providers/toast-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/constants/app";
import { authOptions } from "@/lib/auth/auth-options";

// One plain sans for everything, headings included — matches the clean,
// utilitarian look of business apps like Vyapar. Previously paired with
// Playfair Display for a "premium jewellery" serif-heading look; that
// pairing is gone, --font-heading in globals.css now just points back at
// this same font.
const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
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
      className={cn("font-sans", bodyFont.variable)}
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
