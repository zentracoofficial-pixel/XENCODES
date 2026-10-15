/**
 * Shown while an admin page's own data is loading (the shell around it,
 * from admin/layout.tsx, is already on screen by the time this appears).
 * Plain pulsing blocks, not fabricated numbers or rows: a skeleton should
 * never look like data that then turns out to be wrong.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-border/60" />
        <div className="h-8 w-48 animate-pulse rounded-lg bg-border/60" />
        <div className="h-4 w-72 animate-pulse rounded-lg bg-border/40" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />
    </div>
  );
}
