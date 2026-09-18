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
  type UserDeletionImpact,
} from "../actions";

const creditInitial: CreditWalletState = {};

export function UserActions({
  userId,
  email,
  status,
  role,
  isSelf,
  isDeleted,
  deletionImpact,
}: {
  userId: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  role: "USER" | "ADMIN";
  isSelf: boolean;
  isDeleted: boolean;
  deletionImpact: UserDeletionImpact;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleteStep, setDeleteStep] = useState<"idle" | "reviewing">("idle");
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
          Suspending blocks sign-in immediately, and signs out any session
          already in progress on their next page load.
        </p>
        {isDeleted ? (
          <p className="mt-3 text-xs text-muted-foreground">
            This account has been deleted.
          </p>
        ) : isSelf ? (
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
        {isDeleted ? (
          <p className="mt-3 text-xs text-muted-foreground">
            This account has been deleted.
          </p>
        ) : isSelf ? (
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
          Positive credits, negative debits. Recorded in the audit log with
          your note.
        </p>
        {isDeleted ? (
          <p className="mt-3 text-xs text-muted-foreground">
            This account has been deleted.
          </p>
        ) : (
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
        )}
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
        ) : isDeleted ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            This account has already been deleted. Its orders and wallet
            history are kept as required records.
          </p>
        ) : deleteStep === "idle" ? (
          <>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Removes this person&apos;s name, email and password so they can
              never sign in again. There is no undo.
            </p>
            <Button
              variant="danger"
              className="mt-3"
              onClick={() => setDeleteStep("reviewing")}
            >
              Delete account permanently
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-sm font-medium">This will affect:</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  {deletionImpact.orders}
                </span>{" "}
                order{deletionImpact.orders === 1 ? "" : "s"} — kept as history,
                no longer linked to a live account
              </li>
              <li>
                <span className="font-medium text-foreground">
                  {deletionImpact.fundingRecords}
                </span>{" "}
                wallet/funding record{deletionImpact.fundingRecords === 1 ? "" : "s"}{" "}
                — kept for financial records
              </li>
              <li>
                <span className="font-medium text-foreground">
                  {deletionImpact.supportTickets}
                </span>{" "}
                support ticket{deletionImpact.supportTickets === 1 ? "" : "s"} — kept
                as history
              </li>
              <li>Name, email and password — permanently removed</li>
              <li>Any signed-in session — stops working immediately</li>
            </ul>
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
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setDeleteStep("idle");
                  setConfirmText("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={isPending || confirmText !== email}
                onClick={handleDelete}
              >
                Confirm permanent deletion
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
