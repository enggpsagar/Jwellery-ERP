"use client";

import {
  BadgeCheck,
  CalendarDays,
  Mail,
  Phone,
  Shield,
  MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { AvatarUpload } from "./avatar-upload";
import { ChangePasswordDialog } from "./change-password-dialog";

type Profile = {
  name: string | null;
  email: string | null;
  phone: string | null;
  image: string | null;
  role: string;
  status: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
};

function getInitials(name?: string | null) {
  if (!name) return "U";

  return name
    .split(" ")
    .map((item) => item[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export function ProfileCard() {
  const { data: session } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile");

        if (!res.ok) return;

        const data = await res.json();

        setProfile(data);
      } catch (error) {
        console.error(error);
      }
    }

    loadProfile();
  }, []);

  return (
    <Card>
      <CardContent className="flex flex-col items-center p-6">
        <Avatar className="h-28 w-28">
          <AvatarImage
            src={profile?.image ?? session?.user?.image ?? ""}
          />

          <AvatarFallback className="text-2xl">
            {getInitials(profile?.name)}
          </AvatarFallback>
        </Avatar>

        <AvatarUpload />

        <h2 className="mt-4 text-xl font-bold">
          {profile?.name ?? "User"}
        </h2>

        <Badge className="mt-2">
          {profile?.role}
        </Badge>

        <div className="mt-6 w-full space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />

            <span className="text-sm">
              {profile?.email ?? "-"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground" />

            <span className="text-sm">
              {profile?.phone ?? "-"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Shield className="h-4 w-4 text-muted-foreground" />

            <span className="text-sm">
              {profile?.role}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <BadgeCheck className="h-4 w-4 text-muted-foreground" />

            <span className="text-sm">
              {profile?.status}
            </span>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="mt-1 h-4 w-4 text-muted-foreground" />

            <div className="text-sm text-muted-foreground">
              {profile?.addressLine1 && (
                <div>{profile.addressLine1}</div>
              )}

              {profile?.addressLine2 && (
                <div>{profile.addressLine2}</div>
              )}

              {(profile?.city ||
                profile?.state ||
                profile?.pincode) && (
                <div>
                  {profile?.city}
                  {profile?.city && profile?.state ? ", " : ""}
                  {profile?.state}{" "}
                  {profile?.pincode}
                </div>
              )}

              {profile?.country && (
                <div>{profile.country}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />

            <span className="text-sm">
              ERP User
            </span>
          </div>
        </div>

        <div className="mt-8 w-full">
          <ChangePasswordDialog />
        </div>
      </CardContent>
    </Card>
  );
}