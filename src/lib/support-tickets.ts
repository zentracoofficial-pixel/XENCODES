import { prisma } from "@/lib/prisma";

/**
 * Closing a support ticket (status RESOLVED, shown to everyone as "Closed").
 *
 * The conversation text stays as the record of what was asked and answered,
 * but every file sent in it is deleted: the bytes are removed from the
 * database (data becomes null, purgedAt is set) and only the file name is
 * kept, so the thread can still say "a file was sent here". A customer with
 * another problem opens a new ticket; they cannot reply on a closed one.
 */
export async function closeTicketAndPurgeFiles(ticketId: string): Promise<{ filesDeleted: number }> {
  const [, purged] = await prisma.$transaction([
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "RESOLVED" } }),
    prisma.supportAttachment.updateMany({
      where: { message: { ticketId }, data: { not: null } },
      data: { data: null, purgedAt: new Date() },
    }),
  ]);
  return { filesDeleted: purged.count };
}
