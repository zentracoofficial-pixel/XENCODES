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

/**
 * The same five states in operational wording, for the admin.
 *
 * There is no separate "processing" state, because there is nothing
 * between the two: an order is either waiting on its code or settled. A
 * state that never occurs is a filter that always returns nothing.
 */
export const ORDER_STATUS_LABEL: Record<ActivationStatus, string> = {
  WAITING: "Pending",
  RECEIVED: "Completed",
  EXPIRED: "Failed",
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
