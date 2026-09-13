/**
 * Edge-safe: no Prisma import, so this can run inside proxy.ts (the Edge
 * runtime) as well as regular server code. Emails listed in ADMIN_EMAILS are
 * promoted to admin, so the first admin can be created on a fresh deployment
 * without shell access; the `role` column in the database remains the source
 * of truth for every actual access check.
 */
export function bootstrapAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdmin(email: string | null | undefined) {
  if (!email) return false;
  return bootstrapAdminEmails().includes(email.toLowerCase());
}
