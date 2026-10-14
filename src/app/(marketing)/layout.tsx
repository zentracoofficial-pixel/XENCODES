import { auth } from "@/auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CurrencyProvider } from "@/components/currency/currency-provider";
import { getDisplayContext } from "@/lib/display-preference";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, currency] = await Promise.all([auth(), getDisplayContext()]);

  return (
    <CurrencyProvider context={currency}>
      <Header signedIn={Boolean(session?.user?.id)} />
      <main className="flex-1">{children}</main>
      <Footer />
    </CurrencyProvider>
  );
}
