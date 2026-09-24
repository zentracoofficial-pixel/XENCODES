import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/layout/wordmark";

// Login, register, and every password/verification utility page: none of
// these are search landing pages, and a verification or reset link with a
// one-time token in its query string is exactly the kind of URL that must
// never be indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
