// File: app/(auth)/login/page.tsx

"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Gem } from "lucide-react";

import { APP_NAME } from "@/lib/constants/app";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

import { safeReturnTo } from "@/lib/safe-return-to";

type Mode = "phone" | "email";

// What survives a refresh/revisit — just enough to re-ask the server "where
// was I", never the code itself. Everything else (countdown, attempts
// remaining, lockout) is re-fetched from /api/auth/otp-status on mount, so
// this app is never the source of truth for anything security-relevant.
const OTP_SESSION_KEY = "jwellery-erp-otp-session";

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
  session_expired: {
    tone: "info",
    title: "Your session has expired",
    body: "For security, you're signed out after 24 hours. Please sign in again to continue.",
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

/** "23h 59m" / "5m 12s" / "38s" — precise enough to be useful without
 * ticking a 24-hour countdown down second by second on screen. */
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

type OtpStatus = {
  otpActive: boolean;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  attemptsRemaining: number;
  lockedForSeconds: number;
};

type StoredSession = { mode: Mode; identifier: string };

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(OTP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.identifier && (parsed.mode === "phone" || parsed.mode === "email")) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("phone");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  // One countdown drives both "code still valid for..." and "Resend OTP"
  // becoming available — they're the same window by design (see
  // send-otp/route.ts's RESEND_COOLDOWN_MS comment): a user is never left
  // mid-way through a still-valid code with Resend already tempting them
  // to throw it away, and never left without Resend the moment it expires.
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  // 0 = not locked. Counts down in whole seconds even though the window is
  // 24h, so a page left open through the block clears itself without a
  // manual refresh.
  const [lockedForSeconds, setLockedForSeconds] = useState(0);
  // True only while restoring a persisted session on first mount — avoids
  // flashing the plain "Send OTP" screen for the instant before a refetch
  // reveals there's actually an active code (or a lockout) to show instead.
  const [restoring, setRestoring] = useState(true);

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

  async function fetchStatus(fetchMode: Mode, fetchIdentifier: string) {
    try {
      const query =
        fetchMode === "phone"
          ? `phone=${encodeURIComponent(fetchIdentifier)}`
          : `email=${encodeURIComponent(fetchIdentifier)}`;
      const response = await fetch(`/api/auth/otp-status?${query}`);
      if (!response.ok) return;

      const data: OtpStatus = await response.json();

      setAttemptsRemaining(data.attemptsRemaining);
      setLockedForSeconds(data.lockedForSeconds);

      if (data.lockedForSeconds > 0) {
        setOtpSent(false);
        setSecondsLeft(0);
        return;
      }

      if (data.otpActive) {
        setOtpSent(true);
        setSecondsLeft(data.expiresInSeconds);
      } else {
        // Nothing active and not locked — the persisted session (if any)
        // is stale, and there's nothing left worth restoring.
        setOtpSent(false);
        setSecondsLeft(0);
        clearSession();
      }
    } catch {
      // Best-effort — a failed status check just leaves whatever the UI
      // was already showing; the next real send/verify still enforces
      // everything correctly server-side regardless.
    }
  }

  // Restores an in-progress OTP session — or an active lockout — after a
  // refresh or revisit. Only "which phone/email + channel" ever persists;
  // the numbers themselves always come fresh from the server.
  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setRestoring(false);
      return;
    }

    setMode(stored.mode);
    setIdentifier(stored.identifier);
    fetchStatus(stored.mode, stored.identifier).finally(() => setRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ticks both countdowns down together, one second at a time, whichever
  // is active — a single timer covers "code expires in X" / "Resend
  // available in X" and the 24h lockout alike.
  useEffect(() => {
    if (secondsLeft <= 0 && lockedForSeconds <= 0) return;
    const id = window.setTimeout(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setLockedForSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft, lockedForSeconds]);

  function persistSession(nextMode: Mode, nextIdentifier: string) {
    try {
      window.localStorage.setItem(
        OTP_SESSION_KEY,
        JSON.stringify({ mode: nextMode, identifier: nextIdentifier }),
      );
    } catch {
      // Best-effort — a private window or blocked storage just means this
      // session won't survive a refresh, not that it can't proceed now.
    }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(OTP_SESSION_KEY);
    } catch {
      // Nothing to do — see persistSession's own comment.
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setIdentifier("");
    setOtp("");
    setOtpSent(false);
    setSecondsLeft(0);
    setAttemptsRemaining(null);
    setLockedForSeconds(0);
    setResendNotice(null);
    setNotice(null);
    clearSession();
  }

  // Also the "Resend OTP" handler — same request, sent again. `wasAlreadySent`
  // is read before this call changes anything, so it's the one thing that
  // tells the two apart: whether to show "OTP sent" (first time) or "A new
  // code has been sent" (a resend) once it succeeds.
  async function sendOTP() {
    if (!identifier) {
      alert(mode === "phone" ? "Please enter your mobile number." : "Please enter your email.");
      return;
    }
    if (lockedForSeconds > 0) return;
    if (otpSent && secondsLeft > 0) return;

    const wasAlreadySent = otpSent;
    setLoading(true);
    setResendNotice(null);

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mode === "phone" ? { phone: identifier } : { email: identifier }),
      });

      const data = await response.json();

      if (response.status === 423) {
        // Locked out — the server's own 24h window, keyed off phone/email,
        // not anything this tab already knew.
        setLockedForSeconds(data.lockedForSeconds ?? 24 * 60 * 60);
        setOtpSent(false);
        setResendNotice(data.error);
        return;
      }

      if (response.status === 429) {
        // The server's own cooldown, not just this tab's — could be shorter
        // or longer than what's left here (a second tab, a page refresh).
        setSecondsLeft(data.retryAfterSeconds ?? 60);
        setResendNotice(data.error);
        return;
      }

      if (!response.ok) {
        alert(data.error ?? "Failed to send OTP.");
        return;
      }

      setOtpSent(true);
      setOtp("");
      setSecondsLeft(data.expiresInSeconds ?? 60);
      setAttemptsRemaining(5);
      persistSession(mode, identifier);
      setResendNotice(wasAlreadySent ? "A new code has been sent." : "Code sent — check your messages.");
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

    if (secondsLeft <= 0) {
      setNotice({
        tone: "error",
        title: "This code has expired",
        body: "Request a new one below.",
      });
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
        setOtp("");
        // The real attempts-remaining/lockout numbers live server-side,
        // keyed off phone/email — NextAuth's Credentials provider collapses
        // every otp-auth.ts throw to one generic code here, so they're
        // fetched fresh rather than guessed at from that string.
        await fetchStatus(mode, identifier);
        return;
      }

      clearSession();
      window.location.href = callbackUrl;
    } catch {
      setNotice(noticeFor("AccessDenied"));
    } finally {
      setLoading(false);
    }
  }

  const identifierLabel = mode === "phone" ? "mobile number" : "email";

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

          <div className="rounded-lg transition-colors focus-within:bg-accent/40">
            <label className="mb-1 block text-sm font-medium">
              {mode === "phone" ? "Mobile Number" : "Email"}
            </label>

            <input
              type={mode === "phone" ? "tel" : "email"}
              placeholder={mode === "phone" ? "9876543210" : "you@example.com"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={lockedForSeconds > 0}
              className="w-full rounded-md border px-3 py-2 disabled:bg-muted disabled:text-muted-foreground"
            />
          </div>

          {restoring ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Checking sign-in status…
            </p>
          ) : lockedForSeconds > 0 ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    Too many failed attempts
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-destructive/90">
                    Sign-in with this {identifierLabel} is temporarily blocked for security.
                    Try again in <span className="font-medium">{formatDuration(lockedForSeconds)}</span>.
                  </p>
                </div>
              </div>
            </div>
          ) : !otpSent ? (
            <button
              onClick={sendOTP}
              disabled={loading}
              className="w-full rounded-md bg-[var(--chart-2)] text-white transition-colors hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] px-4 py-2 font-medium disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          ) : (
            <>
              <div className="rounded-lg transition-colors focus-within:bg-accent/40">
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-medium">
                    Enter OTP
                  </label>
                  <span className={`text-xs ${secondsLeft > 0 ? "text-muted-foreground" : "font-medium text-destructive"}`}>
                    {secondsLeft > 0 ? `Expires in ${secondsLeft}s` : "Code expired"}
                  </span>
                </div>

                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full rounded-md border px-3 py-2"
                  autoFocus
                />
              </div>

              {resendNotice && (
                <p className="text-sm text-muted-foreground">{resendNotice}</p>
              )}

              {attemptsRemaining !== null && attemptsRemaining < 5 && attemptsRemaining > 0 && (
                <p className="text-sm font-medium text-amber-600">
                  {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} remaining before a 24-hour lock.
                </p>
              )}

              <button
                onClick={loginWithOTP}
                disabled={loading || secondsLeft <= 0}
                className="w-full rounded-md bg-[var(--chart-2)] text-white transition-colors hover:bg-[color-mix(in_oklab,var(--chart-2)_88%,black)] px-4 py-2 font-medium disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Login"}
              </button>

              {/* The user should never be left without a way to get a fresh
                  code — always rendered once a code has been sent, just
                  disabled (with a live countdown) until the current one's
                  validity window actually runs out. */}
              <button
                type="button"
                onClick={sendOTP}
                disabled={loading || secondsLeft > 0}
                className="w-full rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {secondsLeft > 0 ? `Resend OTP in ${secondsLeft}s` : "Resend OTP"}
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
