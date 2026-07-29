"use client"

import { KarigarRowActions } from "@/components/karigars/karigar-row-actions"
import type { Karigar } from "@/lib/actions/karigar-actions"

type KarigarTableProps = {
  karigars: Karigar[]
}

export function KarigarTable({ karigars }: KarigarTableProps) {
  if (!karigars.length) {
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-muted-foreground">
        No karigars found yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="px-4 py-3 text-left font-medium">Code</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Mobile</th>
              <th className="px-4 py-3 text-left font-medium">Specialization</th>
              <th className="px-4 py-3 text-left font-medium">City</th>
              <th className="px-4 py-3 text-left font-medium">Opening Gold</th>
              <th className="px-4 py-3 text-left font-medium">Opening Cash</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {karigars.map((karigar) => (
              <tr key={karigar.id} className="border-b last:border-0">
                <td className="px-4 py-3">{karigar.code || "-"}</td>
                <td className="px-4 py-3 font-medium">{karigar.name}</td>
                <td className="px-4 py-3">{karigar.mobile || "-"}</td>
                <td className="px-4 py-3">{karigar.specialization || "-"}</td>
                <td className="px-4 py-3">{karigar.city || "-"}</td>
                <td className="px-4 py-3">{karigar.openingGold.toFixed(3)} g</td>
                <td className="px-4 py-3">₹{karigar.openingCash.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      karigar.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {karigar.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <KarigarRowActions
                    karigarId={karigar.id}
                    karigarName={karigar.name}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
