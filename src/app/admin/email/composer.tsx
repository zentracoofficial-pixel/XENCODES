"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Monitor, Smartphone, Send, Loader2, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { renderEmailHtml } from "@/lib/email-template";
import { campaignEmail, verificationEmail } from "@/lib/email-messages";
import {
  getRecipientCountAction,
  searchUsersAction,
  sendTestEmailAction,
  sendCampaignAction,
  sendVerificationRemindersAction,
  type SendTestState,
  type SendCampaignState,
  type SendVerificationRemindersState,
} from "./actions";

const SEGMENTS = [
  { value: "all", label: "All users" },
  { value: "never_purchased", label: "Never purchased" },
  { value: "funded_never_purchased", label: "Funded, never purchased" },
  { value: "purchased_recently", label: "Purchased recently" },
  { value: "not_purchased_recently", label: "Purchased before, not recently" },
  { value: "low_balance", label: "Low wallet balance" },
  { value: "inactive_login", label: "Haven't logged in recently" },
  { value: "selected", label: "Selected users" },
  { value: "specific_user", label: "One specific user" },
  { value: "unverified", label: "Unverified users" },
] as const;

/** Only for the live preview pane: a real verification URL always carries a
 *  real, single-use token for one specific account (see
 *  sendVerificationRemindersAction in ./actions), never typed or chosen by
 *  the admin. This placeholder never leaves the browser and is never sent
 *  anywhere. */
const PREVIEW_VERIFY_URL = "https://www.xencodes.com/verify-email?token=preview-only";

type SegmentKind = (typeof SEGMENTS)[number]["value"];

// Shown in the preview only while the composer is empty, so the preview
// demonstrates the real design instead of placeholder words.
const EXAMPLE = {
  subject: "Your Xencodes account is ready",
  title: "Your Xencodes account is ready",
  body: "Welcome to Xencodes. Your account has been created successfully.\n\nYou can now:\n- Fund your wallet\n- Buy a virtual number for **SMS verification**\n- Receive your code in seconds",
  ctaText: "Open Xencodes",
  ctaUrl: "https://www.xencodes.com/dashboard",
};

const testInitial: SendTestState = {};
const sendInitial: SendCampaignState = {};
const verifySendInitial: SendVerificationRemindersState = {};

export function EmailComposer() {
  const [segmentKind, setSegmentKind] = useState<SegmentKind>("all");
  const [days, setDays] = useState("30");
  const [thresholdNaira, setThresholdNaira] = useState("500");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; email: string }[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<{ id: string; email: string }[]>([]);

  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const [reviewing, setReviewing] = useState(false);

  const [count, setCount] = useState<{ count: number; label: string } | null>(null);
  const [countPending, startCountTransition] = useTransition();
  const [testSending, startTestTransition] = useTransition();

  const [testState, testAction, testPending] = useActionState(sendTestEmailAction, testInitial);
  const [sendState, sendAction, sendPending] = useActionState(sendCampaignAction, sendInitial);
  const [verifySendState, verifySendAction, verifySendPending] = useActionState(
    sendVerificationRemindersAction,
    verifySendInitial,
  );

  const isUnverifiedSegment = segmentKind === "unverified";

  const formRef = useRef<HTMLFormElement>(null);

  function buildFormData(): FormData {
    const data = new FormData(formRef.current ?? undefined);
    data.set("segmentKind", segmentKind);
    data.set("days", days);
    data.set("thresholdNaira", thresholdNaira);
    data.set("userIds", selectedUsers.map((u) => u.id).join(","));
    return data;
  }

  // Recompute the recipient count whenever targeting changes. Debounced by
  // riding React's own transition batching rather than a manual timer.
  // Responses can arrive out of order (picking a user fires a second count
  // while the first is still in flight); only the latest request may set
  // the count, or a slow stale answer of "0" can land last and lock the
  // Review button for an audience that actually has someone in it.
  const countRequestRef = useRef(0);
  useEffect(() => {
    const requestId = ++countRequestRef.current;
    startCountTransition(async () => {
      const result = await getRecipientCountAction(buildFormData());
      if (requestId === countRequestRef.current) setCount(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentKind, days, thresholdNaira, selectedUsers]);

  useEffect(() => {
    let stale = false;
    const timer = setTimeout(async () => {
      if (!userQuery.trim()) {
        setUserResults([]);
        return;
      }
      const results = await searchUsersAction(userQuery);
      // A slower earlier search must not overwrite the newer one's results.
      if (!stale) setUserResults(results);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [userQuery]);

  const isEmpty = !title && !body && !ctaText && !ctaUrl;
  // Unverified users always get the real, existing verification email, not
  // whatever is typed in the composer below (which is hidden for this
  // segment anyway) — see sendVerificationRemindersAction in ./actions.
  // PREVIEW_VERIFY_URL is a placeholder only; the real send mints one real
  // token and URL per recipient.
  const html = isUnverifiedSegment
    ? renderEmailHtml(verificationEmail(PREVIEW_VERIFY_URL), { colorScheme: scheme })
    : renderEmailHtml(
        campaignEmail(
          isEmpty
            ? EXAMPLE
            : {
                subject,
                title: title || "Email title",
                body,
                ctaText: ctaText || undefined,
                ctaUrl: ctaUrl || undefined,
                previewText: previewText || undefined,
              },
        ),
        { colorScheme: scheme },
      );

  const readyToReview = isUnverifiedSegment
    ? (count?.count ?? 0) > 0
    : Boolean(subject && title && body) && (count?.count ?? 0) > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <form
        ref={formRef}
        action={isUnverifiedSegment ? verifySendAction : sendAction}
        className="space-y-5"
      >
        {/* Hidden fields keep the composed content on the actual send action,
            since React state alone would not be picked up by a form action.
            Unused by sendVerificationRemindersAction (the audience is fixed),
            but harmless to still send. */}
        <input type="hidden" name="segmentKind" value={segmentKind} />
        <input type="hidden" name="days" value={days} />
        <input type="hidden" name="thresholdNaira" value={thresholdNaira} />
        <input type="hidden" name="userIds" value={selectedUsers.map((u) => u.id).join(",")} />

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">Audience</h2>
          <select
            value={segmentKind}
            onChange={(e) => {
              setSegmentKind(e.target.value as SegmentKind);
              // A confirm screen for the previous audience's send action
              // must not carry over to a different one, and neither should
              // a pick: people chosen for "Selected users" are not who
              // "One specific user" should be sending to.
              setReviewing(false);
              setSelectedUsers([]);
              setUserQuery("");
              setUserResults([]);
            }}
            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
          >
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {(segmentKind === "purchased_recently" ||
            segmentKind === "not_purchased_recently" ||
            segmentKind === "inactive_login") && (
            <label className="flex items-center gap-2 text-sm">
              Within
              <input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
              />
              days
            </label>
          )}

          {segmentKind === "low_balance" && (
            <label className="flex items-center gap-2 text-sm">
              Below ₦
              <input
                type="number"
                min={0}
                value={thresholdNaira}
                onChange={(e) => setThresholdNaira(e.target.value)}
                className="h-9 w-28 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
              />
            </label>
          )}

          {(segmentKind === "selected" || segmentKind === "specific_user") && (
            <div className="space-y-2">
              <input
                type="search"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search by email"
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
              />
              {userResults.length > 0 && (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {userResults.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUsers(
                            segmentKind === "specific_user"
                              ? [u]
                              : selectedUsers.some((x) => x.id === u.id)
                                ? selectedUsers
                                : [...selectedUsers, u],
                          );
                          // Any pick changes who would receive this.
                          setReviewing(false);
                          setUserQuery("");
                          setUserResults([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-background"
                      >
                        {u.email}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedUsers.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                    >
                      {u.email}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedUsers(selectedUsers.filter((x) => x.id !== u.id))
                        }
                        className="text-muted-foreground hover:text-danger"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {countPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="font-semibold text-foreground">{count?.count ?? 0}</span>
            )}
            recipient{count?.count === 1 ? "" : "s"} · {count?.label}
          </p>
        </Card>

        {isUnverifiedSegment ? (
          <Card className="space-y-2 p-5">
            <h2 className="text-sm font-semibold">Email</h2>
            <p className="text-sm text-foreground">Verify your Xencodes email address</p>
            <p className="text-sm text-muted-foreground">
              This is the same verification email sent automatically at signup and from a
              customer&apos;s own &ldquo;resend&rdquo; button — not a custom message. Each recipient
              gets their own verification link for their own account; nothing here can be edited.
              An account that becomes verified, is still inside its resend cooldown, or has already
              hit its hourly resend limit is skipped rather than emailed again.
            </p>
          </Card>
        ) : (
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">Compose</h2>
          <Field label="Subject line" name="subject" value={subject} onChange={setSubject} />
          <Field
            label="Preview text (shown next to the subject in most inboxes)"
            name="previewText"
            value={previewText}
            onChange={setPreviewText}
          />
          <Field label="Email title" name="title" value={title} onChange={setTitle} />
          <div>
            <label htmlFor="body" className="text-xs font-medium text-muted-foreground">
              Body
            </label>
            <textarea
              id="body"
              name="body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write in plain paragraphs. Leave a blank line between paragraphs."
              className="mt-1 h-auto w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              No HTML needed. Blank line = new paragraph. Also supported:{" "}
              <code>**bold**</code>, <code>[link text](https://…)</code>, lines starting with{" "}
              <code>-</code> for bullets or <code>1.</code> for numbered lists, and{" "}
              <code># Heading</code>. Anything else is sent exactly as typed.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button text (optional)" name="ctaText" value={ctaText} onChange={setCtaText} />
            <Field
              label="Button URL (optional, https://…)"
              name="ctaUrl"
              value={ctaUrl}
              onChange={setCtaUrl}
            />
          </div>
        </Card>
        )}

        {!isUnverifiedSegment && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={testPending || testSending || !subject || !title || !body}
            onClick={() => {
              const data = buildFormData();
              startTestTransition(() => testAction(data));
            }}
          >
            {testPending || testSending ? "Sending test…" : "Send test email to myself"}
          </Button>
          {testState.success ? (
            <span className="text-sm text-success">Test sent.</span>
          ) : null}
          {testState.error ? <span className="text-sm text-danger">{testState.error}</span> : null}
        </div>
        )}

        {!reviewing ? (
          <Button type="button" disabled={!readyToReview} onClick={() => setReviewing(true)}>
            Review and send
          </Button>
        ) : isUnverifiedSegment ? (
          <Card className="space-y-3 border-danger/30 p-5">
            <h2 className="text-sm font-semibold">Confirm send</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Audience</dt>
              <dd className="font-medium text-foreground">Unverified users</dd>
              <dt className="text-muted-foreground">Recipients</dt>
              <dd className="font-medium text-foreground">{count?.count ?? 0} users</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium text-foreground">Verify your Xencodes email address</dd>
            </dl>
            <p className="text-sm text-muted-foreground">
              Each recipient gets their own unique, single-use verification link. This cannot be
              undone.
            </p>
            {verifySendState.error ? (
              <p className="text-sm text-danger">{verifySendState.error}</p>
            ) : null}
            {verifySendState.success ? (
              <div className="text-sm">
                <p className="text-success">Verification emails sent: {verifySendState.sentCount}</p>
                <p className="text-muted-foreground">
                  Failed: {verifySendState.failedCount ?? 0} · Skipped:{" "}
                  {verifySendState.skippedCount ?? 0}
                </p>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={verifySendPending}
                onClick={() => setReviewing(false)}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={verifySendPending}
                className="gap-1.5"
              >
                {verifySendPending ? (
                  "Sending…"
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send now
                  </>
                )}
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="space-y-3 border-danger/30 p-5">
            <h2 className="text-sm font-semibold">Confirm send</h2>
            <p className="text-sm text-muted-foreground">
              This sends <span className="font-semibold text-foreground">{subject}</span> to{" "}
              <span className="font-semibold text-foreground">{count?.count ?? 0}</span>{" "}
              {count?.count === 1 ? "person" : "people"} ({count?.label}
              {segmentKind === "specific_user" && selectedUsers[0]
                ? `: ${selectedUsers[0].email}`
                : ""}
              ). This cannot be undone.
            </p>
            {sendState.error ? <p className="text-sm text-danger">{sendState.error}</p> : null}
            {sendState.success ? (
              <div className="text-sm">
                <p className="text-success">
                  Sent to {sendState.sentCount} people
                  {sendState.failedCount ? `, ${sendState.failedCount} failed` : ""}.
                </p>
                {sendState.skippedCount ? (
                  <p className="mt-1 text-warning">
                    {sendState.skippedCount} were not sent: the send ran out of time before
                    reaching them. See the History tab, and send to a narrower audience to reach
                    the rest.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sendPending}
                onClick={() => setReviewing(false)}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={sendPending}
                className="gap-1.5"
              >
                {sendPending ? (
                  "Sending…"
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send now
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}
      </form>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleButton active={preview === "desktop"} onClick={() => setPreview("desktop")}>
            <Monitor className="h-3.5 w-3.5" />
            Desktop
          </ToggleButton>
          <ToggleButton active={preview === "mobile"} onClick={() => setPreview("mobile")}>
            <Smartphone className="h-3.5 w-3.5" />
            Mobile
          </ToggleButton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <ToggleButton active={scheme === "light"} onClick={() => setScheme("light")}>
            <Sun className="h-3.5 w-3.5" />
            Light
          </ToggleButton>
          <ToggleButton active={scheme === "dark"} onClick={() => setScheme("dark")}>
            <Moon className="h-3.5 w-3.5" />
            Dark
          </ToggleButton>
        </div>
        {isEmpty ? (
          <p className="text-xs text-muted-foreground">
            Showing example content until you start writing.
          </p>
        ) : null}
        <div className="rounded-xl border border-border bg-background p-3">
          <iframe
            title="Email preview"
            srcDoc={html}
            className="mx-auto block rounded-lg border border-border"
            style={{
              width: preview === "desktop" ? "100%" : "375px",
              maxWidth: "100%",
              height: "640px",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
        active ? "border-forest bg-mint-soft text-forest" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
      />
    </div>
  );
}
