import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { closeTicketAndPurgeFiles } from "../src/lib/support-tickets";

const ids: string[] = [];
after(async () => {
  await prisma.supportTicket.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: "close-test@test.invalid" } });
  await prisma.$disconnect();
});

test("closing a ticket marks it resolved and deletes its files' bytes, keeping names and text", async () => {
  const user = await prisma.user.create({ data: { email: "close-test@test.invalid", passwordHash: "x", currency: "NGN" } });
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      subject: "close me",
      messages: {
        create: [
          { author: "USER", body: "see attached", attachments: { create: { fileName: "a.png", mimeType: "image/png", sizeBytes: 3, data: new Uint8Array([1, 2, 3]) } } },
          { author: "ADMIN", body: "got it", attachments: { create: { fileName: "b.pdf", mimeType: "application/pdf", sizeBytes: 2, data: new Uint8Array([4, 5]) } } },
        ],
      },
    },
  });
  ids.push(ticket.id);
  const other = await prisma.supportTicket.create({
    data: { userId: user.id, subject: "keep me", messages: { create: { author: "USER", body: "x", attachments: { create: { fileName: "keep.png", mimeType: "image/png", sizeBytes: 1, data: new Uint8Array([9]) } } } } },
  });
  ids.push(other.id);

  const result = await closeTicketAndPurgeFiles(ticket.id);
  assert.equal(result.filesDeleted, 2);

  const after = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: { messages: { include: { attachments: true } } } });
  assert.equal(after.status, "RESOLVED");
  assert.deepEqual(after.messages.map((m) => m.body).sort(), ["got it", "see attached"]);
  for (const attachment of after.messages.flatMap((m) => m.attachments)) {
    assert.equal(attachment.data, null);
    assert.ok(attachment.purgedAt);
  }
  assert.deepEqual(after.messages.flatMap((m) => m.attachments).map((a) => a.fileName).sort(), ["a.png", "b.pdf"]);

  // Another ticket's files are untouched, and closing again is harmless.
  const kept = await prisma.supportAttachment.findFirstOrThrow({ where: { fileName: "keep.png", message: { ticketId: other.id } } });
  assert.ok(kept.data && kept.purgedAt === null);
  assert.equal((await closeTicketAndPurgeFiles(ticket.id)).filesDeleted, 0);
});
