import { headers } from "next/headers";

/**
 * The caller's IP, as Vercel's edge network reports it. `x-forwarded-for`
 * can carry a chain of proxies (client, then any intermediate ones); the
 * first entry is the original client. Falls back to `x-real-ip`, then to
 * "unknown" for local development, where neither header is set — callers
 * must treat "unknown" as "cannot rate-limit this", never as a real shared
 * identity multiple requests would collide under.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}
