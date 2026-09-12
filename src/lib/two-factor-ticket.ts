import { SignJWT, jwtVerify } from "jose";

const TICKET_TTL_SECONDS = 5 * 60;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set.");
  }
  return new TextEncoder().encode(secret);
}

export async function createTwoFactorTicket(userId: string) {
  return new SignJWT({ purpose: "2fa-pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyTwoFactorTicket(ticket: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(ticket, getSecret());
    if (payload.purpose !== "2fa-pending" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
