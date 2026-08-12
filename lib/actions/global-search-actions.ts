// FILE PATH: lib/actions/global-search-actions.ts
"use server";

import { prisma } from "@/lib/prisma";

export type GlobalSearchResultType =
  | "customer"
  | "product"
  | "invoice"
  | "karigar";

export type GlobalSearchResult = {
  type: GlobalSearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type GlobalSearchResponse = {
  results: GlobalSearchResult[];
};

const RESULTS_PER_TYPE = 5;

export async function globalSearch(
  query: string
): Promise<GlobalSearchResponse> {
  const term = query.trim();

  if (term.length < 2) {
    return { results: [] };
  }

  const [customers, products, invoices, karigars] = await Promise.all([
    prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { phone: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, phone: true, city: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { productCode: { contains: term, mode: "insensitive" } },
          { designCode: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, productCode: true, category: true },
      take: RESULTS_PER_TYPE,
    }),
    prisma.invoice.findMany({
      where: {
        OR: [
          { invoiceNumber: { contains: term, mode: "insensitive" } },
          { customer: { name: { contains: term, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        customer: { select: { name: true } },
      },
      take: RESULTS_PER_TYPE,
    }),
    prisma.karigar.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { code: { contains: term, mode: "insensitive" } },
          { mobile: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, code: true, mobile: true },
      take: RESULTS_PER_TYPE,
    }),
  ]);

  const results: GlobalSearchResult[] = [
    ...customers.map((c) => ({
      type: "customer" as const,
      id: c.id,
      title: c.name,
      subtitle: [c.phone, c.city].filter(Boolean).join(" · ") || "Customer",
      href: `/customers/${c.id}`,
    })),
    ...products.map((p) => ({
      type: "product" as const,
      id: p.id,
      title: p.name,
      subtitle: [p.productCode, p.category].filter(Boolean).join(" · "),
      href: `/inventory/products/${p.id}`,
    })),
    ...invoices.map((inv) => ({
      type: "invoice" as const,
      id: inv.id,
      title: inv.invoiceNumber,
      subtitle: [inv.customer?.name, `₹${inv.totalAmount}`]
        .filter(Boolean)
        .join(" · "),
      href: `/billing/${inv.id}`,
    })),
    ...karigars.map((k) => ({
      type: "karigar" as const,
      id: k.id,
      title: k.name,
      subtitle: [k.code, k.mobile].filter(Boolean).join(" · ") || "Karigar",
      href: `/karigars/${k.id}/edit`,
    })),
  ];

  return { results };
}
