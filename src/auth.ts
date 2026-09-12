import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTwoFactorTicket } from "@/lib/two-factor-ticket";
import { isBootstrapAdmin } from "@/lib/admin";
import { authConfig } from "@/auth.config";
import type { User } from "@/generated/prisma/client";

/**
 * Runs once a user has proven who they are. Suspended accounts are refused,
 * and any email listed in ADMIN_EMAILS is promoted so a fresh deployment can
 * get its first admin without shell access.
 */
async function completeSignIn(user: User) {
  if (user.status === "SUSPENDED") return null;

  let role = user.role;
  if (role !== "ADMIN" && isBootstrapAdmin(user.email)) {
    const promoted = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
    role = promoted.role;
  }

  return { id: user.id, email: user.email, name: user.name, role };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      id: "credentials",
      credentials: {
        mode: {},
        email: {},
        password: {},
        ticket: {},
      },
      authorize: async (raw) => {
        const mode = raw?.mode as string | undefined;

        if (mode === "password") {
          const email = (raw?.email as string | undefined)?.toLowerCase().trim();
          const password = raw?.password as string | undefined;
          if (!email || !password) return null;

          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;

          // Accounts with 2FA enabled must go through the "ticket" mode below.
          if (user.twoFactorEnabled) return null;

          return completeSignIn(user);
        }

        if (mode === "ticket") {
          const ticket = raw?.ticket as string | undefined;
          if (!ticket) return null;

          const userId = await verifyTwoFactorTicket(ticket);
          if (!userId) return null;

          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user || !user.twoFactorEnabled) return null;

          return completeSignIn(user);
        }

        return null;
      },
    }),
  ],
});
