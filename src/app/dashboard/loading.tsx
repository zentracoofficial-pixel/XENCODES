/**
 * Shown while a dashboard page's own data is loading (the shell around it,
 * from dashboard/layout.tsx, is already on screen by the time this
 * appears). Plain pulsing blocks, not fabricated numbers or rows.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-surface" />
        <div className="h-4 w-64 animate-pulse rounded-lg bg-surface" />
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-surface" />
      <div className="h-48 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}
