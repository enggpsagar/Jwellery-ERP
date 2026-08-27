/**
 * The platform's own brand name — the product every store is hosted on,
 * as distinct from the individual store's business name (which comes from
 * `BusinessSettings.businessName` / `Store.name` via `resolveStoreName()`).
 *
 * Outgoing email needs both: a recipient should be able to tell which
 * store an OTP was issued for *and* which application issued it.
 */
export const APP_NAME = "Swarna Suite";

/**
 * What `getBusinessSettings` used to write into a freshly created
 * BusinessSettings row. Several live stores still carry it, so
 * `resolveStoreName` recognises it and looks past it to the store's real
 * name instead of signing their email "My Jewellery Store".
 *
 * Lives here rather than in settings-actions.ts because that module is
 * "use server", which may only export async functions.
 */
export const LEGACY_PLACEHOLDER_BUSINESS_NAME = "My Jewellery Store";
