"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff, Trash2, UserCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  adminCreditWalletAction,
  deleteUserAction,
  setUserRoleAction,
  setUserStatusAction,
  type CreditWalletState,
} from "../actions";

const creditInitial: CreditWalletState = {};

export function UserActions({
  userId,
  email,
  status,
  role,
  isSelf,
}: {
  userId: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  role: "USER" | "ADMIN";
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const boundCredit = adminCreditWalletAction.bind(null, userId);
  const [creditState, creditAction, creditPending] = useActionState(
    boundCredit,
    creditInitial,
  );

  function run(fn: () => Promise<void>) {
    setActionError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleDelete() {
    setActionError(null);
    startTransition(async () => {
      try {
        await deleteUserAction(userId);
        router.push("/admin/users");
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldOff className="h-4 w-4" />
          Account status
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Suspending blocks sign-in immediately.
        </p>
        {isSelf ? (
          <p className="mt-3 text-xs text-muted-foreground">
            You can&apos;t change your own status.
          </p>
        ) : (
          <Button
            variant={status === "ACTIVE" ? "outline" : "primary"}
            disabled={isPending}
            className="mt-3"
            onClick={() =>
              run(() => setUserStatusAction(userId, status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"))
            }
          >
            {status === "ACTIVE" ? "Suspend account" : "Reinstate account"}
          </Button>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <UserCog className="h-4 w-4" />
          Role
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Admins can access the full admin panel.
        </p>
        {isSelf ? (
          <p className="mt-3 text-xs text-muted-foreground">
            You can&apos;t change your own role.
          </p>
        ) : (
          <Button
            variant="outline"
            disabled={isPending}
            className="mt-3"
            onClick={() => run(() => setUserRoleAction(userId, role === "ADMIN" ? "USER" : "ADMIN"))}
          >
            {role === "ADMIN" ? "Remove admin access" : "Make admin"}
          </Button>
        )}
      </Card>

      {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}

      <Card className="p-5">
        <h2 className="font-semibold">Adjust wallet</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Positive credits, negative debits. Logged with your note.
        </p>
        <form action={creditAction} className="mt-4 space-y-3">
          <div className="flex gap-3">
            <input
              name="amount"
              type="number"
              step="1"
              placeholder="Amount in ₦, e.g. 500 or -200"
              required
              className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
          </div>
          <input
            name="note"
            type="text"
            placeholder="Reason (required, shown to the user)"
            required
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
          {creditState.error ? (
            <p className="text-sm text-danger">{creditState.error}</p>
          ) : null}
          {creditState.success ? (
            <p className="text-sm text-success">Wallet updated.</p>
          ) : null}
          <Button type="submit" disabled={creditPending} size="sm">
            {creditPending ? "Applying…" : "Apply adjustment"}
          </Button>
        </form>
      </Card>

      <Card className="border-danger/30 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-danger">
          <Trash2 className="h-4 w-4" />
          Danger zone
        </h2>
        {isSelf ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            You can&apos;t delete your own account.
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Permanently deletes this account: activations, wallet history and
              transactions all go with it. There is no undo.
            </p>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">
              Type <span className="font-mono text-foreground">{email}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={email}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-danger focus:ring-2 focus:ring-danger/25"
            />
            <Button
              variant="danger"
              disabled={isPending || confirmText !== email}
              className="mt-3"
              onClick={handleDelete}
            >
              Delete account permanently
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
