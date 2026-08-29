// File: app/(auth)/login/page.tsx

"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Gem } from "lucide-react";

import { APP_NAME } from "@/lib/constants/app";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

import { safeReturnTo } from "@/lib/safe-return-to";

type Mode = "phone" | "email";

type Notice = { tone: "error" | "info"; title: string; body: string };

/**
 * Why a sign-in was refused, in words the person reading them can act on.
 *
 * Keyed by the codes the signIn callback redirects with. Without these every
 * refusal arrives as a bare "AccessDenied" and the user is left guessing
 * whether they typed something wrong, their account is off, or the shop
 * itself is closed.
 */
const SIGN_IN_NOTICES: Record<string, Notice> = {
  store_archived: {
    tone: "error",
    title: "This store is archived",
    body:
      "Nobody at the store can sign in while it stays archived. Your data has not been deleted — it all returns once the store is restored. We have emailed your store owner; please contact them or the application owner to have it reopened.",
  },
  account_disabled: {
    tone: "error",
    title: "Your account is disabled",
    body:
      "This account cannot sign in at the moment. Ask your store owner to re-enable it, then try again.",
  },
  plan_expired: {
    tone: "error",
    title: "This store's plan has expired",
    body:
      "Sign-in is paused until the plan is renewed. Contact the application owner to renew or upgrade, and everything returns exactly as it was.",
  },
  CredentialsSignin: {
    tone: "error",
    title: "That code did not work",
    body: "Check the one-time code and try again, or request a new one.",
  },
  AccessDenied: {
    tone: "error",
    title: "You cannot sign in right now",
    body:
      "Your account or store may be inactive. Contact your store owner, or the application owner if the whole shop is affected.",
  },
};

function noticeFor(code: string | null | undefined): Notice | null {
  if (!code) return null;

  return (
    SIGN_IN_NOTICES[code] ?? {
      tone: "error",
      // A message thrown by the OTP path arrives here verbatim, so an
      // unrecognised code is far more likely to be a real sentence than a
      // symbol — show it rather than swallowing it.
      title: "Could not sign you in",
      body: /^[A-Za-z_]+$/.test(code)
        ? "Please try again, or contact your store owner if this keeps happening."
        : code,
    }
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("phone");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Where to go once signed in. Middleware puts the blocked path in
  // `callbackUrl`, and honouring it is what makes a scanned QR work on a
  // phone: without it every scan that hits the login wall lands on the
  // dashboard, and the tag the counter just scanned is lost.
  //
  // Sanitised before use — it comes from the query string, so an attacker
  // could otherwise hand someone a login link that redirects off-site.
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");

  // Read straight off the URL rather than through useSearchParams, which
  // would force this page dynamic and require a Suspense boundary around it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const code = params.get("error");
    if (code) setNotice(noticeFor(code));

    const target = safeReturnTo(params.get("callbackUrl"));
    // The login page itself is a valid same-origin path but a redirect loop.
    if (target && !target.startsWith("/login")) setCallbackUrl(target);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setIdentifier("");
    setOtp("");
    setOtpSent(false);
  }

  async function sendOTP() {
    if (!identifier) {
      alert(mode === "phone" ? "Please enter your mobile number." : "Please enter your email.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mode === "phone" ? { phone: identifier } : { email: identifier }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error ?? "Failed to send OTP.");
        return;
      }

      setOtpSent(true);
      alert("OTP sent successfully.");
    } catch {
      alert("Unable to send OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function loginWithOTP() {
    if (!identifier || !otp) {
      alert(mode === "phone" ? "Please enter both mobile number and OTP." : "Please enter both email and OTP.");
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      // `redirect: false` so the refusal comes back as a value. With
      // `redirect: true` NextAuth navigates away and the reason — including
      // the archived-store message thrown server-side — is lost.
      const result = await signIn("credentials", {
        ...(mode === "phone" ? { phone: identifier } : { email: identifier }),
        otp,
        redirect: false,
      });

      if (result?.error) {
        setNotice(noticeFor(result.error));
        return;
      }

      window.location.href = callbackUrl;
    } catch {
      setNotice(noticeFor("AccessDenied"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">
        {/* The way back out. Sitting above the card rather than inside it so
            it reads as site chrome, not a form control — someone who landed
            here by mistake needs an exit that isn't the browser button. */}
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] text-white">
            <Gem className="size-5" />
          </span>
          <span className="text-left leading-tight">
            <span className="block font-semibold">{APP_NAME}</span>
            <span className="block text-[11px] text-muted-foreground">
              Jewellery ERP
            </span>
          </span>
        </Link>

        <div className="rounded-xl border bg-card p-6 shadow-sm">

        <h1 className="text-2xl font-semibold">
          Sign in
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Login using Google, your registered mobile number, or email.
        </p>

        {notice && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
          >
            <div className="flex gap-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  {notice.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-destructive/90">
                  {notice.body}
                </p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() =>
            signIn("google", {
              callbackUrl,
            })
          }
          className="mt-6 w-full rounded-md border px-4 py-2 font-medium transition-colors hover:bg-accent"
        >
          Continue with Google
        </button>

        <div className="my-6 text-center text-sm text-muted-foreground">
          ───── OR ─────
        </div>

        <div className="mb-4 flex rounded-md border p-0.5 text-sm">
          <button
            type="button"
            onClick={() => switchMode("phone")}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              mode === "phone" ? "bg-[var(--chart-2)] text-white" : "text-muted-foreground"
            }`}
          >
            Mobile Number
          </button>
          <button
            type="button"
            onClick={() => switchMode("email")}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              mode === "email" ? "bg-[var(--chart-2)] text-white" : "text-muted-foreground"
            }`}
          >
            Email
          </button>
        </div>

        <div className="space-y-4">

          <div>
            <label className="mb-1 block text-sm font-medium">
              {mode === "phone" ? "Mobile Number" : "Email"}
            </label>

            <input
              type={mode === "phone" ? "tel" : "email"}
              placeholder={mode === "phone" ? "9876543210" : "you@example.com"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
            />
          </div>

          {!otpSent ? (
            <button
              onClick={sendOTP}
              disabled={loading}
              className="w-full rounded-md bg-[var(--chart-2)] text-white transition-colors hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] px-4 py-2 font-medium"
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Enter OTP
                </label>

                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>

              <button
                onClick={loginWithOTP}
                className="w-full rounded-md bg-[var(--chart-2)] text-white transition-colors hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] px-4 py-2 font-medium"
              >
                Login
              </button>
            </>
          )}

        </div>

        {/* The way in for a shop that has no account yet. Without this the
            registration page exists but nothing points at it. */}
        <p className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href="/register"
            className="font-medium text-[var(--chart-2)] underline-offset-4 hover:underline"
          >
            Register your store
          </Link>{" "}
          and start a free trial.
        </p>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to site
          </Link>
        </p>
      </div>
    </main>
  );
}
