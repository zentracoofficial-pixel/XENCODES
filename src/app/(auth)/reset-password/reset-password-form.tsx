"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  if (state.success) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="text-lg font-semibold">Password updated</p>
        <p className="text-sm text-muted-foreground">
          Your password has been changed. You can now log in.
        </p>
        <Button href="/login" className="mt-2">
          Log in
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-7 sm:p-8">
      <h1 className="text-xl font-semibold">Set a new password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Choose a new password for your account.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            New password
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1.5"
            placeholder="••••••••"
          />
        </div>

        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Updating..." : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
