import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

/**
 * Server-side guard for the customer dashboard, mirroring requireAdmin().
 *
 * The session strategy is JWT: a token issued before an account was
 * suspended or deleted stays cryptographically valid until it expires on
 * its own, since nothing about revoking one is encoded in the token itself.
 * This is what actually closes that gap for a signed-in customer, by
 * re-reading the account fresh on every dashboard page load rather than
 * trusting the token's claims. Deletion anonymises a row rather than
 * removing it (see User.deletedAt), so "the user is gone" has to be read
 * from that flag, not from a missing row.
 */
export async function requireActiveUser(): Promise<User> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    redirect("/login");
  }

  return user;
}

/**
 * The same re-check, but returns null instead of redirecting.
 *
 * requireActiveUser() is for a page/layout render, where throwing a
 * redirect is exactly the right behaviour. A server action invoked
 * directly by a client component (a fetch-based call, not a page
 * navigation) is a different context: it already has its own "not signed
 * in" handling that returns a typed error result, and a suspended or
 * deleted account should fold into that same soft-failure path rather than
 * throwing a redirect a caller wired for a plain return value does not
 * expect. Every dashboard server action that mutates something (changing a
 * password, starting a wallet top up, opening a support ticket) should use
 * this rather than trusting session.user.id alone, since the JWT itself
 * stays valid for the life of the token regardless of what happens to the
 * account afterward.
 */
export async function getActiveUser(): Promise<User | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.deletedAt || user.status !== "ACTIVE") return null;

  return user;
}
