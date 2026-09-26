"use server";

import { signOut } from "@/auth";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}

/**
 * Dismisses the dashboard's low-balance warning at the balance it was shown
 * at. See shouldShowLowBalanceWarning() in src/lib/low-balance.ts for why
 * this is "dismissed at this balance" rather than a permanent flag.
 */
export async function dismissLowBalanceWarningAction(balanceKobo: number): Promise<void> {
  const user = await getActiveUser();
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { lowBalanceDismissedAtKobo: balanceKobo },
  });
}
