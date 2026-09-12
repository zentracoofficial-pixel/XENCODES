import type { Metadata } from "next";
import Link from "next/link";
import { Plug, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin, bootstrapAdminEmails } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { readSettings, maskSecret, SETTING_KEYS } from "@/lib/settings";
import { ProviderForm } from "./provider-form";

export const metadata: Metadata = { title: "Admin — Settings" };

export default async function AdminSettingsPage() {
  const admin = await requireAdmin();
  const [settings, admins] = await Promise.all([
    readSettings(),
    prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }),
  ]);

  const pendingBootstrap = bootstrapAdminEmails().filter(
    (email) => !admins.some((a) => a.email.toLowerCase() === email),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The provider connection and who has admin access.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plug className="h-4 w-4" />
          Provider connection
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Xencodes buys numbers from an external SMS provider. Configure the connection here —
          this doesn&apos;t change anything else about how the site works.
        </p>
        <div className="mt-4">
          <ProviderForm
            providerName={settings[SETTING_KEYS.providerName] ?? ""}
            providerBaseUrl={settings[SETTING_KEYS.providerBaseUrl] ?? ""}
            maskedApiKey={maskSecret(settings[SETTING_KEYS.providerApiKey])}
            providerEnabled={settings[SETTING_KEYS.providerEnabled] === "true"}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4" />
            Admins
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {admins.length} {admins.length === 1 ? "admin has" : "admins have"} access to this
            panel. Manage individual accounts from Users.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {admins.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <Link
                href={`/admin/users/${user.id}`}
                className="truncate text-sm font-medium hover:text-primary hover:underline"
              >
                {user.email}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {user.id === admin.id ? <Badge variant="primary">You</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  Since{" "}
                  {user.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {pendingBootstrap.length > 0 ? (
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Also configured to auto-promote on next sign-in: {pendingBootstrap.join(", ")} (via the{" "}
            <code className="rounded bg-secondary px-1 py-0.5">ADMIN_EMAILS</code> environment variable).
          </p>
        ) : null}
      </Card>
    </div>
  );
}
