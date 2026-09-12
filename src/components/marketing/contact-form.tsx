"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="text-lg font-semibold">Message sent</p>
        <p className="text-sm text-muted-foreground">
          Thanks for reaching out — our team typically responds within one
          business day.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              type="text"
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              required
              type="email"
              className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
              placeholder="jane@company.com"
            />
          </div>
        </div>
        <div>
          <label htmlFor="subject" className="text-sm font-medium">
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            required
            type="text"
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
            placeholder="How can we help?"
          />
        </div>
        <div>
          <label htmlFor="message" className="text-sm font-medium">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2"
            placeholder="Tell us what's going on..."
          />
        </div>
        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Send message
        </Button>
      </form>
    </Card>
  );
}
