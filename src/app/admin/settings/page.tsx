import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Percent, Plug, ShieldCheck, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin, bootstrapAdminEmails } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  readSettings,
  readNumber,
  SETTING_KEYS,
  DEFAULT_USD_TO_NGN_RATE,
  DEFAULT_TOPUP_FEE_PERCENT,
  DEFAULT_TOPUP_FEE_CAP_KOBO,
} from "@/lib/settings";
import { loadMarginRules } from "@/lib/pricing";
import { getEnabledProviders, getNumberProvider } from "@/lib/provider";
import { formatNaira } from "@/lib/currency";
import {
  WALLET_CURRENCY,
  MIN_TOPUP_KOBO,
  MAX_TOPUP_KOBO,
  FUNDING_PROVIDER,
} from "@/lib/funding-limits";
import { isKorapayConfigured } from "@/lib/korapay";
import { MarginForm, UsdRateForm, TopupFeeForm } from "./settings-forms";

export const metadata: Metadata = { title: "Admin: Settings" };

export const dynamic = "force-dynamic";

/**
 * Business configuration, a summary of the provider connections, and who
 * has admin access. Everything else an admin changes belongs to a record,
 * and lives on that record's own page: per-provider connection detail on
 * Providers, per-service pricing overrides on Services.
 */
export default async function AdminSettingsPage() {
  const admin = await requireAdmin();

  const [settings, rules, admins, resolved, enabledProviders, usdToNgnRateRow] =
    await Promise.all([
      readSettings(),
      loadMarginRules(),
      prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }),
      getNumberProvider(),
      getEnabledProviders(),
      prisma.setting.findUnique({ where: { key: SETTING_KEYS.usdToNgnRate } }),
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
          Number providers
          <Badge variant={resolved.connected ? "success" : "warning"}>
            {resolved.connected ? "Connected" : "Disconnected"}
          </Badge>
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Where Xencodes buys numbers from. Nothing can be sold until at
          least one is connected and enabled.{" "}
          {enabledProviders.length > 0
            ? `Currently buying from ${enabledProviders.map((p) => p.label).join(", ")}.`
            : "None enabled right now."}{" "}
          Enabling, disabling, priority, connection testing and catalog sync
          for every provider live on{" "}
          <Link href="/admin/providers" className="text-forest hover:underline">
            Providers
          </Link>
          .
        </p>
        <div className="mt-5 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Dollar conversion</h3>
          <div className="mt-3">
            <UsdRateForm
              usdToNgnRate={readNumber(
                settings,
                SETTING_KEYS.usdToNgnRate,
                DEFAULT_USD_TO_NGN_RATE,
              )}
              usdToNgnRateUpdatedAt={usdToNgnRateRow?.updatedAt.toISOString() ?? null}
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4" />
          Payment provider
          <Badge variant={isKorapayConfigured() ? "success" : "warning"}>
            {isKorapayConfigured() ? "Connected" : "Not connected"}
          </Badge>
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          {isKorapayConfigured()
            ? `${FUNDING_PROVIDER.label} is connected: a top up opens a real checkout page, and the wallet is credited only after this server verifies the payment directly with ${FUNDING_PROVIDER.label}, from its own webhook and from the customer's return to the wallet page. Neither ever trusts the other alone.`
            : `${FUNDING_PROVIDER.label} is the provider for customer funding, but KORAPAY_SECRET_KEY is not set on this deployment. Customers can create a funding request, and it stays pending, because a balance only moves once a payment has been verified with the provider on the server.`}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          No credentials are stored here; they belong only in this
          deployment&apos;s environment variables. Pending requests are
          visible on{" "}
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
        <div className="mt-5 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Processing fee</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            KoraPay&apos;s hosted checkout has no API option to bill its own
            fee to the customer directly (that field exists only on
            KoraPay&apos;s separate direct charge APIs, and using it here
            broke checkout in a real test), so this fee is added to the
            amount requested at checkout instead, matching KoraPay&apos;s
            own published rate by default below.
          </p>
          <div className="mt-3">
            <TopupFeeForm
              feePercent={readNumber(
                settings,
                SETTING_KEYS.topupFeePercent,
                DEFAULT_TOPUP_FEE_PERCENT,
              )}
              feeCapKobo={readNumber(
                settings,
                SETTING_KEYS.topupFeeCapKobo,
                DEFAULT_TOPUP_FEE_CAP_KOBO,
              )}
            />
          </div>
        </div>
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
