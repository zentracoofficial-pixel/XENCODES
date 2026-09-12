import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";

/**
 * Emails listed here are promoted to admin on sign-in. This exists so the
 * first admin can be created on a fresh deployment without shell access;
 * the `role` column remains the source of truth for every access check.
 */
export function bootstrapAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdmin(email: string) {
  return bootstrapAdminEmails().includes(email.toLowerCase());
}

/**
 * Server-side guard for every admin page and action. Never rely on the proxy
 * alone: it only sees the session token, not the current role in the
 * database, so a demoted admin would keep access until their token expired.
 */
export async function requireAdmin(): Promise<User> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/admin");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") {
    // Don't reveal that /admin exists to non-admins.
    redirect("/dashboard");
  }

  return user;
}
