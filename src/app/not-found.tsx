import type { Metadata } from "next";
import { Search } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Next.js already answers a request that hits this page with a real HTTP
// 404, not a 200 dressed up to look like an error; this is just belt and
// suspenders so nothing here is ever a candidate for the index either way.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <Card className="max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-mint-soft text-forest">
          <Search className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Page not found</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          That page does not exist, or has moved. Here is where you probably
          meant to go.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2.5 text-left sm:grid-cols-2">
          <Button variant="outline" href="/services" className="justify-center">
            Services
          </Button>
          <Button variant="outline" href="/pricing" className="justify-center">
            Pricing
          </Button>
          <Button variant="outline" href="/faq" className="justify-center">
            FAQ
          </Button>
          <Button href="/buy" className="justify-center">
            Get a Number
          </Button>
        </div>
        <Button variant="ghost" href="/" className="mt-3 w-full justify-center">
          Back to home
        </Button>
      </Card>
    </Container>
  );
}
