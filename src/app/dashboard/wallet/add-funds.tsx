"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNairaFromNaira } from "@/lib/currency";
import { addFundsAction } from "./actions";
import { TOP_UP_AMOUNTS_NAIRA } from "./top-up-amounts";

export function AddFunds() {
  const [selected, setSelected] = useState(TOP_UP_AMOUNTS_NAIRA[1]);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <Card className="flex h-full flex-col p-6">
      <div>
        <h2 className="font-semibold">Add funds</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an amount to credit your wallet.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TOP_UP_AMOUNTS_NAIRA.map((amount) => {
          const active = selected === amount;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => setSelected(amount)}
              className={cn(
                "rounded-xl border px-3 py-3 text-sm font-semibold tabular-nums transition-colors",
                active
                  ? "border-primary bg-primary-muted text-primary"
                  : "border-border hover:bg-secondary",
              )}
            >
              {formatNairaFromNaira(amount)}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
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
            "Adding…"
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
    </Card>
  );
}
