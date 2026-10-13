import { revalidatePath } from "next/cache";

/**
 * Every page that shows stock or a party's balance — called after a
 * purchase or sale is written, changed or undone, so the products list and
 * panel, stock list, parties and dashboard never show the figure from
 * before it. "layout" covers the nested detail pages too (/inventory/products/[id],
 * /customers/[id]). `stock: false` for money-only changes (a payment).
 */
export function revalidateStockViews({ stock = true }: { stock?: boolean } = {}) {
  if (stock) revalidatePath("/inventory", "layout");
  revalidatePath("/customers", "layout");
  revalidatePath("/dashboard");
}
