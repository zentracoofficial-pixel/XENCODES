/** One figure in the dashboard's "Your activity" row — see
 *  src/app/dashboard/page.tsx for why these three replaced the wallet
 *  balance as the page's headline. */
export function DashboardStat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-xl border border-border bg-surface px-4 py-3.5 ${className ?? ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
