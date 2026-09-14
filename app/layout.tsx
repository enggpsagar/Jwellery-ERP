import "./globals.css";
import type { Metadata } from "next";
import {
  Inter,
  Roboto,
  Poppins,
  Merriweather,
  Playfair_Display,
  Lato,
  Montserrat,
  Nunito,
  Open_Sans,
  Raleway,
  Work_Sans,
  Oswald,
} from "next/font/google";
import Script from "next/script";
import { getServerSession } from "next-auth";

import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/providers/toast-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { NumberInputWheelGuard } from "@/components/providers/number-input-wheel-guard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/constants/app";
import { authOptions } from "@/lib/auth/auth-options";

// One plain sans for everything, headings included — matches the clean,
// utilitarian look of business apps like Vyapar. Previously paired with
// Playfair Display for a "premium jewellery" serif-heading look; that
// pairing is gone, --font-heading in globals.css now just points back at
// this same font. Still the app's un-customized default: --font-sans is
// set to this on <html> below, exactly as before this file grew the five
// fonts under it.
const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

// The rest of the curated Branding font picker (see lib/actions/
// branding-actions.ts's BrandFontFamily) — each under its own distinct CSS
// variable, never touching --font-sans itself. All twelve load
// unconditionally (a store's font choice can't gate what's fetched at the
// root layout, which renders before any store context exists), but
// next/font/google self-hosts and subsets these at build time, so this is a
// fixed, small asset cost, not a runtime fetch per visitor. The (dashboard)
// layout picks one of these by overriding --font-sans to point at it for
// that store's own pages only.
const robotoFont = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-roboto" });
const poppinsFont = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins" });
const merriweatherFont = Merriweather({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-merriweather" });
const playfairFont = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const latoFont = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-lato" });
const montserratFont = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const nunitoFont = Nunito({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-nunito" });
const openSansFont = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans" });
const ralewayFont = Raleway({ subsets: ["latin"], variable: "--font-raleway" });
const workSansFont = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans" });
const oswaldFont = Oswald({ subsets: ["latin"], variable: "--font-oswald" });

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
      className={cn(
        "font-sans",
        bodyFont.variable,
        robotoFont.variable,
        poppinsFont.variable,
        merriweatherFont.variable,
        playfairFont.variable,
        latoFont.variable,
        montserratFont.variable,
        nunitoFont.variable,
        openSansFont.variable,
        ralewayFont.variable,
        workSansFont.variable,
        oswaldFont.variable,
      )}
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
        <NumberInputWheelGuard />
        <SessionProvider session={session}>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
