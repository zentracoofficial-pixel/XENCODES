import { ShieldBan } from "lucide-react";
import { Card } from "@/components/ui/card";
import { RESTRICTED_CATEGORY_LABEL, type RestrictedCategory } from "@/lib/restricted-services";

/**
 * What the platform will not sell, and which supplier services were held back
 * because of it. The rule is in code (src/lib/restricted-services.ts), not a
 * switch: none of these can be turned on from here, and a catalog sync cannot
 * bring them back. The list is read from the supplier's live catalog, so it
 * is also how to spot a service the name matching missed.
 */
export function BlockedServicesCard({
  blocked,
}: {
  blocked: Array<{ name: string; slug: string; category: string; term: string }>;
}) {
  const groups = (Object.keys(RESTRICTED_CATEGORY_LABEL) as RestrictedCategory[]).map((category) => ({
    category,
    items: blocked.filter((item) => item.category === category).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
          <ShieldBan className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Not sold: restricted services</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Forex and trading, gambling and betting, tobacco and vaping, alcohol and adult (18+) services are
            never listed, priced or sold, whatever the provider offers and whatever is switched on below. This
            is built in and cannot be turned on from the admin.
          </p>
        </div>
      </div>
      <dl className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {groups.map(({ category, items }) => (
          <div key={category} className="rounded-lg border border-border px-3.5 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {RESTRICTED_CATEGORY_LABEL[category]}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{items.length}</dd>
            <p className="text-xs text-muted-foreground">held back from the catalog</p>
          </div>
        ))}
      </dl>
      {blocked.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-forest underline-offset-4 hover:underline">
            See the {blocked.length} blocked {blocked.length === 1 ? "service" : "services"}
          </summary>
          <div className="mt-3 space-y-3">
            {groups
              .filter((group) => group.items.length > 0)
              .map(({ category, items }) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-muted-foreground">{RESTRICTED_CATEGORY_LABEL[category]}</p>
                  <p className="mt-1 leading-relaxed">
                    {items.map((item, index) => (
                      <span key={item.slug} title={`Matched "${item.term}"`}>
                        {item.name}
                        {index < items.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </p>
                </div>
              ))}
          </div>
        </details>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Nothing from the provider&apos;s current catalog matched. The list fills in once the catalog has been read.
        </p>
      )}
    </Card>
  );
}
