"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { createTwoFactorTicket, verifyTwoFactorTicket } from "@/lib/two-factor-ticket";
import { verifyTotpCode } from "@/lib/totp";
import { TWO_FACTOR_COOKIE, TWO_FACTOR_CALLBACK_COOKIE } from "@/lib/two-factor-cookie";
import { twoFactorCodeSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { isLockedOut, lockoutMinutesRemaining, registerFailedAttempt, clearFailedAttempts } from "@/lib/login-lockout";

export interface TwoFactorState {
  error?: string;
}

export async function verifyTwoFactorAction(
  _prevState: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const parsed = twoFactorCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid code." };
  }

  const cookieStore = await cookies();
  const ticket = cookieStore.get(TWO_FACTOR_COOKIE)?.value;
  if (!ticket) {
    return { error: "Your session has expired. Please log in again." };
  }

  const userId = await verifyTwoFactorTicket(ticket, "2fa-pending");
  if (!userId) {
    return { error: "Your session has expired. Please log in again." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return { error: "Two-factor authentication is not set up for this account." };
  }

  if (isLockedOut(user)) {
    return {
      error: `Too many failed attempts. Try again in about ${lockoutMinutesRemaining(user)} minute${lockoutMinutesRemaining(user) === 1 ? "" : "s"}.`,
    };
  }

  const isValid = await verifyTotpCode(user.twoFactorSecret, parsed.data.code);
  if (!isValid) {
    // Guards against unlimited automated guessing against a 6-digit code
    // while a valid (password-verified) pending ticket is held: without
    // this, the only thing standing between an attacker and the account is
    // however many guesses fit in the ticket's 5-minute window.
    await registerFailedAttempt(userId);
    return { error: "That code is incorrect or has expired." };
  }

  await clearFailedAttempts(userId);

  const callbackUrl = safeRedirectPath(cookieStore.get(TWO_FACTOR_CALLBACK_COOKIE)?.value);
  cookieStore.delete(TWO_FACTOR_COOKIE);
  cookieStore.delete(TWO_FACTOR_CALLBACK_COOKIE);

  // A fresh ticket, minted only now that the TOTP code has actually been
  // checked. The "pending" ticket above proves only "this is the account
  // that just passed a password check" and must never itself be accepted
  // by auth.ts's sign-in step, or 2FA would be bypassable with a password
  // alone. This "verified" ticket is what auth.ts requires instead.
  const verifiedTicket = await createTwoFactorTicket(userId, "2fa-verified");

  // Ticket and TOTP code are already verified above; this call always
  // succeeds and redirects to the callback URL.
  await signIn("credentials", {
    mode: "ticket",
    ticket: verifiedTicket,
    redirectTo: callbackUrl,
  });

  return {};
}
