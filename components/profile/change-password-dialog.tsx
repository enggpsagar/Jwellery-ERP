"use client";

import { useState } from "react";
import { Shield, Smartphone, Mail } from "lucide-react";
import { Loader } from "@/components/ui/loader";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers/toast-provider";
import {
  sendProfilePhoneChangeOtp,
  verifyProfilePhoneChangeOtp,
  sendProfileEmailChangeOtp,
  verifyProfileEmailChangeOtp,
} from "@/lib/actions/profile-security-actions";

type ChangeContactFlowProps = {
  kind: "phone" | "email";
  currentValue: string | null;
  onUpdated: () => void;
};

/**
 * Enter new value -> send OTP to it -> enter OTP -> verify & apply.
 * Phone OTP is dev-console-log only today (no SMS provider wired up, same
 * as login OTP); email OTP is a real send via the app's SMTP mailer.
 */
function ChangeContactFlow({ kind, currentValue, onUpdated }: ChangeContactFlowProps) {
  const toast = useToast();
  const isPhone = kind === "phone";

  const [step, setStep] = useState<"idle" | "otp">("idle");
  const [value, setValue] = useState("");
  const [otp, setOtp] = useState("");
  const [pending, setPending] = useState(false);

  function reset() {
    setStep("idle");
    setValue("");
    setOtp("");
  }

  async function handleSendOtp() {
    setPending(true);
    try {
      const result = isPhone
        ? await sendProfilePhoneChangeOtp(value)
        : await sendProfileEmailChangeOtp(value);

      if (result.success) {
        toast.success(result.message);
        setStep("otp");
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error(`Failed to send OTP to your new ${kind}`);
    } finally {
      setPending(false);
    }
  }

  async function handleVerify() {
    setPending(true);
    try {
      const result = isPhone
        ? await verifyProfilePhoneChangeOtp(value, otp)
        : await verifyProfileEmailChangeOtp(value, otp);

      if (result.success) {
        toast.success(result.message);
        reset();
        onUpdated();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error(`Failed to verify OTP`);
    } finally {
      setPending(false);
    }
  }

  if (step === "idle") {
    return (
      <div className="mt-4 space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
        <Label htmlFor={`new-${kind}`} required>
          New {isPhone ? "mobile number" : "email address"}
        </Label>
        <Input
          id={`new-${kind}`}
          type={isPhone ? "tel" : "email"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            isPhone ? "Enter 10-digit mobile number" : "Enter new email address"
          }
        />
        <Button
          size="sm"
          onClick={handleSendOtp}
          disabled={pending || !value.trim() || value.trim() === currentValue}
        >
          {pending ? (
            <>
              <Loader className="mr-2 h-4 w-4" />
              Sending OTP...
            </>
          ) : (
            "Send OTP"
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2 rounded-lg transition-colors focus-within:bg-accent/40">
      <Label htmlFor={`otp-${kind}`} required>
        Enter the OTP sent to {value}
      </Label>
      <Input
        id={`otp-${kind}`}
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
        placeholder="6-digit code"
        maxLength={6}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleVerify} disabled={pending || otp.length !== 6}>
          {pending ? (
            <>
              <Loader className="mr-2 h-4 w-4" />
              Verifying...
            </>
          ) : (
            "Verify & Update"
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

type ChangePasswordDialogProps = {
  currentPhone?: string | null;
  currentEmail?: string | null;
  onProfileUpdated?: () => void;
};

export function ChangePasswordDialog({
  currentPhone = null,
  currentEmail = null,
  onProfileUpdated,
}: ChangePasswordDialogProps) {
  const [open, setOpen] = useState(false);

  function handleUpdated() {
    onProfileUpdated?.();
  }

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

            <ChangeContactFlow
              kind="phone"
              currentValue={currentPhone}
              onUpdated={handleUpdated}
            />

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

            <ChangeContactFlow
              kind="email"
              currentValue={currentEmail}
              onUpdated={handleUpdated}
            />

          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
