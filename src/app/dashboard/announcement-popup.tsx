"use client";

import { useState, useSyncExternalStore } from "react";
import { AnnouncementModal } from "@/components/announcement-modal";

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
 * Shows the announcement popup once per wording, the first time a signed-in
 * customer lands on the dashboard. Closing it records that in this browser
 * (the version is part of the storage key), so it does not come back until an
 * admin changes the wording, which is what makes it usable for a price notice.
 *
 * Hidden on the server and decided in the browser: the server cannot read
 * browser storage. Storage can be unavailable (private windows, blocked site
 * data), in which case the popup shows once per page load rather than failing.
 */
export function AnnouncementPopup({
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

  return <AnnouncementModal title={title} message={message} onClose={dismiss} />;
}
