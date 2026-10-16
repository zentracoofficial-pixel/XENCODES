"use client";

import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDuration, formatWhen, syncResultBadge } from "./sync-report";

const TRIGGER: Record<string, string> = { manual: "Sync now", manual_all: "Sync all", cron: "Daily schedule" };

/** The latest sync runs of every server, newest first. Admin only. */
export function SyncHistoryCard({
  runs,
}: {
  runs: Array<{
    id: string;
    label: string;
    trigger: string;
    startedAt: string;
    durationMs: number;
    result: string;
    offersSynced: number | null;
    countriesRead: number | null;
    countriesTotal: number | null;
    message: string | null;
  }>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-soft text-forest">
          <History className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Sync history</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">The latest sync of each server, whether started here or by the daily schedule.</p>
        </div>
      </div>
      {runs.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">No sync has been recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {runs.map((run) => (
            <li key={run.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{run.label}</span>
                {syncResultBadge(run.result)}
                <span className="text-xs text-muted-foreground">
                  {formatWhen(run.startedAt)} · {TRIGGER[run.trigger] ?? run.trigger} · {formatDuration(run.durationMs)}
                  {run.countriesTotal ? ` · ${run.countriesRead ?? 0}/${run.countriesTotal} countries` : ""}
                  {run.offersSynced !== null ? ` · ${run.offersSynced} offers` : ""}
                </span>
              </div>
              {run.message ? <p className="mt-0.5 text-xs text-muted-foreground">{run.message}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
