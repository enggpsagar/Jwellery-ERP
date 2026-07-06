// File: app/(auth)/login/page.tsx

"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendOTP() {
    if (!phone) {
      alert("Please enter your mobile number.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
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
    if (!phone || !otp) {
      alert("Please enter both mobile number and OTP.");
      return;
    }

    setLoading(true);

    try {
      await signIn("credentials", {
        phone,
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
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">

        <h1 className="text-2xl font-semibold">
          Jewellery ERP
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Login using Google or your registered mobile number.
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

        <div className="my-6 text-center text-sm text-gray-500">
          ───── OR ─────
        </div>

        <div className="space-y-4">

          <div>
            <label className="mb-1 block text-sm font-medium">
              Mobile Number
            </label>

            <input
              type="tel"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
      </div>
    </main>
  );
}