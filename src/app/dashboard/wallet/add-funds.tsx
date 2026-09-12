"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNairaFromNaira } from "@/lib/currency";
import { addFundsAction } from "./actions";
import { TOP_UP_AMOUNTS_NAIRA } from "./top-up-amounts";

export function AddFunds() {
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Add Funds</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Instantly credit your wallet balance.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {TOP_UP_AMOUNTS_NAIRA.map((amount) => (
          <Button
            key={amount}
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => addFundsAction(amount))}
          >
            {formatNairaFromNaira(amount)}
          </Button>
        ))}
      </div>
    </Card>
  );
}
