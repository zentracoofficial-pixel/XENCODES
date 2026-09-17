import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Percent, Plug, ShieldCheck, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin, bootstrapAdminEmails } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { readSettings, SETTING_KEYS } from "@/lib/settings";
import { loadMarginRules } from "@/lib/pricing";
import { availableAdapterIds } from "@/lib/provider";
import { formatNaira } from "@/lib/currency";
import {
  WALLET_CURRENCY,
  MIN_TOPUP_KOBO,
  MAX_TOPUP_KOBO,
  FUNDING_PROVIDER,
} from "@/lib/funding-limits";
import { MarginForm, ProviderForm } from "./settings-forms";

export const metadata: Metadata = { title: "Admin: Settings" };

export const dynamic = "force-dynamic";

/**
 * Business configuration, the two provider connections, and who has admin
 * access. Everything else an admin changes belongs to a record, and lives
 * on that record's own page.
 */
export default async function AdminSettingsPage() {
  const admin = await requireAdmin();

  const [settings, rules, admins] = await Promise.all([
    readSettings(),
    loadMarginRules(),
    prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }),
  ]);

  const pendingBootstrap = bootstrapAdminEmails().filter(
    (email) => !admins.some((a) => a.email.toLowerCase() === email),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pricing defaults, the provider connections, and admin access.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Percent className="h-4 w-4" />
          Pricing
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The margins every price falls back to. Per-service overrides are set
          on{" "}
          <Link href="/admin/services" className="text-forest hover:underline">
            Services
          </Link>
          .
        </p>
        <div className="mt-4">
          <MarginForm
            defaultPercent={rules.defaultPercent}
            exclusivePercent={rules.exclusivePercent}
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plug className="h-4 w-4" />
          Number provider
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Where Xencodes buys numbers from. Nothing can be sold until one is
          connected.
        </p>
        <div className="mt-4">
          <ProviderForm
            providerId={settings[SETTING_KEYS.providerId] ?? ""}
            providerBaseUrl={settings[SETTING_KEYS.providerBaseUrl] ?? ""}
            providerEnabled={settings[SETTING_KEYS.providerEnabled] === "true"}
            availableAdapters={availableAdapterIds()}
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4" />
          Payment provider
          <Badge variant="warning">Not connected</Badge>
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          {FUNDING_PROVIDER.label} is the intended provider for customer
          funding. It is not integrated: customers can create a funding
          request, and it stays pending, because a balance only moves once a
          payment has been verified with the provider on the server. No
          credentials are stored here; when it is built they belong in this
          deployment&apos;s environment variables.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Pending requests are visible on{" "}
          <Link href="/admin/wallet?status=PENDING" className="text-forest hover:underline">
            Wallet
          </Link>
          .
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4" />
          Wallet
        </h2>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <div className="rounded-lg border border-border px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Currency
            </dt>
            <dd className="mt-1 text-sm font-medium">{WALLET_CURRENCY}</dd>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Minimum top up
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {formatNaira(MIN_TOPUP_KOBO)}
            </dd>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Maximum top up
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {formatNaira(MAX_TOPUP_KOBO)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Customers enter their own amount inside these bounds. There are no
          fixed funding packages.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4" />
            Admins
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {admins.length} {admins.length === 1 ? "admin has" : "admins have"}{" "}
            access to this panel. Manage individual accounts from Users.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {admins.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5"
            >
              <Link
                href={`/admin/users/${user.id}`}
                className="-my-2 block truncate py-2 text-sm font-medium hover:text-forest hover:underline"
              >
                {user.email}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {user.id === admin.id ? <Badge variant="default">You</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  Since{" "}
                  {user.createdAt.toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {pendingBootstrap.length > 0 ? (
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Also configured to auto-promote on next sign-in:{" "}
            {pendingBootstrap.join(", ")} (via the{" "}
            <code className="rounded bg-background px-1 py-0.5">ADMIN_EMAILS</code>{" "}
            environment variable).
          </p>
        ) : null}
      </Card>
    </div>
  );
}
