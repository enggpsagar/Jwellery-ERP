"use client";

import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AvatarUpload() {
  return (
    <Button
      variant="secondary"
      className="mt-4 w-full"
      disabled
    >
      <Camera className="mr-2 h-4 w-4" />
      Upload Photo (Coming Soon)
    </Button>
  );
}