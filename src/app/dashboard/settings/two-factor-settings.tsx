"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  startTwoFactorEnrollmentAction,
  confirmTwoFactorEnrollmentAction,
  disableTwoFactorAction,
  type TwoFactorEnrollment,
  type ConfirmTwoFactorState,
  type DisableTwoFactorState,
} from "./actions";

const confirmInitial: ConfirmTwoFactorState = {};
const disableInitial: DisableTwoFactorState = {};

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmTwoFactorEnrollmentAction,
    confirmInitial,
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disableTwoFactorAction,
    disableInitial,
  );

  if (enabled && !confirmState.success) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-success" />
          <h2 className="font-semibold">Two-factor authentication</h2>
          <Badge variant="success">Enabled</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account requires a code from your authenticator app at login.
        </p>
        <form action={disableAction} className="mt-4 space-y-3">
          <input
            name="password"
            type="password"
            required
            placeholder="Confirm your password to disable"
            className="h-10 w-full max-w-xs rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
          {disableState.error ? (
            <p className="text-sm text-danger">{disableState.error}</p>
          ) : null}
          <Button type="submit" variant="outline" disabled={disablePending}>
            {disablePending ? "Disabling..." : "Disable two-factor"}
          </Button>
        </form>
      </Card>
    );
  }

  if (confirmState.success) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-success" />
          <h2 className="font-semibold">Two-factor authentication</h2>
          <Badge variant="success">Enabled</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Two-factor authentication is now protecting your account.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Two-factor authentication</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add an extra layer of security using an authenticator app.
      </p>

      {!enrollment ? (
        <Button
          className="mt-4"
          variant="outline"
          disabled={starting}
          onClick={async () => {
            setStarting(true);
            const result = await startTwoFactorEnrollmentAction();
            setEnrollment(result);
            setStarting(false);
          }}
        >
          {starting ? "Preparing..." : "Enable two-factor"}
        </Button>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Scan this QR code with your authenticator app, then enter the
            6-digit code it shows.
          </p>
          <Image
            src={enrollment.qrDataUrl}
            alt="Two-factor QR code"
            width={180}
            height={180}
            unoptimized
            className="rounded-lg border border-border"
          />
          <p className="font-mono text-xs text-muted-foreground break-all">
            Manual entry key: {enrollment.secret}
          </p>
          <form action={confirmAction} className="flex flex-wrap items-center gap-3">
            <input
              name="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              placeholder="123456"
              className="h-10 w-32 rounded-lg border border-border bg-surface px-3 text-sm tracking-widest outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
            <Button type="submit" disabled={confirmPending}>
              {confirmPending ? "Verifying..." : "Confirm"}
            </Button>
          </form>
          {confirmState.error ? (
            <p className="text-sm text-danger">{confirmState.error}</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
