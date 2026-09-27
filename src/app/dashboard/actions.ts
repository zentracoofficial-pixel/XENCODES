"use server";

import { auth, signOut } from "@/auth";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Signs out of the one shared session both customer and admin accounts use
 * (see auth.config.ts: single JWT-strategy NextAuth session, role decides
 * which UI a signed-in user lands in).
 *
 * signOut() alone only asks the browser to drop its session cookie — the
 * JWT itself would otherwise stay cryptographically valid until it expires
 * on its own (30 days by default), the same gap User.sessionVersion's own
 * schema comment already documents for password changes and "log out of
 * all devices" (see logoutEverywhereAction() below). A plain logout had
 * the identical gap: the browser is asked to forget the cookie, but
 * nothing stops a copy of that exact token — recovered from a bfcache
 * restore, a proxy that doesn't forward Set-Cookie, a network hiccup that
 * drops the clearing header while the earlier one lands, or simply a
 * client that ignores it — from still working, since the server had never
 * actually revoked it. Bumping sessionVersion here closes that: every
 * requireAdmin()/requireActiveUser()/getActiveUser() call re-checks it
 * against the database on every subsequent request (see src/lib/admin.ts,
 * src/lib/session.ts), so the token this device was just handed becomes
 * permanently unusable the moment this runs, regardless of what happens to
 * the cookie afterward.
 *
 * This does mean logging out on one device also signs the same account out
 * everywhere else it's currently signed in, exactly like
 * logoutEverywhereAction() below — there is no cheaper way to revoke one
 * specific already-issued JWT in a session-less, JWT-only setup. That is
 * the deliberate, secure-by-default trade-off "log out" makes here, not an
 * accident: it never touches another account's session, only this one's.
 */
export async function logoutAction() {
  const session = await auth();
  if (session?.user?.id) {
    // Best-effort: a user row that's gone or a database hiccup should
    // never prevent someone from actually leaving the page they're on.
    await prisma.user
      .update({ where: { id: session.user.id }, data: { sessionVersion: { increment: 1 } } })
      .catch((error) => {
        console.error(`[logout] failed to bump sessionVersion for ${session.user.id}:`, error);
      });
  }
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
