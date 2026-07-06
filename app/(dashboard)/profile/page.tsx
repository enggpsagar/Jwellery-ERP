import { ProfileCard } from "@/components/profile/profile-card";
import { ProfileForm } from "@/components/profile/profile-form";

export default function ProfilePage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          My Profile
        </h1>

        <p className="text-muted-foreground">
          Manage your account information and personal details.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ProfileCard />
        </div>

        <div className="lg:col-span-2">
          <ProfileForm />
        </div>
      </div>
    </div>
  );
}