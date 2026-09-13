import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { isBootstrapAdmin } from "@/lib/admin-emails";

const { auth } = NextAuth(authConfig);

export const proxy = auth((req) => {
  const { pathname, origin } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  // The role claim is frozen at whatever it was when this session's token
  // was issued, so also check ADMIN_EMAILS directly (Edge-safe, no Prisma
  // import) for anyone whose email only became a bootstrap admin after they
  // last logged in. requireAdmin() on the page itself is what actually
  // persists the promotion to the database; this only decides whether they
  // get that far instead of being bounced here first.
  const isAdmin =
    req.auth?.user?.role === "ADMIN" || isBootstrapAdmin(req.auth?.user?.email);

  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // First line of defence only. Every admin page and action also
    // re-checks the role against the database via requireAdmin().
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/dashboard", origin));
    }
    return;
  }

  if (pathname.startsWith("/dashboard") && !isLoggedIn) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
