"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { signIn } from "@/auth";
import { sendVerificationEmail } from "@/lib/verification";
import { registerSchema } from "@/lib/validation/auth";
import { requestCountry, currencyForCountry } from "@/lib/currency-config";

export interface RegisterState {
  error?: string;
}

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists." };
  }

  // The form only ever offers NGN or USD; a submission naming anything
  // else (a stale value, a tampered request) falls back to the same
  // location-based guess the form itself was pre-selected from, never to
  // whatever string was sent.
  const requestedCurrency = (formData.get("currency") as string)?.trim().toUpperCase();
  const currency =
    requestedCurrency === "NGN" || requestedCurrency === "USD"
      ? requestedCurrency
      : currencyForCountry(await requestCountry());

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await prisma.user.create({
      data: { email, passwordHash, currency },
    });
  } catch (error) {
    // The findUnique check above is not race-safe on its own: two
    // concurrent registrations for the same address can both pass it
    // before either commits. The database's own unique constraint on
    // email is what actually prevents a duplicate row; this only turns the
    // loser's constraint violation into the same friendly message the
    // up-front check gives, instead of an unhandled exception.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "An account with this email already exists." };
    }
    throw error;
  }

  // Never throws (see its own return type): the account already exists at
  // this point, so a mail provider outage must not turn a completed signup
  // into an error. Logged rather than surfaced, so a misconfigured
  // deployment is visible in the function logs; the pending-verification
  // screen's own resend button is the customer-facing recovery path if this
  // first attempt didn't land.
  const firstSend = await sendVerificationEmail(user);
  if (!firstSend.ok) {
    console.error(`[register] initial verification email to ${user.email} failed: ${firstSend.reason}`);
  }

  // Signed in immediately, the same way loginAction() signs a customer in
  // after checking their password: an unverified account is a fully usable
  // account here (see the restrictions actually enforced in
  // src/app/dashboard/buy/actions.ts, not a login gate), so there is no
  // reason to make someone who just proved their password twice log in
  // again to reach it. Credentials are already known-good (this password
  // hashed straight into the row above), so this call always succeeds and
  // redirects; nothing after it runs.
  await signIn("credentials", {
    mode: "password",
    email,
    password,
    redirectTo: "/verify-email",
  });

  return {};
}
