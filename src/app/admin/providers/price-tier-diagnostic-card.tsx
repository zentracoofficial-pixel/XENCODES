"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { debugProviderPriceTiersAction } from "./actions";

/**
 * A one-off probe, not a feature customers or ordinary admin work ever
 * touches: asks GrizzlySMS directly, for one exact service+country, what its
 * getPricesV2/getPricesV3 actions actually return, since this adapter has
 * never called them and their real shape against this account is not
 * confirmed anywhere — see debugPriceTiers()'s own comment in
 * src/lib/provider/grizzlysms.ts. Read-only. Meant to be deleted once it has
 * answered that question.
 */
export function PriceTierDiagnosticCard({ providerId }: { providerId: string }) {
  const [pending, startTransition] = useTransition();
  const [service, setService] = useState("whatsapp");
  const [country, setCountry] = useState("usa");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    startTransition(async () => {
      const outcome = await debugProviderPriceTiersAction(providerId, service, country);
      setResult(outcome);
    });
  }

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="text-sm font-semibold">Price-tier diagnostic (temporary)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Calls getPrices, getPricesV2 and getPricesV3 directly for one service/country and shows
          the raw response. Read-only — never reserves a number. Full responses also land in the
          Vercel runtime logs.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="service slug, e.g. whatsapp"
          className="h-9 w-48 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="country slug, e.g. usa"
          className="h-9 w-48 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
        />
        <Button onClick={run} disabled={pending} size="sm" variant="outline">
          {pending ? "Asking GrizzlySMS…" : "Run diagnostic"}
        </Button>
      </div>
      {result ? (
        <pre
          className={`max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border px-3.5 py-3 text-xs ${
            result.ok ? "border-border bg-background" : "border-danger/30 bg-danger-soft text-danger"
          }`}
        >
          {result.text}
        </pre>
      ) : null}
    </Card>
  );
}
