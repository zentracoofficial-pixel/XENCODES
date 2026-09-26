"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validation/auth";
import { createTwoFactorTicket } from "@/lib/two-factor-ticket";
import { TWO_FACTOR_COOKIE, TWO_FACTOR_CALLBACK_COOKIE } from "@/lib/two-factor-cookie";
import { safeRedirectPath } from "@/lib/safe-redirect";
import {
  isLockedOut,
  lockoutMinutesRemaining,
  registerFailedAttempt,
  clearFailedAttempts,
} from "@/lib/login-lockout";
import { clientIp } from "@/lib/request-ip";
import { isIpRateLimited, recordLoginFailure } from "@/lib/login-rate-limit";

/**
 * A fixed, precomputed bcrypt hash (cost 12, matching real password hashes)
 * that no real password will ever match. Compared against on an unknown
 * email so this path takes roughly the same time as a real wrong-password
 * check below, rather than returning immediately: without this, a response
 * time difference alone (near-instant for "no such account" vs. a real
 * bcrypt compare for "wrong password") is a timing oracle an attacker can
 * use to enumerate which emails have accounts, even though the error
 * message itself is already identical either way.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$z0O3k/q3jbmp.6LJprPwBetxZe/sUOYPXQpm74eds9mlhO.FFvWmS";

export interface LoginState {
  error?: string;
  requiresTwoFactor?: boolean;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { email, password } = parsed.data;
  const callbackUrl = safeRedirectPath(formData.get("callbackUrl"));
  const ip = await clientIp();

  // Checked before touching any specific account: this is the one guard
  // that sees attempts spread across many different email addresses from
  // the same source, which the per-account lockout below cannot.
  if (await isIpRateLimited(ip)) {
    return { error: "Too many attempts from this network. Try again in a few minutes." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    await recordLoginFailure(ip);
    return { error: "Invalid email or password." };
  }

  if (isLockedOut(user)) {
    return {
      error: `Too many failed attempts. Try again in about ${lockoutMinutesRemaining(user)} minute${lockoutMinutesRemaining(user) === 1 ? "" : "s"}.`,
    };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await registerFailedAttempt(user.id);
    await recordLoginFailure(ip);
    return { error: "Invalid email or password." };
  }

  if (user.twoFactorEnabled) {
    // Clearing here, not after the TOTP step: the password itself was
    // correct, and a mistyped TOTP code afterward is a separate guess
    // against the same shared budget, not a reason to make the customer
    // re-prove a password they already got right.
    await clearFailedAttempts(user.id);
    const ticket = await createTwoFactorTicket(user.id, "2fa-pending");
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 5 * 60,
      path: "/",
    };
    cookieStore.set(TWO_FACTOR_COOKIE, ticket, cookieOptions);
    cookieStore.set(TWO_FACTOR_CALLBACK_COOKIE, callbackUrl, cookieOptions);
    return { requiresTwoFactor: true };
  }

  await clearFailedAttempts(user.id);

  // Credentials are already verified above; this call always succeeds and
  // redirects to the callback URL, so nothing after it will run.
  await signIn("credentials", {
    mode: "password",
    email,
    password,
    redirectTo: callbackUrl,
  });

  return {};
}
