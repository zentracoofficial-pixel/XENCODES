"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { verifyTwoFactorTicket } from "@/lib/two-factor-ticket";
import { verifyTotpCode } from "@/lib/totp";
import { TWO_FACTOR_COOKIE, TWO_FACTOR_CALLBACK_COOKIE } from "@/lib/two-factor-cookie";
import { twoFactorCodeSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";

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

  const userId = await verifyTwoFactorTicket(ticket);
  if (!userId) {
    return { error: "Your session has expired. Please log in again." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return { error: "Two-factor authentication is not set up for this account." };
  }

  const isValid = await verifyTotpCode(user.twoFactorSecret, parsed.data.code);
  if (!isValid) {
    return { error: "That code is incorrect or has expired." };
  }

  const callbackUrl = safeRedirectPath(cookieStore.get(TWO_FACTOR_CALLBACK_COOKIE)?.value);
  cookieStore.delete(TWO_FACTOR_COOKIE);
  cookieStore.delete(TWO_FACTOR_CALLBACK_COOKIE);

  // Ticket and TOTP code are already verified above; this call always
  // succeeds and redirects to the callback URL.
  await signIn("credentials", {
    mode: "ticket",
    ticket,
    redirectTo: callbackUrl,
  });

  return {};
}
