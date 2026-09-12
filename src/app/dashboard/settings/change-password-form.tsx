"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Change password</h2>
      <form action={formAction} className="mt-4 space-y-4">
        <div>
          <label htmlFor="currentPassword" className="text-sm font-medium">
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
        </div>
        <div>
          <label htmlFor="newPassword" className="text-sm font-medium">
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
        </div>

        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-success">Password updated.</p> : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Updating..." : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
