import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * A plain liveness check, and a fast way to tell whether a deployment
 * actually rebuilt from a given commit: Vercel sets VERCEL_GIT_COMMIT_SHA
 * itself, so the value returned here is what is actually running, not
 * what the dashboard claims is running.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    checkedAt: new Date().toISOString(),
  });
}
