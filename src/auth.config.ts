import type { NextAuthConfig } from "next-auth";

// Edge-safe base config: no providers here, since the Credentials provider
// pulls in Prisma/bcrypt (Node-only) and would otherwise get bundled into
// the Edge proxy. The proxy only needs this to read the session JWT; the
// full config (with providers) lives in src/auth.ts.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Cheap gate for the proxy. Authoritative checks re-read the database,
        // since this claim is only as fresh as the token.
        token.role = (user as { role?: string }).role ?? "USER";
        // Explicit rather than relying on default claim merging, since the
        // proxy's ADMIN_EMAILS fallback below needs this to be reliably set.
        token.email = user.email ?? token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
  },
};
