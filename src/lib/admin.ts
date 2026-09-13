import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";
import { bootstrapAdminEmails, isBootstrapAdmin } from "@/lib/admin-emails";

export { bootstrapAdminEmails, isBootstrapAdmin };

/**
 * Server-side guard for every admin page and action.
 *
 * This re-checks ADMIN_EMAILS on every call, not just at sign-in: the JWT's
 * role claim is frozen the moment it's issued, so a bootstrap admin whose
 * env var only became live after their last login would otherwise be stuck
 * outside the panel until they found their way to sign out and back in.
 * Checking here means a live env var takes effect on the very next page
 * load, no fresh login required, and the promotion is persisted to the
 * database immediately.
 *
 * Never rely on the proxy alone: it only sees the session token, not the
 * current role in the database, so a demoted admin would keep access until
 * their token expired.
 */
export async function requireAdmin(): Promise<User> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/admin");

  let user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/dashboard");

  if (user.role !== "ADMIN" && isBootstrapAdmin(user.email)) {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  }

  if (user.role !== "ADMIN" || user.status !== "ACTIVE") {
    // Don't reveal that /admin exists to non-admins.
    redirect("/dashboard");
  }

  return user;
}
