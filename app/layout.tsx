import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
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

// Better Stack's browser (RUM) monitoring — a different product/token from
// BETTER_STACK_SOURCE_TOKEN in lib/logger.ts, which ships *server-side* logs.
// This one is a public client-side identifier (safe to sit in page HTML,
// same as a GA tracking ID), so it's fine that it ends up in the rendered
// markup — it's still read from an env var rather than hardcoded so it can
// be rotated/omitted per environment without a code change. Absent in an
// environment without the var set, so local dev doesn't report to it.
const betterStackRumToken = process.env.BETTERSTACK_RUM_TOKEN;
const betterStackEnvironment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

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
      {betterStackRumToken && (
        <Script
          id="betterstack-rum"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(b,e,t,r){
                b[t]=b[t]||function(...args){(b[t].q=b[t].q||[]).push(args)};
                b[t].l=+new Date;
                var s=e.createElement('script'); s.async=1; s.crossOrigin='anonymous';
                s.src='https://betterstack.net/b.js?t='+r;
                (e.head||e.getElementsByTagName('head')[0]).appendChild(s);
              }(window,document,'betterstack','${betterStackRumToken}');
              betterstack('init', { environment: '${betterStackEnvironment}' });
            `,
          }}
        />
      )}
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
