"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatNairaFromNaira } from "@/lib/currency";
import { addFundsAction } from "./actions";
import { TOP_UP_AMOUNTS_NAIRA } from "./top-up-amounts";

export function AddFunds() {
  const [selected, setSelected] = useState(TOP_UP_AMOUNTS_NAIRA[1]);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Add funds</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose an amount to credit your wallet.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TOP_UP_AMOUNTS_NAIRA.map((amount) => {
          const active = selected === amount;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => setSelected(amount)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-sm font-semibold tabular-nums transition-colors",
                active
                  ? "border-forest bg-forest text-white"
                  : "border-border hover:border-mint hover:bg-mint-soft",
              )}
            >
              {formatNairaFromNaira(amount)}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await addFundsAction(selected);
              setDone(true);
              setTimeout(() => setDone(false), 2500);
            })
          }
        >
          {isPending ? (
            "Adding funds"
          ) : done ? (
            <>
              <Check className="h-4 w-4" />
              Added
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add {formatNairaFromNaira(selected)}
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          Balance updates immediately and never expires.
        </p>
      </div>
    </section>
  );
}
