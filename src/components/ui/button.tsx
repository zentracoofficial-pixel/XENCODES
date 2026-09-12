import Link from "next/link";
import { cn } from "@/lib/utils";

const variants = {
  /** Deep forest. The one action that matters on a given screen. */
  primary:
    "bg-forest text-white hover:bg-forest-dark active:bg-forest-dark shadow-[var(--shadow-subtle)]",
  /** Bright mint on forest text. Reserved for the buy action. */
  accent:
    "bg-mint text-forest-dark hover:brightness-[0.96] active:brightness-[0.93] font-semibold",
  outline:
    "border border-border bg-surface text-foreground hover:bg-mint-soft hover:border-mint/40",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-mint-soft",
  /** For use on a forest background. */
  onDark: "bg-white/10 text-white hover:bg-white/15 border border-white/15",
} as const;

const sizes = {
  sm: "h-10 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-6 text-base gap-2",
} as const;

type ButtonBaseProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  children: React.ReactNode;
};

type ButtonAsButton = ButtonBaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsLink = ButtonBaseProps &
  React.ComponentProps<typeof Link> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,filter,opacity] duration-150",
    "disabled:pointer-events-none disabled:opacity-45",
    variants[variant],
    sizes[size],
    className,
  );

  if ("href" in props && props.href) {
    const { href, ...rest } = props;
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(props as ButtonAsButton)}>
      {children}
    </button>
  );
}
