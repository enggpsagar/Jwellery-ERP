"use client";

import { useState } from "react";
import { Shield, Smartphone, Mail } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          <Shield className="mr-2 h-4 w-4" />
          Security Settings
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Security</DialogTitle>

          <DialogDescription>
            Manage your account security.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          <div className="rounded-lg border p-4">

            <div className="flex items-center gap-3">

              <Smartphone className="h-5 w-5 text-primary" />

              <div>
                <h3 className="font-medium">
                  Change Mobile Number
                </h3>

                <p className="text-sm text-muted-foreground">
                  Verify using OTP before changing.
                </p>
              </div>

            </div>

            <Button
              variant="secondary"
              className="mt-4"
              disabled
            >
              Coming Soon
            </Button>

          </div>

          <div className="rounded-lg border p-4">

            <div className="flex items-center gap-3">

              <Mail className="h-5 w-5 text-primary" />

              <div>
                <h3 className="font-medium">
                  Change Email
                </h3>

                <p className="text-sm text-muted-foreground">
                  Update your primary email.
                </p>
              </div>

            </div>

            <Button
              variant="secondary"
              className="mt-4"
              disabled
            >
              Coming Soon
            </Button>

          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}