/**
 * Shown while an admin page's own data is loading (the shell around it,
 * from admin/layout.tsx, is already on screen by the time this appears).
 * Plain pulsing blocks, not fabricated numbers or rows: a skeleton should
 * never look like data that then turns out to be wrong.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-surface" />
        <div className="h-4 w-72 animate-pulse rounded-lg bg-surface" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}
