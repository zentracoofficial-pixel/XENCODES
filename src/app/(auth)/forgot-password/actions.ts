"use server";

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmailSafe, passwordResetEmailContent } from "@/lib/email";
import { getBaseUrl } from "@/lib/site-url";
import { forgotPasswordSchema } from "@/lib/validation/auth";

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
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const resetUrl = `${getBaseUrl()}/reset-password?token=${token}`;
    // Non-throwing: this path deliberately answers identically whether or
    // not the address exists, so a delivery failure must not become the one
    // response difference that reveals a registered account.
    await sendEmailSafe({ to: email, ...passwordResetEmailContent(resetUrl) });
  }

  return { success: true };
}
