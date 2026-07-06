// File: src/components/users/user-table.tsx

"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { UserRole, UserStatus } from "@prisma/client";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  isActive: boolean;
  createdAt: Date;
}

interface Props {
  users: User[];
}

export function UserTable({ users }: Props) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                No users found.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name ?? "-"}</TableCell>

                <TableCell>{user.email ?? "-"}</TableCell>

                <TableCell>{user.phone ?? "-"}</TableCell>

                <TableCell>
                  <Badge variant="outline">{user.role}</Badge>
                </TableCell>

                <TableCell>
                  <Badge
                    variant={
                      user.status === "ACTIVE"
                        ? "default"
                        : user.status === "DISABLED"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {user.status}
                  </Badge>
                </TableCell>

                <TableCell className="text-right">
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}