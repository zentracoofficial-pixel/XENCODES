import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Create account",
};

export default function RegisterPage() {
  return (
    <Card className="p-7 sm:p-8">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Get started with Xencodes in under a minute.
      </p>

      <form className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
            placeholder="••••••••"
          />
        </div>
        <Button type="submit" className="w-full">
          Create account
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        By creating an account you agree to use Xencodes for legitimate
        verification and testing only.
      </p>
    </Card>
  );
}
