/**
 * The platform's own brand name — the product every store is hosted on,
 * as distinct from the individual store's business name (which comes from
 * `BusinessSettings.businessName` / `Store.name` via `resolveStoreName()`).
 *
 * Outgoing email needs both: a recipient should be able to tell which
 * store an OTP was issued for *and* which application issued it.
 */
export const APP_NAME = "Swarna Suite";
