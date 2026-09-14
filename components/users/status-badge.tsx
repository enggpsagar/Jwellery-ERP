// File: src/components/users/status-badge.tsx

import { Badge } from "@/components/ui/badge";
import { UserStatus } from "@prisma/client";

interface Props {
  status: UserStatus;
}

// Sourced from Branding's five status-bucket colors (see
// lib/branding.ts/StoreBranding) — Active and Inactive map directly onto
// their own literal buckets; Invited (awaiting the invite being accepted)
// maps onto Pending.
export function StatusBadge({ status }: Props) {
  switch (status) {
    case UserStatus.ACTIVE:
      return (
        <Badge className="border-transparent bg-[var(--status-active-bg)] text-[var(--status-active-text)]">
          Active
        </Badge>
      );

    case UserStatus.INVITED:
      return (
        <Badge className="border-transparent bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">
          Invited
        </Badge>
      );

    case UserStatus.DISABLED:
      return (
        <Badge className="border-transparent bg-[var(--status-inactive-bg)] text-[var(--status-inactive-text)]">
          Disabled
        </Badge>
      );

    default:
      return <Badge>{status}</Badge>;
  }
}