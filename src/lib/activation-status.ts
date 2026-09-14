import type { ActivationStatus } from "@/generated/prisma/client";

/**
 * How an activation's status is written and coloured, in one place.
 *
 * These two maps were previously copy-pasted into four pages, which meant
 * adding a status to the enum broke each of them separately and a wording
 * change only ever got made in whichever copy someone happened to open.
 */

export const ACTIVATION_STATUS_LABEL: Record<ActivationStatus, string> = {
  WAITING: "Waiting",
  RECEIVED: "Delivered",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export const ACTIVATION_STATUS_VARIANT: Record<
  ActivationStatus,
  "warning" | "success" | "danger" | "neutral"
> = {
  WAITING: "warning",
  RECEIVED: "success",
  EXPIRED: "danger",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};
