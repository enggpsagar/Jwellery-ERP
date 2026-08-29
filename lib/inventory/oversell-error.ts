/**
 * Thrown inside a stock-decrementing $transaction when a guarded update
 * finds nothing left to sell — distinguished from an unexpected server
 * error so its specific message reaches the merchant (e.g. from
 * createInvoice/createKachaInvoice) instead of a generic failure message.
 *
 * Lives outside any "use server" action file: a file with that directive
 * may only export async functions, not a class.
 */
export class OversellError extends Error {}
