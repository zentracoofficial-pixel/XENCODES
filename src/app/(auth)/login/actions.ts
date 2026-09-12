"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validation/auth";
import { createTwoFactorTicket } from "@/lib/two-factor-ticket";
import { TWO_FACTOR_COOKIE, TWO_FACTOR_CALLBACK_COOKIE } from "@/lib/two-factor-cookie";
import { safeRedirectPath } from "@/lib/safe-redirect";

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

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "Invalid email or password." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password." };
  }

  if (user.twoFactorEnabled) {
    const ticket = await createTwoFactorTicket(user.id);
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
