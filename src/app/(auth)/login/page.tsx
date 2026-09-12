import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <Card className="p-7 sm:p-8">
      <h1 className="text-xl font-semibold">Log in to Xencodes</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Welcome back. Enter your details to access your dashboard.
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
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
            placeholder="••••••••"
          />
        </div>
        <Button type="submit" className="w-full">
          Log in
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </Card>
  );
}
