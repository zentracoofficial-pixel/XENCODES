import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  cleanAttachmentName,
  readAttachmentFromForm,
  sniffAttachmentType,
} from "../src/lib/support-attachments";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.7\n...");

const form = (file?: File) => {
  const data = new FormData();
  data.set("body", "hello");
  if (file) data.set("attachment", file);
  return data;
};

test("the file type comes from its first bytes, not its name", () => {
  assert.equal(sniffAttachmentType(PNG), "image/png");
  assert.equal(sniffAttachmentType(JPEG), "image/jpeg");
  assert.equal(sniffAttachmentType(PDF), "application/pdf");
  assert.equal(sniffAttachmentType(new TextEncoder().encode("MZ\x90\x00 an exe")), null);
  assert.equal(sniffAttachmentType(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(sniffAttachmentType(new Uint8Array()), null);
});

test("names are cleaned and given the extension of their real type", () => {
  assert.equal(cleanAttachmentName("receipt.png", "image/png"), "receipt.png");
  assert.equal(cleanAttachmentName("../../etc/passwd", "application/pdf"), "passwd.pdf");
  assert.equal(cleanAttachmentName('C:\\Users\\me\\pay "slip".jpeg', "image/jpeg"), "pay slip.jpg");
  assert.equal(cleanAttachmentName("invoice.exe", "application/pdf"), "invoice.pdf");
  assert.equal(cleanAttachmentName("", "image/png"), "attachment.png");
  assert.ok(cleanAttachmentName("a".repeat(500) + ".png", "image/png").length <= 104);
});

test("a form without a file is fine; a real PNG, JPEG or PDF is accepted", async () => {
  assert.deepEqual(await readAttachmentFromForm(form()), { ok: true, attachment: null });
  // An untouched file input sends an empty file.
  assert.deepEqual(await readAttachmentFromForm(form(new File([], ""))), { ok: true, attachment: null });
  for (const [bytes, name, type] of [[PNG, "a.png", "image/png"], [JPEG, "b.jpg", "image/jpeg"], [PDF, "c.pdf", "application/pdf"]] as const) {
    const parsed = await readAttachmentFromForm(form(new File([bytes], name, { type: "application/octet-stream" })));
    assert.ok(parsed.ok && parsed.attachment, name);
    if (parsed.ok && parsed.attachment) {
      assert.equal(parsed.attachment.mimeType, type);
      assert.equal(parsed.attachment.sizeBytes, bytes.byteLength);
      assert.equal(parsed.attachment.fileName, name);
    }
  }
});

test("other files and files over 4 MB are refused", async () => {
  const fake = await readAttachmentFromForm(form(new File([new TextEncoder().encode("not an image")], "photo.png", { type: "image/png" })));
  assert.deepEqual(fake, { ok: false, error: "Only PNG, JPEG or PDF files can be sent." });
  const big = new Uint8Array(SUPPORT_ATTACHMENT_MAX_BYTES + 1);
  big.set(PNG);
  const tooBig = await readAttachmentFromForm(form(new File([big], "big.png")));
  assert.deepEqual(tooBig, { ok: false, error: "That file is too large. Send a file up to 4 MB." });
});
