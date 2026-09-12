import { cn } from "@/lib/utils";

/**
 * Shared input styling. Forms are a big part of this product, so the field
 * treatment lives in one place: quiet border at rest, mint ring on focus.
 */
export const fieldClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground " +
  "placeholder:text-muted-foreground/70 transition-colors " +
  "focus:border-mint focus:outline-none focus:ring-2 focus:ring-mint/25 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-danger">{children}</p>;
}
