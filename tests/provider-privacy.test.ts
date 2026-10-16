import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Provider privacy: nothing a customer's browser can load names a supplier.
 * Customer-facing code (everything outside the admin, the provider adapters
 * and their webhooks) must not contain a supplier's name at all, not even in
 * a comment, and the copy a customer reads must not mention suppliers.
 */

const SUPPLIER = /grizzly|dogesms|doge\s*sms/i;
const CUSTOMER_FACING = ["src/components", "src/app/(marketing)", "src/app/(auth)", "src/app/dashboard", "src/app/api/inventory"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|mts)$/.test(name) ? [path] : [];
  });
}

test("customer-facing code never names a supplier", () => {
  const leaks = CUSTOMER_FACING.flatMap(files).filter((file) => SUPPLIER.test(readFileSync(file, "utf8")));
  assert.deepEqual(leaks, []);
});

test("customer messages about availability say nothing about suppliers or configuration", async () => {
  const { CUSTOMER_UNAVAILABLE_MESSAGE } = await import("../src/lib/inventory");
  assert.doesNotMatch(CUSTOMER_UNAVAILABLE_MESSAGE, /provider|supplier|credential|configur|deployment/i);
  const quoteRoute = readFileSync("src/app/api/inventory/quote/route.ts", "utf8");
  // Import paths ("@/lib/provider/...") are code, not words a customer reads.
  const messages = (quoteRoute.match(/"[^"\n]{20,}"/g) ?? []).filter((text) => !text.startsWith('"@/'));
  for (const message of messages) assert.doesNotMatch(message, /provider|supplier/i, message);
});

test("what the order screens receive carries no supplier fields", async () => {
  const { toActivationState } = await import("../src/lib/activation-lifecycle");
  const state = toActivationState({
    id: "a", serviceSlug: "whatsapp", serviceName: "WhatsApp", countryName: "Kenya", phoneNumber: "1",
    priceKobo: 1, currency: "NGN", displayCurrency: null, displayPriceMinor: null, status: "WAITING", code: null,
    expiresAt: new Date(), createdAt: new Date(), receivedAt: null,
    provider: "dogesms", providerOrderId: "secret-order", providerServiceId: "x", providerCountryId: "y", providerOfferId: "z",
  } as never);
  assert.doesNotMatch(JSON.stringify(state), /dogesms|secret-order|provider/i);
});
