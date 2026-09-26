"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createTwoFactorSecret, totpProvisioningUri, verifyTotpCode } from "@/lib/totp";
import { passwordSchema } from "@/lib/validation/auth";

/** A suspended or "deleted" account keeps a valid JWT until it expires on
 *  its own; this is what actually stops it from changing a password or
 *  touching 2FA in the meantime, since a bare session check would not. */
async function requireUserId() {
  const user = await getActiveUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export interface ChangePasswordState {
  error?: string;
  success?: boolean;
}

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const userId = await requireUserId();
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;

  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(currentPassword ?? "", user.passwordHash);
  if (!valid) {
    return { error: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(parsed.data, 12);
  // Bumping sessionVersion here, alongside the password itself, is what
  // actually logs out every other device: sessions are JWT-only (see
  // User.sessionVersion's schema comment), so there is no session row
  // elsewhere to delete — this is the one thing that makes an
  // already-issued token stop working before it would otherwise expire.
  // This device's own token is stamped with the *old* version too, so it
  // is invalidated exactly the same as every other one — there is no cheap
  // way to re-mint just this device's JWT in place from inside a server
  // action. Signing out here and asking for a fresh sign-in is the honest
  // version of that, rather than showing "success" and leaving a token
  // that silently stops working on the very next click.
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  await signOut({ redirectTo: "/login?reason=password_changed" });
  return { success: true };
}

export interface LogoutEverywhereState {
  success?: boolean;
}

/**
 * "Log out of all devices." Bumps sessionVersion, which invalidates every
 * JWT already issued — including this one, since a JWT session has nothing
 * server-side to leave this device signed in while revoking only others.
 * Ends by signing this browser out too, so the result is unambiguous: every
 * device, this one included, needs to sign in again.
 */
export async function logoutEverywhereAction(): Promise<LogoutEverywhereState> {
  const userId = await requireUserId();
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
  await signOut({ redirectTo: "/login?reason=logged_out_everywhere" });
  return { success: true };
}

export interface TwoFactorEnrollment {
  secret: string;
  qrDataUrl: string;
}

export async function startTwoFactorEnrollmentAction(): Promise<TwoFactorEnrollment> {
  const userId = await requireUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const secret = createTwoFactorSecret();
  await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });

  const uri = totpProvisioningUri(user.email, secret);
  const qrDataUrl = await QRCode.toDataURL(uri);

  return { secret, qrDataUrl };
}

export interface ConfirmTwoFactorState {
  error?: string;
  success?: boolean;
}

export async function confirmTwoFactorEnrollmentAction(
  _prev: ConfirmTwoFactorState,
  formData: FormData,
): Promise<ConfirmTwoFactorState> {
  const userId = await requireUserId();
  const code = (formData.get("code") as string)?.trim();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorSecret) {
    return { error: "Start enrollment again." };
  }

  const isValid = await verifyTotpCode(user.twoFactorSecret, code ?? "");
  if (!isValid) {
    return { error: "That code is incorrect." };
  }

  await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
  revalidatePath("/dashboard/settings");
  return { success: true };
}

export interface DisableTwoFactorState {
  error?: string;
  success?: boolean;
}

export async function disableTwoFactorAction(
  _prev: DisableTwoFactorState,
  formData: FormData,
): Promise<DisableTwoFactorState> {
  const userId = await requireUserId();
  const password = formData.get("password") as string;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await bcrypt.compare(password ?? "", user.passwordHash);
  if (!valid) {
    return { error: "Password is incorrect." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  revalidatePath("/dashboard/settings");
  return { success: true };
}
