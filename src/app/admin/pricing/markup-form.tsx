"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setGlobalMarkupAction, type GlobalMarkupState } from "./actions";

const initial: GlobalMarkupState = {};

export function GlobalMarkupForm({ currentPercent }: { currentPercent: number }) {
  const [state, formAction, pending] = useActionState(setGlobalMarkupAction, initial);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground" htmlFor="percent">
          Global markup, applied on top of every base price
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="percent"
            name="percent"
            type="number"
            step="1"
            defaultValue={currentPercent}
            className="h-10 w-24 rounded-lg border border-border bg-surface px-3 text-sm tabular-nums outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save markup"}
      </Button>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved. Live everywhere now.</p> : null}
    </form>
  );
}
