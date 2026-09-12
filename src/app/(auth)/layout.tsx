import Link from "next/link";
import { Smartphone } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-secondary/30 px-6 py-16">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold tracking-tight">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Smartphone className="h-4 w-4" />
        </span>
        Xencodes
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
