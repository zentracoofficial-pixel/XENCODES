import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM ?? "Xencodes <onboarding@resend.dev>";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  if (!resend) {
    console.log(
      `\n--- Email (RESEND_API_KEY not set, logging instead) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---------------------------------------------------------\n`,
    );
    return;
  }

  await resend.emails.send({
    from: emailFrom,
    to,
    subject,
    html,
    text,
  });
}

export function verificationEmailContent(verifyUrl: string) {
  return {
    subject: "Verify your Xencodes email address",
    text: `Confirm your email address by visiting this link: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `<p>Confirm your email address to finish setting up your Xencodes account.</p><p><a href="${verifyUrl}">Verify email address</a></p><p>This link expires in 24 hours.</p>`,
  };
}

export function passwordResetEmailContent(resetUrl: string) {
  return {
    subject: "Reset your Xencodes password",
    text: `Reset your password by visiting this link: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    html: `<p>We received a request to reset your Xencodes password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  };
}
