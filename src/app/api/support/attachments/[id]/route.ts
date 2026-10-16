import { getActiveUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Serves one support attachment, only to the customer whose ticket it is on
 * or to an admin. Anyone else gets the same 404 as a missing file, so ids
 * cannot be probed. Images open in the browser; a PDF downloads, and both
 * are sent sandboxed with no content sniffing, so a file can never run as
 * part of the site.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getActiveUser();
  if (!user) return new Response("Not found.", { status: 404 });

  const { id } = await params;
  const attachment = await prisma.supportAttachment.findUnique({
    where: { id },
    include: { message: { select: { ticket: { select: { userId: true } } } } },
  });
  if (!attachment || (user.role !== "ADMIN" && attachment.message.ticket.userId !== user.id)) {
    return new Response("Not found.", { status: 404 });
  }

  // Deleted when the ticket was closed: only the name is left.
  if (!attachment.data) return new Response("This file was deleted when the ticket was closed.", { status: 410 });

  const inline = attachment.mimeType === "image/png" || attachment.mimeType === "image/jpeg";
  const name = attachment.fileName.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
