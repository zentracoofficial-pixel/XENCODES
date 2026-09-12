"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addFundsAction } from "./actions";

const PRESETS = [10, 25, 50, 100];

export function AddFunds() {
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Add Funds</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Instantly credit your wallet balance.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PRESETS.map((amount) => (
          <Button
            key={amount}
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => addFundsAction(amount * 100))}
          >
            ${amount}
          </Button>
        ))}
      </div>
    </Card>
  );
}
