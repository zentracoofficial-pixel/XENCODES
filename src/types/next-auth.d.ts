import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      /** Stamped at sign-in; compared against the live User.sessionVersion
       *  column on every authoritative check (see requireActiveUser() /
       *  requireAdmin()) so a password change or "log out everywhere" can
       *  invalidate an existing JWT before it would otherwise expire. */
      sessionVersion?: number;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "USER" | "ADMIN";
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "USER" | "ADMIN";
    sessionVersion?: number;
  }
}
