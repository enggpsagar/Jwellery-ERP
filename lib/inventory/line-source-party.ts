// "Purchased From" on a hand-typed sale/quotation line — which party the
// piece (and its metal) came in from. Required on every line with no linked
// stock, so how the metal arrived stays traceable: an Invoice line records
// it on the stock row it mints (createStockForManualSaleLine), a Kacha /
// Quotation line on its own vendorId/vendorName (those never mint stock).
//
// Not a "use server" file — plain helpers for other server actions.
import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type SourcedLine = { itemName?: string | null; vendorId?: string | null };

function lineLabel(line: SourcedLine) {
  const name = line.itemName?.trim();
  return name ? `"${name}"` : "a new line item";
}

/** The rule alone, for callers that already resolve the party themselves
 *  (validateManualSaleLines). */
export function missingSourcePartyError(line: SourcedLine): string | null {
  return line.vendorId ? null : `Select who ${lineLabel(line)} was purchased from.`;
}

/**
 * Checks every given (hand-typed) line names a source party belonging to
 * this store, and returns their names for the snapshot column. Pass only
 * the lines that end up with no linked stock — a stock-linked line's
 * source is its stock row's own vendor.
 */
export async function resolveLineSourceParties(
  storeId: string,
  lines: SourcedLine[],
): Promise<{ error: string } | { names: Map<string, string> }> {
  for (const line of lines) {
    const error = missingSourcePartyError(line);
    if (error) return { error };
  }

  const ids = [...new Set(lines.map((line) => line.vendorId as string))];
  const parties = ids.length
    ? await prisma.customer.findMany({
        where: { storeId, isArchived: false, id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(parties.map((party) => [party.id, party.name]));

  for (const line of lines) {
    if (!names.has(line.vendorId as string)) {
      return { error: `The "Purchased From" party picked for ${lineLabel(line)} is invalid — pick it again.` };
    }
  }
  return { names };
}

/** Same as createPurchase: a party goods came in from is a supplier from
 *  now on, so it shows up in the Supplier list once that module is on. */
export async function markSourcePartiesAsSuppliers(
  tx: Prisma.TransactionClient,
  storeId: string,
  partyIds: Iterable<string>,
) {
  const ids = [...new Set(partyIds)];
  if (!ids.length) return;
  await tx.customer.updateMany({
    where: { storeId, id: { in: ids }, isSupplier: false },
    data: { isSupplier: true },
  });
}
