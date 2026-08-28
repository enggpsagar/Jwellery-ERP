// File: app/(auth)/login/page.tsx

"use client";

import Link from "next/link";

import { useState } from "react";
import { signIn } from "next-auth/react";

type Mode = "phone" | "email";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("phone");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

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

    try {
      await signIn("credentials", {
        ...(mode === "phone" ? { phone: identifier } : { email: identifier }),
        otp,
        callbackUrl: "/dashboard",
        redirect: true,
      });
    } catch {
      alert("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">

        <h1 className="text-2xl font-semibold">
          Jewellery ERP
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Login using Google, your registered mobile number, or email.
        </p>

        <button
          onClick={() =>
            signIn("google", {
              callbackUrl: "/dashboard",
            })
          }
          className="mt-6 w-full rounded-md bg-black px-4 py-2 text-white"
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
              mode === "phone" ? "bg-black text-white" : "text-muted-foreground"
            }`}
          >
            Mobile Number
          </button>
          <button
            type="button"
            onClick={() => switchMode("email")}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              mode === "email" ? "bg-black text-white" : "text-muted-foreground"
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
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-white"
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
                className="w-full rounded-md bg-green-600 px-4 py-2 text-white"
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
    </main>
  );
}
