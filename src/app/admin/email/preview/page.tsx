import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { renderEmailHtml, renderEmailText } from "@/lib/email-template";
import { emailSamples } from "./samples";
import { EmailPreviewer } from "./previewer";

export const metadata: Metadata = { title: "Admin: Email templates" };

export const dynamic = "force-dynamic";

/** Admin-only (requireAdmin), so it is safe in production: sample data
 *  only, rendered through exactly the code that sends real email. */
export default async function AdminEmailPreviewPage() {
  await requireAdmin();

  const templates = emailSamples().map(({ id, label, message }) => ({
    id,
    label,
    subject: message.subject,
    light: renderEmailHtml(message, { colorScheme: "light" }),
    dark: renderEmailHtml(message, { colorScheme: "dark" }),
    text: renderEmailText(message),
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/email"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Email
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Email templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every email Xencodes sends, with sample data, in light and dark mode at phone and
          desktop widths. Sent emails follow the reader&apos;s own light/dark setting.
        </p>
      </div>
      <EmailPreviewer templates={templates} />
    </div>
  );
}
