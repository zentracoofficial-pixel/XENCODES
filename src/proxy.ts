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
    return noStore(NextResponse.next());
  }

  if (pathname.startsWith("/dashboard") && !isLoggedIn) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin accounts run the business; they don't also shop with the same
  // login. Anyone who wants to buy a number, including an admin, uses an
  // ordinary account, so a signed-in admin lands back in the admin panel
  // instead of the customer dashboard or checkout.
  if (isLoggedIn && isAdmin && (pathname.startsWith("/dashboard") || pathname === "/buy")) {
    return NextResponse.redirect(new URL("/admin", origin));
  }

  return noStore(NextResponse.next());
});

/**
 * Every response this proxy hands back for an authenticated area is marked
 * uncacheable, so a browser's back/forward cache can't resurrect a
 * rendered admin or dashboard page after logout. Session validity alone
 * isn't enough for this: a bfcache restore can show the last paint without
 * making a new request at all, and logout only stops the *next* request
 * from succeeding, not a cached one from being shown.
 */
function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/buy"],
};
