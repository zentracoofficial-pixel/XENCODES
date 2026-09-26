import type { EmailMessage } from "@/lib/email-template";
import {
  activationIssueEmail,
  campaignEmail,
  emailSettingsTestEmail,
  passwordResetEmail,
  providerLowBalanceEmail,
  supportReplyEmail,
  supportRequestEmail,
  verificationEmail,
} from "@/lib/email-messages";
import { SITE_URL } from "@/lib/site";

/** Every email Xencodes sends, filled with representative sample data —
 *  never real customer data — for the admin template preview. */
export function emailSamples(): { id: string; label: string; message: EmailMessage }[] {
  const token = "3f9c2a7be41d8c05a96e1f2b7d4c8a0e5b1f6d2c9a8e7b4f3c2d1e0a9b8c7d6e";
  return [
    { id: "verification", label: "Email verification", message: verificationEmail(`${SITE_URL}/verify-email?token=${token}`) },
    { id: "password-reset", label: "Password reset", message: passwordResetEmail(`${SITE_URL}/reset-password?token=${token}`) },
    {
      id: "campaign-welcome",
      label: "Admin email: welcome",
      message: campaignEmail({
        subject: "Your Xencodes account is ready",
        title: "Your Xencodes account is ready",
        body: "Welcome to Xencodes. Your account has been created successfully.\n\nYou can now:\n- Fund your wallet\n- Buy a virtual number for **SMS verification**\n- Receive your code in seconds",
        ctaText: "Open Xencodes",
        ctaUrl: `${SITE_URL}/dashboard`,
        previewText: "Welcome to Xencodes. Your account is ready to use.",
      }),
    },
    {
      id: "campaign-long",
      label: "Admin email: long, formatted",
      message: campaignEmail({
        subject: "Service update: faster WhatsApp & Telegram numbers",
        title:
          "We've upgraded number availability for WhatsApp, Telegram and 40+ other services across 25 countries",
        body: [
          "Hi there,",
          "Over the past few weeks we've been working on something you asked for: **more reliable numbers** for the services you use most. Here's what changed & why it matters <for you>.",
          "# What's new",
          "1. Faster delivery for WhatsApp and Telegram codes\n2. More countries in stock at any time\n3. Automatic refunds when a code doesn't arrive",
          "# Good to know",
          "- Prices are shown before you buy, in your wallet currency\n- Unused numbers are refunded automatically\n- Our [pricing page](https://www.xencodes.com/pricing) lists every service",
          "Questions? Reply through the support page at https://www.xencodes.com/support, or read the FAQ.",
          "A literal *single asterisk*, a stray [bracket], quotes \"like this\" and 'this', an ampersand (R&D), and an unsafe link [click me](javascript:alert(1)) all stay as plain text.",
          "Averyveryverylongunbrokenwordthatwouldotherwiseoverflowthecontaineronasmallphonescreenwithouthelp.",
          "Thanks,\nThe Xencodes team",
        ].join("\n\n"),
        ctaText: "See what's new",
        ctaUrl: `${SITE_URL}/services`,
      }),
    },
    {
      id: "campaign-short",
      label: "Admin email: short, no button",
      message: campaignEmail({ subject: "Quick note", title: "Scheduled maintenance tonight", body: "Xencodes will be briefly unavailable between 01:00 and 01:15 UTC." }),
    },
    {
      id: "activation-issue",
      label: "Support inbox: activation issue",
      message: activationIssueEmail({
        customerEmail: "customer@example.com",
        ticketId: "cmuhz9x2k0001",
        activationId: "cmuhz8w1j0000",
        serviceName: "WhatsApp",
        countryName: "United Kingdom",
        phoneNumber: "+44 7700 900123",
        status: "WAITING",
        price: "₦1,250.00",
        boughtAt: new Date("2026-09-26T08:30:00Z"),
        details: "I bought a number 10 minutes ago and no code has arrived yet.\nI tried requesting the code twice from WhatsApp.",
      }),
    },
    {
      id: "support-request",
      label: "Support inbox: new request",
      message: supportRequestEmail({
        customerEmail: "customer@example.com",
        ticketId: "cmuhz9x2k0002",
        subject: "Wallet top-up not showing",
        details: "I paid ₦5,000 through KoraPay about an hour ago but my wallet still shows ₦0.00.",
      }),
    },
    {
      id: "support-reply",
      label: "Support inbox: customer reply",
      message: supportReplyEmail({
        customerEmail: "customer@example.com",
        ticketId: "cmuhz9x2k0002",
        subject: "Wallet top-up not showing",
        body: "Thanks, it's showing now.",
      }),
    },
    {
      id: "provider-low",
      label: "Admin alert: provider balance low",
      message: providerLowBalanceEmail({ label: "GrizzlySMS", balance: "$1.84", threshold: "$2.00", detectedAt: new Date("2026-09-26T08:30:00Z"), isFirstAlert: true }),
    },
    {
      id: "provider-reminder",
      label: "Admin alert: provider balance reminder",
      message: providerLowBalanceEmail({ label: "GrizzlySMS", balance: "$1.84", threshold: "$2.00", detectedAt: new Date("2026-09-26T08:30:00Z"), isFirstAlert: false }),
    },
    {
      id: "settings-test",
      label: "Settings: test email",
      message: emailSettingsTestEmail({ fromAddress: "Xencodes <hello@xencodes.com>", sentAt: new Date("2026-09-26T08:30:00Z") }),
    },
  ];
}
