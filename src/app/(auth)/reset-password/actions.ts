"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validation/auth";

export interface ResetPasswordState {
  error?: string;
  success?: boolean;
}

export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { token, password } = parsed.data;

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // sessionVersion is bumped here too, exactly like changePasswordAction()
  // in src/app/dashboard/settings/actions.ts: a password reset is the one
  // moment someone most plausibly needed to lock out a session they don't
  // control (a stolen cookie, a shared machine, a compromised device), so
  // every already-issued JWT — including on whatever device is still
  // signed in — must stop working immediately rather than staying valid
  // until it expires on its own. See User.sessionVersion's own schema
  // comment for why this is the only revocation mechanism a JWT-only
  // session strategy has.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { success: true };
}
