"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { sendEmailSafe, verificationEmailContent } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { registerSchema } from "@/lib/validation/auth";
import { getEnabledCurrencies } from "@/lib/currency-config";

export interface RegisterState {
  error?: string;
  success?: boolean;
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

  // The picker only ever offers what an admin has actually enabled; a
  // submission naming anything else (a stale value, a tampered request)
  // falls back to the platform default rather than creating an account in
  // a currency nobody configured a rate for.
  const enabled = await getEnabledCurrencies();
  const requestedCurrency = (formData.get("currency") as string)?.trim().toUpperCase();
  const currency = enabled.find((c) => c.code === requestedCurrency)?.code ?? enabled[0]?.code ?? "NGN";

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

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.emailVerificationToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const verifyUrl = `${SITE_URL}/verify-email?token=${token}`;
  // Non-throwing: the account already exists at this point, so a mail
  // provider outage must not turn a completed signup into an error.
  await sendEmailSafe({ to: email, ...verificationEmailContent(verifyUrl) });

  return { success: true };
}
