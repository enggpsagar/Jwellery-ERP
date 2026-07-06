"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Save } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfileFormData = {
  image: string;

  name: string;
  email: string;
  phone: string;

  addressLine1: string;
  addressLine2: string;

  city: string;
  state: string;
  pincode: string;
  country: string;
};

export function ProfileForm() {
  const { update } = useSession();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);

  const [currentEmail, setCurrentEmail] = useState("");

  const [form, setForm] = useState<ProfileFormData>({
    image: "",
    name: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
  });

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const res = await fetch("/api/profile");

      if (!res.ok) {
        throw new Error("Unable to load profile");
      }

      const data = await res.json();

      setCurrentEmail(data.email ?? "");

      setForm({
        image: data.image ?? "",
        name: data.name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        addressLine1: data.addressLine1 ?? "",
        addressLine2: data.addressLine2 ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        pincode: data.pincode ?? "",
        country: data.country ?? "India",
      });
    } catch (err) {
      console.error(err);
      toast.error("Unable to load profile.");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    const formData = new FormData();

    formData.append("file", file);

    try {
      const res = await fetch("/api/profile/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error();
      }

      const data = await res.json();

      setForm((prev) => ({
        ...prev,
        image: data.url,
      }));

      toast.success("Profile picture uploaded.");
    } catch {
      toast.error("Unable to upload picture.");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }

    if (form.phone && !/^\d{10}$/.test(form.phone)) {
      toast.error("Phone number must contain 10 digits.");
      return;
    }

    if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
      toast.error("Pincode must contain 6 digits.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          currentEmail,
        }),
      });

      if (!res.ok) {
        throw new Error();
      }

      const data = await res.json();

      setCurrentEmail(data.email ?? "");

      setForm({
        image: data.image ?? "",
        name: data.name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        addressLine1: data.addressLine1 ?? "",
        addressLine2: data.addressLine2 ?? "",
        city: data.city ?? "",
        state: data.state ?? "",
        pincode: data.pincode ?? "",
        country: data.country ?? "India",
      });

      await update();

      toast.success("Profile updated successfully.");
    } catch {
      toast.error("Unable to update profile.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="mb-8 flex flex-col items-center">
          <Avatar className="h-28 w-28 border-4 shadow-lg">
            <AvatarImage src={form.image || ""} />

            <AvatarFallback className="text-3xl">
              {form.name ? form.name.charAt(0).toUpperCase() : "U"}
            </AvatarFallback>
          </Avatar>

          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/*"
            onChange={uploadImage}
          />

          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="mr-2 h-4 w-4" />
            Upload Photo
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="name">Full Name</Label>

              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Enter your name"
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>

              <Input
                id="email"
                name="email"
                type="email"
                value={form.email}
                disabled={!!currentEmail}
                onChange={handleChange}
                placeholder="Enter email"
              />

              {!currentEmail && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Email can only be added once.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>

              <Input
                id="phone"
                name="phone"
                maxLength={10}
                value={form.phone}
                onChange={handleChange}
              />
            </div>

            <div>
              <Label htmlFor="country">Country</Label>

              <Input
                id="country"
                name="country"
                value={form.country}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="addressLine1">Address Line 1</Label>

            <Input
              id="addressLine1"
              name="addressLine1"
              value={form.addressLine1}
              onChange={handleChange}
            />
          </div>

          <div>
            <Label htmlFor="addressLine2">Address Line 2</Label>

            <Input
              id="addressLine2"
              name="addressLine2"
              value={form.addressLine2}
              onChange={handleChange}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="city">City</Label>

              <Input
                id="city"
                name="city"
                value={form.city}
                onChange={handleChange}
              />
            </div>

            <div>
              <Label htmlFor="state">State</Label>

              <Input
                id="state"
                name="state"
                value={form.state}
                onChange={handleChange}
              />
            </div>

            <div>
              <Label htmlFor="pincode">Pincode</Label>

              <Input
                id="pincode"
                name="pincode"
                maxLength={6}
                value={form.pincode}
                onChange={handleChange}
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="min-w-40">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
