import { auth } from "@/auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <>
      <Header signedIn={Boolean(session?.user?.id)} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
