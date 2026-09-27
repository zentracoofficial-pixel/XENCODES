import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatPhoneNumber } from "@/lib/currency";
import { ActivationLogo } from "./activation-logo";
import { getRecentActivity } from "@/lib/recent-activity";
import { getLowBalanceThreshold, shouldShowLowBalanceWarning } from "@/lib/low-balance";
import { RecentActivityList } from "./recent-activity-list";
import { LowBalanceWarning } from "./low-balance-warning";
import { OnboardingChecklist } from "./onboarding-checklist";
import { DashboardStat } from "./dashboard-stat";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, current, activity, favorites, fundedCount, activationCount, deliveredAgg, smsReceivedCount] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.activation.findFirst({
        where: { userId, status: "WAITING" },
        orderBy: { createdAt: "desc" },
      }),
      getRecentActivity(userId),
      prisma.favoriteService.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 6 }),
      prisma.walletTransaction.count({ where: { userId, type: "TOPUP", status: "SUCCESSFUL" } }),
      prisma.activation.count({ where: { userId } }),
      // RECEIVED-only, the same definition of "spent" the admin panel
      // already uses (see admin/users/[id]/page.tsx): an order that ended
      // EXPIRED, CANCELLED or REFUNDED was paid for and then paid back, so
      // it never really cost the customer anything. Also gives the
      // successful-purchase count in the same query, since both figures
      // come from the same row set.
      prisma.activation.aggregate({
        where: { userId, status: "RECEIVED" },
        _sum: { priceKobo: true },
        _count: true,
      }),
      // Distinct from the count above only in what it's counting (a code
      // arriving, via receivedAt, vs. an order settling into RECEIVED) even
      // though the two always coincide today — RECEIVED means exactly "a
      // code arrived" (see ActivationStatus's own schema comment) — so this
      // reads as its own honest measurement rather than a relabelled
      // duplicate of the count above.
      prisma.activation.count({ where: { userId, receivedAt: { not: null } } }),
    ]);

  const lowBalanceThreshold = await getLowBalanceThreshold(user.currency);
  const showLowBalanceWarning = shouldShowLowBalanceWarning(
    user.walletBalanceKobo,
    lowBalanceThreshold,
    user.lowBalanceDismissedAtKobo,
  );

  const firstName = user.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : "Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your balance, your current number and what you have verified.
          </p>
        </div>
        <Button href="/dashboard/buy">
          <Plus className="h-4 w-4" />
          Buy Number
        </Button>
      </div>

      <OnboardingChecklist
        emailVerified={Boolean(user.emailVerified)}
        fundedWallet={fundedCount > 0}
        boughtNumber={activationCount > 0}
      />

      {showLowBalanceWarning ? (
        <LowBalanceWarning balanceKobo={user.walletBalanceKobo} currency={user.currency} />
      ) : null}

      {/* What buying numbers has actually done for this customer, the
          primary figures on this page — trust comes from seeing money paid
          matched by numbers that actually worked, not from a balance
          figure alone. Wallet balance still exists (below) but is
          deliberately no longer the headline. */}
      <section>
        <h2 className="text-sm font-semibold">Your activity</h2>
        {/* Stacked full-width on a narrow phone, three across from sm: up —
            a fixed 3-column grid at every width squeezed "Successful
            purchases" and the currency amount enough to clip them on
            common phone widths, confirmed live before this was changed
            (same class of bug as the history page fix below). */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DashboardStat
            label="Total spent"
            value={formatMoney(deliveredAgg._sum.priceKobo ?? 0, user.currency)}
          />
          <DashboardStat label="Successful purchases" value={deliveredAgg._count} />
          <DashboardStat label="SMS received" value={smsReceivedCount} />
        </div>
      </section>

      {/* Balance: present, but a compact bar rather than the page's hero
          element. */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-3.5">
        <div>
          <p className="text-xs text-muted-foreground">Wallet balance</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">
            {formatMoney(user.walletBalanceKobo, user.currency)}
          </p>
          {/* An empty wallet is stated plainly here rather than left for
              the customer to discover at the moment they try to buy. */}
          {user.walletBalanceKobo <= 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add funds to purchase a number.
            </p>
          ) : null}
        </div>
        <Button href="/dashboard/wallet" variant="outline" size="sm">
          Add funds
        </Button>
      </div>

      {/* Favorites. Only shown once a customer has actually starred
          something — an empty "no favorites yet" box here would be exactly
          the clutter a compact dashboard is supposed to avoid. */}
      {favorites.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Your favorites</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {favorites.map((favorite) => (
              <li key={favorite.id}>
                <Link
                  href={`/dashboard/buy?service=${encodeURIComponent(favorite.serviceSlug)}`}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:border-mint hover:bg-mint-soft"
                >
                  <Star className="h-3.5 w-3.5 fill-mint text-mint" />
                  {favorite.serviceName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Current activation. */}
      <section>
        <h2 className="text-sm font-semibold">Current activation</h2>
        {current ? (
          <Link
            href={`/dashboard/buy?activation=${current.id}`}
            className="mt-3 flex items-center gap-3.5 rounded-xl border border-mint bg-mint-soft px-4 py-3.5 transition-colors hover:bg-mint-soft/70"
          >
            <ActivationLogo
              serviceSlug={current.serviceSlug}
              serviceName={current.serviceName}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current.serviceName}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {formatPhoneNumber(current.phoneNumber)}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <span className="h-1.5 w-1.5 animate-live rounded-full bg-mint" />
              <span className="text-xs font-medium text-forest">
                Waiting for SMS
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-forest" />
          </Link>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-5">
            <p className="text-sm text-muted-foreground">
              No number is active. Buy one to receive a code.
            </p>
            <Button href="/dashboard/buy" size="sm" variant="outline">
              Get a Number
            </Button>
          </div>
        )}
      </section>

      {/* Recent activity: purchases, completed SMS, wallet funding,
          refunds and support activity, merged into one compact feed rather
          than several competing lists. */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          {activity.length > 0 ? (
            <Link
              href="/dashboard/history"
              className="-my-2 py-2 text-xs font-medium text-forest underline-offset-4 hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>
        <div className="mt-3">
          <RecentActivityList items={activity} />
        </div>
      </section>
    </div>
  );
}
