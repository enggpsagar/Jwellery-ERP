import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Eye } from "lucide-react";

import { DeleteStockButton } from "./delete-stock-button";

type Props = {
  stock: {
    id: string;
    stockCode: string;
  };
};

export function StockRowActions({ stock }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/inventory/stock/${stock.id}`}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href={`/inventory/stock/${stock.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </DropdownMenuItem>

        <DeleteStockButton
          stockId={stock.id}
          stockCode={stock.stockCode}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}