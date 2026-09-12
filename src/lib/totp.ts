import { generateSecret, generateURI, verify } from "otplib";

const ISSUER = "Xencodes";

export function createTwoFactorSecret() {
  return generateSecret();
}

export function totpProvisioningUri(email: string, secret: string) {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export async function verifyTotpCode(secret: string, code: string) {
  const result = await verify({ secret, token: code });
  return result.valid;
}
