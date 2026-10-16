"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { SUPPORT_ATTACHMENT_ACCEPT, SUPPORT_ATTACHMENT_MAX_BYTES, formatFileSize } from "@/lib/support-attachments";

/**
 * The "Attach a file" control for a support reply: one PNG, JPEG or PDF up
 * to 4 MB. Checked here for a quick answer and again on the server, which is
 * the check that counts.
 */
export function AttachmentField({ onError }: { onError?: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);

  function clear() {
    if (input.current) input.current.value = "";
    setFile(null);
    onError?.(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        id="attachment"
        type="file"
        name="attachment"
        accept={SUPPORT_ATTACHMENT_ACCEPT}
        className="peer sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (!chosen) return clear();
          if (chosen.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
            clear();
            onError?.("That file is too large. Send a file up to 4 MB.");
            return;
          }
          if (!/\.(png|jpe?g|pdf)$/i.test(chosen.name)) {
            clear();
            onError?.("Only PNG, JPEG or PDF files can be sent.");
            return;
          }
          onError?.(null);
          setFile({ name: chosen.name, size: chosen.size });
        }}
      />
      {file ? (
        <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-mint/40 bg-mint-soft px-2.5 py-1.5 text-xs text-forest">
          <Paperclip aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{file.name}</span>
          <span className="shrink-0 text-forest/70">{formatFileSize(file.size)}</span>
          <button type="button" onClick={clear} aria-label="Remove file" className="shrink-0 rounded p-0.5 hover:bg-white/60">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <label
          htmlFor="attachment"
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium transition-colors hover:border-mint peer-focus-visible:ring-2 peer-focus-visible:ring-mint/40"
        >
          <Paperclip aria-hidden className="h-3.5 w-3.5" />
          Attach a file
        </label>
      )}
      <span className="text-[11px] text-muted-foreground">PNG, JPEG or PDF, up to 4 MB</span>
    </div>
  );
}
