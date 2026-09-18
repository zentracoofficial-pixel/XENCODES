import { NextResponse } from "next/server";
import { runProviderSync } from "@/lib/provider-sync";

export const dynamic = "force-dynamic";
// A full catalog sync makes one supplier request per service, sequentially.
// The platform default route timeout is too short for that on a large
// catalog; this route gets the longest budget Vercel allows so a slow
// supplier response does not cut a sync off partway through a write.
export const maxDuration = 300;

/**
 * Triggered by Vercel Cron on the schedule in vercel.json (hourly).
 *
 * Vercel signs its own cron requests with a bearer token equal to
 * CRON_SECRET, documented at vercel.com/docs/cron-jobs/manage-cron-jobs.
 * Checked here so this endpoint cannot be used by anyone else to force a
 * sync, or to (harmlessly, since it can only read from the supplier and
 * write to SyncedOffer, never touch a wallet or an order) spam the
 * supplier's API from outside.
 *
 * With CRON_SECRET unset, the check is skipped rather than failing closed:
 * that keeps a manual `curl` against this route usable in an environment
 * that has not set the secret (this sandbox, most local dev), rather than
 * every environment without it silently never syncing. Production should
 * always set CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const result = await runProviderSync();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
