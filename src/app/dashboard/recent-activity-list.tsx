import Link from "next/link";
import { ShoppingBag, MessageSquareText, Wallet, RotateCcw, Check } from "lucide-react";
import type { ActivityItem, ActivityKind } from "@/lib/recent-activity";

const ICONS: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  purchase: ShoppingBag,
  sms_received: Check,
  topup: Wallet,
  refund: RotateCcw,
  support: MessageSquareText,
};

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function RecentActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
        Nothing here yet. Purchases, top-ups and support activity will show up as they happen.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        const row = (
          <span className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-soft text-forest">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
            </span>
            <span className="shrink-0 text-right">
              {item.trailing ? (
                <span className="block text-sm tabular-nums">{item.trailing}</span>
              ) : null}
              <span className="block text-[11px] text-muted-foreground">
                {relativeTime(item.createdAt)}
              </span>
            </span>
          </span>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="block transition-colors hover:bg-background">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
