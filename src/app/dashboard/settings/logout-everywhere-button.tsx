"use client";

import { useTransition, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutEverywhereAction } from "./actions";

/**
 * Sessions here are JWT-only (no server-side session table to list rows
 * from), so there is nothing to show as "3 active devices" — only a single
 * action that invalidates every token issued so far, this device included.
 * Confirmed inline rather than with a browser confirm() dialog, to match
 * the rest of the app's own destructive-action pattern.
 */
export function LogoutEverywhereButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Active sessions</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in somewhere you don&apos;t recognize? Log out of every device,
        including this one — you&apos;ll need to sign in again everywhere.
      </p>
      <div className="mt-4 flex items-center gap-3">
        {confirming ? (
          <>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  void logoutEverywhereAction();
                })
              }
            >
              {pending ? "Logging out..." : "Yes, log out everywhere"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            Log out of all devices
          </Button>
        )}
      </div>
    </Card>
  );
}
