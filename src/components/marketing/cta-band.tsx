import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The closing call to action shared by the public pages: the same brand-green
 * band the homepage ends on, so every page finishes on the one action that
 * matters. Defaults to "Get a number"; a page can name its own action.
 */
export function CtaBand({
  title,
  body,
  href = "/buy",
  label = "Get a number",
}: {
  title: string;
  body: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="relative isolate mt-12 overflow-hidden rounded-2xl bg-forest px-6 py-8 sm:px-10 sm:py-10">
      <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-96 rounded-full bg-mint/20 blur-[90px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="max-w-md">
          <p className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">{body}</p>
        </div>
        <Button href={href} variant="accent" size="lg">
          {label}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
