import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

/**
 * The public pages built for search engines: services, countries, the
 * service-in-country pages and the guides. Unlike the marketing layout this
 * reads nothing about the visitor (no session, no currency cookie), so every
 * one of these pages can be built once and served from the cache, which is
 * what keeps thousands of them fast. The header finds out after load whether
 * the visitor is signed in.
 */
export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header showCurrency={false} detectSession />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
