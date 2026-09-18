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
