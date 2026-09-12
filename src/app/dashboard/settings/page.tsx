import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "./change-password-form";
import { TwoFactorSettings } from "./two-factor-settings";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <div className="mt-6 max-w-xl space-y-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">Profile</h2>
          <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
        </div>

        <ChangePasswordForm />
        <TwoFactorSettings enabled={user.twoFactorEnabled} />
      </div>
    </div>
  );
}
