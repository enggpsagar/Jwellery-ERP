// File: src/components/users/status-badge.tsx

import { Badge } from "@/components/ui/badge";
import { UserStatus } from "@prisma/client";

interface Props {
  status: UserStatus;
}

export function StatusBadge({ status }: Props) {
  switch (status) {
    case UserStatus.ACTIVE:
      // Badge's own "default" variant is the app's primary color, not
      // necessarily green — explicit here so Active always reads green,
      // same convention as ActiveBadge elsewhere in the app.
      return (
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
          Active
        </Badge>
      );

    case UserStatus.INVITED:
      return (
        <Badge className="border-amber-200 bg-amber-50 text-amber-700">
          Invited
        </Badge>
      );

    case UserStatus.DISABLED:
      return <Badge variant="destructive">Disabled</Badge>;

    default:
      return <Badge>{status}</Badge>;
  }
}