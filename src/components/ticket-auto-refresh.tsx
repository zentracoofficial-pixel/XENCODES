"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 5000;

/**
 * Keeps a support-ticket conversation current without a manual reload.
 * Calls router.refresh() on an interval, which re-runs the ticket page's own
 * server-side data fetch in place — new messages, a status change, another
 * admin's reply. Nothing here decides what's new or holds any message state
 * itself: the server-rendered page stays the only source of truth, this
 * just asks it to re-render periodically while someone is sitting on it.
 */
export function TicketAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
