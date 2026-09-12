import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  language = "bash",
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-[#0b0d12] text-[#e4e6f0]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <span className="text-xs text-white/40 font-mono">{language}</span>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
