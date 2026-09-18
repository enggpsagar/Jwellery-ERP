// Shared login-OTP policy — the one place both the send-otp route, the
// otp-status route, and otp-auth.ts's verification logic read these
// numbers from, so the client's countdown/attempts UI and the server's own
// enforcement can never drift apart.

/**
 * How long a LOGIN OTP stays valid, in both Mobile and Email channels
 * alike. Deliberately doubles as the resend cooldown too — the "Resend
 * OTP" option becomes available at the exact moment the current code
 * stops being valid, so a user is never mid-way through a valid code's
 * lifetime with a resend already tempting them to throw it away, and never
 * left waiting once it's actually expired either.
 */
export const OTP_TTL_MS = 60 * 1000;

/** Wrong-code guesses allowed against a phone/email before it locks out. */
export const MAX_OTP_ATTEMPTS = 5;

/** How long a phone/email is blocked from sending or verifying a LOGIN OTP once MAX_OTP_ATTEMPTS is reached. */
export const OTP_LOCKOUT_MS = 24 * 60 * 60 * 1000;
