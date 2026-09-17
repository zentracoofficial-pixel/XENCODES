import type { WalletTransactionStatus } from "@/generated/prisma/client";

/** How a wallet transaction's status is coloured, in one place. */
export const WALLET_STATUS_VARIANT: Record<
  WalletTransactionStatus,
  "warning" | "success" | "danger" | "neutral"
> = {
  PENDING: "warning",
  SUCCESSFUL: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};
