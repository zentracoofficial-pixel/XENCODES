/**
 * What a customer calls each server. Server I keeps its name; Server II is
 * sold as "Premium". Client-safe on purpose (no provider imports), so the
 * buy panel and the activation page share one spelling.
 */
export const PREMIUM_NAME = "Premium";

export function serverName(server: string): string {
  return server === "II" ? PREMIUM_NAME : `Server ${server}`;
}
