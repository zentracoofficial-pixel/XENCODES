"use server";

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmailSafe } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { passwordResetEmail } from "@/lib/email-messages";
import { SITE_URL } from "@/lib/site";
import { forgotPasswordSchema } from "@/lib/validation/auth";

/** How many reset emails one account may be sent within the window. */
const MAX_RESET_EMAILS_PER_WINDOW = 3;
const RESET_WINDOW_MS = 60 * 60 * 1000;

export interface ForgotPasswordState {
  error?: string;
  success?: boolean;
}

export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always report success, regardless of whether the account exists, so
  // this endpoint can't be used to enumerate registered email addresses.
  // At most a few reset emails per account an hour: without it, anyone could
  // use this form to flood a person's inbox. Answered exactly like a sent
  // email, so the limit reveals nothing.
  const recentRequests = user
    ? await prisma.passwordResetToken.count({
        where: { userId: user.id, createdAt: { gte: new Date(Date.now() - RESET_WINDOW_MS) } },
      })
    : 0;

  if (user && recentRequests < MAX_RESET_EMAILS_PER_WINDOW) {
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const resetUrl = `${SITE_URL}/reset-password?token=${token}`;
    // Non-throwing: this path deliberately answers identically whether or
    // not the address exists, so a delivery failure must not become the one
    // response difference that reveals a registered account.
    await sendEmailSafe({ to: email, ...renderEmail(passwordResetEmail(resetUrl)) });
  }

  return { success: true };
}
