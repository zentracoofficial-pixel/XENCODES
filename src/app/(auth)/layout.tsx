import Link from "next/link";
import { Wordmark } from "@/components/layout/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-5 py-16">
      <Link href="/" aria-label="Xencodes home" className="mb-7">
        <Wordmark className="text-lg" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
