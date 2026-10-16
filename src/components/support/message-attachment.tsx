import { FileText } from "lucide-react";
import { formatFileSize } from "@/lib/support-attachments";

export interface MessageAttachmentInfo {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** A file in a support message: a thumbnail for an image, a file chip for a PDF. */
export function MessageAttachment({ attachment }: { attachment: MessageAttachmentInfo }) {
  const href = `/api/support/attachments/${attachment.id}`;
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <a href={href} target="_blank" rel="noopener" className="mt-2 inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file, not an optimisable public image */}
        <img
          src={href}
          alt={attachment.fileName}
          loading="lazy"
          className="max-h-60 max-w-full rounded-lg border border-border object-contain"
        />
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {attachment.fileName} · {formatFileSize(attachment.sizeBytes)}
        </span>
      </a>
    );
  }
  return (
    <a
      href={href}
      className="mt-2 flex max-w-sm items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 transition-colors hover:border-mint"
    >
      <FileText aria-hidden className="h-5 w-5 shrink-0 text-forest" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{attachment.fileName}</span>
        <span className="block text-xs text-muted-foreground">PDF · {formatFileSize(attachment.sizeBytes)}</span>
      </span>
    </a>
  );
}
