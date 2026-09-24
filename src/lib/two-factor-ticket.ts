import { SignJWT, jwtVerify } from "jose";

const TICKET_TTL_SECONDS = 5 * 60;

/**
 * Two distinct purposes, never interchangeable.
 *
 * "pending" is minted the instant a password check passes, before any TOTP
 * code has been seen, purely so the /two-factor page and its server action
 * know which account is mid-login. "verified" is minted only after
 * verifyTotpCode() has actually succeeded, and is the only kind
 * auth.ts's "ticket" sign-in mode will accept. Without this split, a
 * "pending" ticket alone (obtainable from the Set-Cookie header the moment
 * a correct password is submitted, before 2FA is ever checked) would be
 * sufficient to complete sign-in directly against NextAuth's credentials
 * callback, skipping the TOTP step entirely: the JWT itself carries no
 * record of whether a code was checked, only who is attempting to.
 */
export type TwoFactorTicketPurpose = "2fa-pending" | "2fa-verified";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

export async function createTwoFactorTicket(userId: string, purpose: TwoFactorTicketPurpose) {
  return new SignJWT({ purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** Returns the ticket's userId only when it matches the exact purpose
 *  asked for. A "pending" ticket verified against "verified" (or vice
 *  versa) returns null, the same as a forged or expired one. */
export async function verifyTwoFactorTicket(
  ticket: string,
  expectedPurpose: TwoFactorTicketPurpose,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(ticket, getSecret());
    if (payload.purpose !== expectedPurpose || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
