/**
 * Number/SMS provider abstraction.
 *
 * This is a mock implementation that simulates assigning a phone number and
 * later "delivering" an SMS code, so the buy flow works end to end without a
 * real provider connected. Swap the internals of these two functions for a
 * real provider's API client when one is integrated — nothing in the buy
 * flow or dashboard needs to change.
 */

const SESSION_SECONDS = 10 * 60; // how long a purchased number stays active
const MIN_DELIVERY_SECONDS = 5;
const MAX_DELIVERY_SECONDS = 45;

export interface AssignedNumber {
  phoneNumber: string;
  sessionSeconds: number;
  deliverInSeconds: number;
}

function randomDigits(count: number) {
  let out = "";
  for (let i = 0; i < count; i++) out += Math.floor(Math.random() * 10);
  return out;
}

export function assignNumber(dialCode: string): AssignedNumber {
  const phoneNumber = `${dialCode}${randomDigits(9)}`;
  const deliverInSeconds =
    MIN_DELIVERY_SECONDS +
    Math.floor(Math.random() * (MAX_DELIVERY_SECONDS - MIN_DELIVERY_SECONDS));

  return {
    phoneNumber,
    sessionSeconds: SESSION_SECONDS,
    deliverInSeconds,
  };
}

export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
