import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Input } from "@/components/ui/input"

const customers = [
  {
    id: 1,
    name: "Rajesh Sharma",
    mobile: "9876543210",
    city: "Nagpur",
    goldBalance: "15.25 gm",
    silverBalance: "220 gm",
  },
  {
    id: 2,
    name: "Amit Jain",
    mobile: "9988776655",
    city: "Pune",
    goldBalance: "8.10 gm",
    silverBalance: "120 gm",
  },
  {
    id: 3,
    name: "Pooja Verma",
    mobile: "9876512345",
    city: "Mumbai",
    goldBalance: "25.50 gm",
    silverBalance: "450 gm",
  },
]

export function CustomerView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Directory</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <Input placeholder="Search customers..." />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 text-left">Name</th>
                <th className="py-3 text-left">Mobile</th>
                <th className="py-3 text-left">City</th>
                <th className="py-3 text-left">Gold</th>
                <th className="py-3 text-left">Silver</th>
              </tr>
            </thead>

            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b hover:bg-muted/50"
                >
                  <td className="py-3">{customer.name}</td>
                  <td className="py-3">{customer.mobile}</td>
                  <td className="py-3">{customer.city}</td>
                  <td className="py-3">{customer.goldBalance}</td>
                  <td className="py-3">{customer.silverBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}