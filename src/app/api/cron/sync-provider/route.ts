import { NextResponse } from "next/server";
import { runProviderSync } from "@/lib/provider-sync";

export const dynamic = "force-dynamic";
// A full catalog sync reads the supplier's whole catalog in a handful of
// requests (see NumberProvider.getFullCatalog) and then writes it in one
// transaction, so the headroom here is mostly for the write on a large
// catalog. 60 is not a deliberate budget, it is the ceiling: Vercel's Hobby
// plan hard-caps every function at 60 seconds and refuses to deploy a
// project that declares more, so anything higher here breaks every
// deployment, not just this route. Raise it once this project is on a paid
// plan.
export const maxDuration = 60;

/**
 * Triggered by Vercel Cron on the schedule in vercel.json: once daily, the
 * most frequent a Hobby-plan project is allowed to declare (Vercel refuses
 * to deploy a more frequent one at all, which is exactly the config error
 * that silently blocked every deployment before this comment was fixed to
 * say so).
 *
 * Vercel signs its own cron requests with a bearer token equal to
 * CRON_SECRET, documented at vercel.com/docs/cron-jobs/manage-cron-jobs.
 * Checked here so this endpoint cannot be used by anyone else to force a
 * sync, or to (harmlessly, since it can only read from the supplier and
 * write to SyncedOffer, never touch a wallet or an order) spam the
 * supplier's API from outside.
 *
 * With CRON_SECRET unset outside production, the check is skipped rather
 * than failing closed: that keeps a manual `curl` against this route usable
 * in an environment that has not set the secret (this sandbox, most local
 * dev), rather than every dev/preview environment without it silently never
 * syncing. In production, an unset CRON_SECRET fails closed instead: a real
 * deployment with no secret configured would otherwise leave this route
 * open to unauthenticated triggering from anywhere on the internet, which a
 * missing environment variable should never silently do.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron] CRON_SECRET is not set; refusing to run in production.");
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 401 });
  }

  const result = await runProviderSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
