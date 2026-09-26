"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PanelStatus } from "@/components/product/activation-panel";

/**
 * The order-status flow asked for explicitly: Order created -> Number
 * assigned -> Waiting for SMS -> SMS received -> Completed. In this
 * architecture a number is always assigned before the order row itself is
 * ever created (see purchaseNumberAction: the provider is called before the
 * database transaction), so "created" and "assigned" are simultaneous in
 * practice — both are still shown as their own steps, both satisfied from
 * the moment the order exists, since that's the flow a customer was told to
 * expect and it costs nothing to be explicit about it.
 *
 * EXPIRED/CANCELLED/REFUNDED all divert after "Waiting for SMS" into one
 * shared terminal step, styled distinctly (amber, not green) — showing
 * "Completed" for an order that was actually refunded would be a lie the
 * data does not support.
 */

interface Step {
  label: string;
  state: "done" | "current" | "pending" | "diverted";
}

function buildSteps(status: PanelStatus): Step[] {
  if (status === "WAITING") {
    return [
      { label: "Order created", state: "done" },
      { label: "Number assigned", state: "done" },
      { label: "Waiting for SMS", state: "current" },
      { label: "SMS received", state: "pending" },
      { label: "Completed", state: "pending" },
    ];
  }
  if (status === "RECEIVED") {
    return [
      { label: "Order created", state: "done" },
      { label: "Number assigned", state: "done" },
      { label: "Waiting for SMS", state: "done" },
      { label: "SMS received", state: "done" },
      { label: "Completed", state: "done" },
    ];
  }
  const terminalLabel =
    status === "EXPIRED" ? "No code arrived" : status === "CANCELLED" ? "Cancelled" : "Refunded";
  return [
    { label: "Order created", state: "done" },
    { label: "Number assigned", state: "done" },
    { label: "Waiting for SMS", state: "done" },
    { label: terminalLabel, state: "diverted" },
  ];
}

export function StatusStepper({ status }: { status: PanelStatus }) {
  const steps = buildSteps(status);

  return (
    <ol className="flex items-center gap-1 px-4 py-3 sm:px-5" aria-label="Order status">
      {steps.map((step, index) => (
        <li key={step.label} className="flex flex-1 items-center gap-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                step.state === "done" && "bg-forest text-white",
                step.state === "diverted" && "bg-warning text-white",
                step.state === "current" && "border-2 border-mint bg-surface text-forest animate-live",
                step.state === "pending" && "border border-border bg-surface text-muted-foreground",
              )}
            >
              {step.state === "done" || step.state === "diverted" ? (
                <Check className="h-3 w-3" />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                "hidden text-center text-[10px] leading-tight sm:block",
                step.state === "pending" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 ? (
            <span className={cn("h-px flex-1", step.state === "done" ? "bg-forest" : "bg-border")} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
