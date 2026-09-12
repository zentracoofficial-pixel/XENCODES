"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validation/auth";
import { createTwoFactorTicket } from "@/lib/two-factor-ticket";
import { TWO_FACTOR_COOKIE } from "@/lib/two-factor-cookie";

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
    cookieStore.set(TWO_FACTOR_COOKIE, ticket, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 5 * 60,
      path: "/",
    });
    return { requiresTwoFactor: true };
  }

  // Credentials are already verified above; this call always succeeds and
  // redirects to /dashboard, so nothing after it will run.
  await signIn("credentials", {
    mode: "password",
    email,
    password,
    redirectTo: "/dashboard",
  });

  return {};
}
