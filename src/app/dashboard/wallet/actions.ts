"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { creditWallet } from "@/lib/wallet";

const PRESET_AMOUNTS_CENTS = [1000, 2500, 5000, 10000];

export async function addFundsAction(amountCents: number) {
  if (!PRESET_AMOUNTS_CENTS.includes(amountCents)) {
    throw new Error("Invalid amount");
  }

  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await creditWallet(session.user.id, amountCents, "TOPUP", "Wallet top-up");
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard");
}
