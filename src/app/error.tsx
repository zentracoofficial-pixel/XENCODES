"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Catches anything uncaught in any page or layout below the root. Without
 * this, a single provider hiccup or unexpected exception would show Next's
 * default blank error screen instead of something on-brand with a way back.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <Card className="max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Nothing was charged. Try again, and if this keeps happening, reach out
          to support.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" href="/">
            Back to home
          </Button>
        </div>
      </Card>
    </Container>
  );
}
