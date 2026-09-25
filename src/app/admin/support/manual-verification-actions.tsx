"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reviewManualVerificationAction } from "./actions";

export function ManualVerificationActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function review(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      await reviewManualVerificationAction(requestId, decision);
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => review("APPROVED")}
      >
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => review("REJECTED")}
      >
        Reject
      </Button>
    </div>
  );
}
