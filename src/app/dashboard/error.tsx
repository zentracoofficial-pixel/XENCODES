"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Scoped to the dashboard section: an error here shows inside
 * dashboard/layout.tsx, so the sidebar and nav stay visible and usable
 * instead of falling back to the site-wide error page.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error boundary]", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">Unable to load this page</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Nothing was charged. Please try again, and if this keeps happening,
        contact support.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" href="/dashboard">
          Back to dashboard
        </Button>
      </div>
    </Card>
  );
}
