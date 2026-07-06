"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      className="w-full justify-start"
      onClick={() =>
        signOut({
          callbackUrl: "/login",
        })
      }
    >
      <LogOut className="mr-2 h-4 w-4" />
      Logout
    </Button>
  );
}