"use client";

import { useState, useSyncExternalStore } from "react";
import { Megaphone, X } from "lucide-react";

const STORAGE_PREFIX = "xencodes:announcement-dismissed:";
const DISMISS_EVENT = "xencodes:announcement-dismissed";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DISMISS_EVENT, onChange);
  };
}

/**
 * The notice at the top of the dashboard. Dismissing it hides it for this
 * browser until the wording changes (the version is part of the storage key),
 * so a new price notice always reaches people who closed the last one.
 *
 * Hidden on the server and decided in the browser: the server cannot read
 * browser storage. Storage can be unavailable (private windows, blocked site
 * data), in which case the bar simply shows on every visit rather than
 * failing.
 */
export function AnnouncementBar({
  title,
  message,
  version,
}: {
  title: string;
  message: string;
  version: string;
}) {
  const [closed, setClosed] = useState(false);
  const dismissedBefore = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(STORAGE_PREFIX + version) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );

  if (closed || dismissedBefore) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + version, "1");
      window.dispatchEvent(new Event(DISMISS_EVENT));
    } catch {
      // Nothing to persist to; it still closes for this visit.
    }
    setClosed(true);
  }

  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-3 rounded-xl border border-mint/40 bg-mint/10 px-4 py-3.5"
    >
      <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-mint/20 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
