"use client";

import { useEffect, useRef } from "react";
import { Megaphone, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The announcement itself, as a centred popup over the page.
 *
 * Built on the browser's own <dialog>: showModal() gives it a real backdrop,
 * traps keyboard focus inside while it is open, lets Escape close it, and
 * marks the rest of the page inert for assistive technology, all without
 * re-implementing any of that. Clicking the backdrop closes it too.
 *
 * Purely presentational. Whether to show it, and remembering that a customer
 * has dismissed it, belong to the caller (the dashboard shows it once per
 * wording; the admin preview shows it on demand). The message is plain text:
 * blank lines start a new paragraph, and React renders it as text, never as
 * markup.
 */
export function AnnouncementModal({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    // The page behind must not scroll while the popup is up.
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
      if (dialog.open) dialog.close();
    };
  }, []);

  const paragraphs = message
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // A click that lands on the dialog element itself (not on anything
      // inside it) is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-labelledby="announcement-title"
      className="animate-pop m-auto w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-[var(--shadow-panel)] backdrop:bg-forest-dark/60 backdrop:backdrop-blur-[3px]"
    >
      <div className="relative overflow-hidden bg-forest px-6 pb-6 pt-7 text-white">
        {/* Two soft washes of the brand mint, for depth without imagery. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-mint/25 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-mint/10 blur-2xl"
        />

        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close announcement"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-mint"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-forest-dark shadow-[0_8px_20px_-8px_rgba(11,217,154,0.7)]">
          <Megaphone className="h-6 w-6" aria-hidden />
        </div>
        <p className="relative mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-mint">
          From the Xencodes team
        </p>
        <h2 id="announcement-title" className="relative mt-1 text-xl font-semibold leading-snug tracking-tight">
          {title}
        </h2>
      </div>

      <div className="max-h-[50vh] space-y-3 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-muted-foreground">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      <div className="border-t border-border bg-mint-soft/40 px-6 py-4">
        <Button type="button" variant="accent" size="md" className="w-full" autoFocus onClick={() => ref.current?.close()}>
          Got it
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
          The price is always shown before you buy.
        </p>
      </div>
    </dialog>
  );
}
