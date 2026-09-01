/**
 * Recipient list for platform-notification emails (new store registered,
 * plan renewal requests, ...) — read from SUPER_ADMIN_EMAILS, the same env
 * var that decides who is a Super Admin at sign-in, rather than a role
 * lookup, so a notification still goes out before any Super Admin row
 * exists.
 */
export function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}
