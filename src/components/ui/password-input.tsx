"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide toggle.
 *
 * Purely a display affordance: the value the browser submits is exactly
 * what a plain `<input type="password">` would submit, since toggling only
 * ever flips the native `type` attribute between "password" and "text".
 * Nothing here reads, stores, copies or logs the value anywhere — no state
 * in this component ever holds the password itself, only the boolean of
 * whether it is currently shown.
 */
export function PasswordInput({
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        id={inputId}
        type={visible ? "text" : "password"}
        // Password managers and browser autofill key off this rather than
        // the visible type attribute, so toggling visibility never disables
        // autofill or makes a manager treat this as a different field.
        autoComplete={props.autoComplete}
        className={cn(
          "h-11 w-full rounded-lg border border-border bg-surface px-3.5 pr-11 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        // A large enough hit target for a thumb, not just a mouse pointer,
        // and tabIndex left at its default so it sits in the natural tab
        // order right after the field it controls.
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
