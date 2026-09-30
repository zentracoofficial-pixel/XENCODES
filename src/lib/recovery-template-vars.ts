/**
 * Split out from src/lib/recovery.ts (which pulls in Prisma, email sending,
 * and other server-only code) purely so the admin recovery composer — a
 * client component — can list these variable names to the admin without
 * bundling server-only code into the browser. src/lib/recovery.ts re-uses
 * these same constants for the actual substitution; this file has no logic
 * of its own, only the shared allow-list.
 */

/** Every variable a recovery email (manual or automatic) may reference.
 *  Anything in the template that is not one of these exact tokens is left
 *  as plain, literal text — never evaluated, never treated as a lookup
 *  into any other field. */
export const RECOVERY_TEMPLATE_VARIABLES = [
  "first_name",
  "email",
  "failed_count",
  "successful_count",
  "service",
  "country",
  "recommended_country",
] as const;

export type RecoveryTemplateVariables = Record<(typeof RECOVERY_TEMPLATE_VARIABLES)[number], string>;
