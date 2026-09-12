"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { creditWallet } from "@/lib/wallet";
import { TOP_UP_AMOUNTS_NAIRA } from "./top-up-amounts";
import { nairaToKobo } from "@/lib/currency";

export async function addFundsAction(amountNaira: number) {
  if (!TOP_UP_AMOUNTS_NAIRA.includes(amountNaira)) {
    throw new Error("Invalid amount");
  }

  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await creditWallet(session.user.id, nairaToKobo(amountNaira), "TOPUP", "Wallet top-up");
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard");
}
