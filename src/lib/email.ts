import { Resend } from "resend";

/**
 * Outbound email, through Resend.
 *
 * The rule this file exists to enforce: a send either provably reached the
 * provider, or it throws. There is no third outcome. An earlier version
 * returned normally when RESEND_API_KEY was unset and ignored the error
 * field Resend returns on a rejected send, so a campaign could report
 * "sent to 40 people" having delivered nothing at all. Every reported
 * success now corresponds to a provider response that actually accepted
 * the message.
 *
 * A second, equally real failure mode this file now also refuses: sending
 * from onboarding@resend.dev, Resend's own testing sender, which Resend
 * itself only allows to deliver to the account's own address — a real
 * customer email through it is rejected by Resend, which is exactly the
 * production incident this file is written to make impossible to repeat.
 * See resolveEmailFrom() below.
 */

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/** Resend's own testing-only sender. Fine for local development (there is no
 *  verified domain to send from there), never acceptable once NODE_ENV says
 *  this is actually running in production or on a Vercel preview — both are
 *  "not a developer's own machine", and a preview deployment can still be
 *  hit by a real signup or clicked by a real reviewer. */
const RESEND_TESTING_SENDER = "Xencodes <onboarding@resend.dev>";
const RESEND_TESTING_DOMAIN = "resend.dev";

function isProductionLikeDeployment(): boolean {
  // Matches the same signal the cron route already gates CRON_SECRET
  // enforcement on (see src/app/api/cron/sync-provider/route.ts) — one
  // consistent definition of "not a local dev machine" for the whole app,
  // rather than each file inventing its own.
  return process.env.NODE_ENV === "production";
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "unsafe_sender" | "rejected" | "network" = "rejected",
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

/**
 * The sender every send actually uses, decided once per call rather than
 * cached at module load: EMAIL_FROM is read fresh so a value fixed and
 * redeployed takes effect without needing this module reloaded a second
 * way, and so this stays honestly testable by setting the env var per test
 * rather than fighting module-load-order.
 *
 * In a production-like deployment (see isProductionLikeDeployment()), there
 * is no fallback: an unset EMAIL_FROM, or one that still names Resend's own
 * testing domain, throws here rather than silently sending — and every
 * caller of sendEmail() already has to handle EmailDeliveryError, so this
 * fails exactly the same way a rejected send already does, not a new kind
 * of failure the rest of the app has to learn about.
 */
function resolveEmailFrom(): string {
  const configured = process.env.EMAIL_FROM;

  if (isProductionLikeDeployment()) {
    if (!configured) {
      throw new EmailDeliveryError(
        "Production email sender is not configured. Configure a verified Xencodes sending address.",
        "not_configured",
      );
    }
    if (configured.toLowerCase().includes(RESEND_TESTING_DOMAIN)) {
      throw new EmailDeliveryError(
        "Production email sender is still configured with a Resend testing domain. Configure a verified Xencodes sending address.",
        "unsafe_sender",
      );
    }
    return configured;
  }

  // Local development / test: no verified domain exists to send from, so
  // the testing sender is an accepted, deliberate fallback here only.
  return configured ?? RESEND_TESTING_SENDER;
}

/** Whether this deployment can actually send. Checked before a campaign is
 *  recorded, so an unconfigured deployment refuses up front instead of
 *  writing a campaign row that could only ever fail. Does not check the
 *  sender's safety — see isProductionSenderUnsafe() for that, which is a
 *  distinct, more serious condition than "no API key at all". */
export function isEmailConfigured(): boolean {
  return resend !== null;
}

/**
 * True only when this is a production-like deployment (see
 * isProductionLikeDeployment()) whose sender is missing or is still
 * Resend's own testing domain — the exact condition that made real customer
 * verification emails bounce with Resend's "for testing" rejection. Read by
 * the admin settings page and the system-health rollup so this shows up as
 * a loud, specific warning rather than blending into the ordinary
 * "email not connected at all" state.
 */
export function isProductionSenderUnsafe(): boolean {
  if (!isProductionLikeDeployment()) return false;
  const configured = process.env.EMAIL_FROM;
  return !configured || configured.toLowerCase().includes(RESEND_TESTING_DOMAIN);
}

/** The address emails are sent from, for display in the admin panel. Shows
 *  the real configured value (even an unsafe one) so a misconfiguration is
 *  actually visible there, rather than throwing the way sendEmail() itself
 *  now does — a display helper must never be the thing that crashes a page. */
export function emailFromAddress(): string {
  const configured = process.env.EMAIL_FROM;
  if (configured) return configured;
  return isProductionLikeDeployment() ? "(not configured)" : RESEND_TESTING_SENDER;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends one email. Throws on anything that is not a confirmed acceptance by
 * Resend, including the case where no API key is configured, and including
 * the case where the sender itself is unsafe to use — see
 * resolveEmailFrom() above. Both are checked before Resend is ever called,
 * so a misconfigured production deployment fails the exact same way for
 * every email type (verification, password reset, support, purchase,
 * refund, recovery, admin), since every one of them calls this function.
 *
 * Resend's SDK reports a rejected send by returning `{ data: null, error }`
 * rather than by throwing, so the error field is the thing that actually
 * has to be checked; awaiting the call and moving on is exactly how a
 * failed send gets counted as a successful one.
 */
export async function sendEmail(
  { to, subject, html, text }: SendEmailInput,
): Promise<{ id: string | null }> {
  if (!resend) {
    throw new EmailDeliveryError(
      "RESEND_API_KEY is not set as an environment variable on this deployment.",
      "not_configured",
    );
  }

  // Resolved fresh, and allowed to throw before Resend is ever contacted:
  // an unsafe production sender is a configuration error, not something
  // worth spending a Resend API call on to discover.
  const from = resolveEmailFrom();

  let result: Awaited<ReturnType<typeof resend.emails.send>>;
  try {
    result = await resend.emails.send({ from, to, subject, html, text });
  } catch (error) {
    throw new EmailDeliveryError(
      `Could not reach Resend: ${error instanceof Error ? error.message : "network error"}`,
      "network",
    );
  }

  if (result.error) {
    throw new EmailDeliveryError(
      result.error.message || "Resend rejected the message without giving a reason.",
      "rejected",
    );
  }

  return { id: result.data?.id ?? null };
}

/**
 * For transactional email attached to an action that must still succeed if
 * the message cannot be delivered: a verification email failing should not
 * undo an account that was already created, nor surface a provider error to
 * someone who just filled in a signup form.
 *
 * Returns whether it sent, and logs the reason when it did not, so a
 * misconfigured deployment is visible in the function logs rather than
 * silently swallowed. Never use this for an admin campaign: there the
 * whole point is that the recorded outcome is the real one.
 */
export async function sendEmailSafe(input: SendEmailInput): Promise<boolean> {
  try {
    await sendEmail(input);
    return true;
  } catch (error) {
    console.error(
      `[email] failed to send "${input.subject}" to ${input.to}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
