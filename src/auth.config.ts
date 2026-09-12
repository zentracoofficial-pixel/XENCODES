import type { NextAuthConfig } from "next-auth";

// Edge-safe base config: no providers here, since the Credentials provider
// pulls in Prisma/bcrypt (Node-only) and would otherwise get bundled into
// the Edge middleware. Middleware only needs this to read/verify the
// session JWT; the full config (with providers) lives in src/auth.ts.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
