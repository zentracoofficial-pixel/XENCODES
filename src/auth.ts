import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTwoFactorTicket } from "@/lib/two-factor-ticket";
import { authConfig } from "@/auth.config";

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

          return { id: user.id, email: user.email, name: user.name };
        }

        if (mode === "ticket") {
          const ticket = raw?.ticket as string | undefined;
          if (!ticket) return null;

          const userId = await verifyTwoFactorTicket(ticket);
          if (!userId) return null;

          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user || !user.twoFactorEnabled) return null;

          return { id: user.id, email: user.email, name: user.name };
        }

        return null;
      },
    }),
  ],
});
