// File: src/components/users/status-badge.tsx

import { Badge } from "@/components/ui/badge";
import { UserStatus } from "@prisma/client";

interface Props {
  status: UserStatus;
}

export function StatusBadge({ status }: Props) {
  switch (status) {
    case UserStatus.ACTIVE:
      return <Badge>Active</Badge>;

    case UserStatus.INVITED:
      return <Badge variant="secondary">Invited</Badge>;

    case UserStatus.DISABLED:
      return <Badge variant="destructive">Disabled</Badge>;

    default:
      return <Badge>{status}</Badge>;
  }
}