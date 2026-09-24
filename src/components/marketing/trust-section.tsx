import { KeyRound, Eye, Activity, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { testimonials } from "@/data/testimonials";

/**
 * Claims about the actual, current implementation only. Each one maps to a
 * real mechanism elsewhere in the codebase:
 * - two-factor auth: User.twoFactorEnabled, the /two-factor sign-in step.
 * - wallet funding: completeTopUp() in lib/funding.ts only ever credits a
 *   balance after KoraPay's own API confirms the payment server-side.
 * - live pricing: the buy flow's quote is fetched fresh at purchase time,
 *   never read off a cached list (see lib/inventory.ts's quotePair()).
 * - order status: the dashboard reads an activation's real status on every
 *   load, not a cached snapshot.
 * No certifications or third-party badges are listed here because Xencodes
 * does not hold any.
 */
const TRUST_SIGNALS = [
  {
    icon: KeyRound,
    title: "Two-factor authentication",
    body: "Available on every account, on top of your password.",
  },
  {
    icon: ShieldCheck,
    title: "Payments verified before funding",
    body: "Your wallet is credited only after KoraPay confirms a real payment.",
  },
  {
    icon: Eye,
    title: "Transparent live pricing",
    body: "See the exact price for a number before you buy it, every time.",
  },
  {
    icon: Activity,
    title: "Real-time order status",
    body: "Track an activation from your dashboard as it actually happens.",
  },
] as const;

/** A tinted initials tile, the same visual language ServiceLogo's fallback
 *  uses for a service with no icon: a wash of the brand colour rather than
 *  a photo, so a page of these reads as a deliberate style. */
function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint-soft text-sm font-semibold text-forest"
    >
      {initials}
    </span>
  );
}

export function TrustSection() {
  return (
    <Section className="py-12 sm:py-14">
      <Container>
        <SectionHeading
          title="Trusted for fast, reliable verification"
          description="Built around reliable number activation, transparent pricing, and a secure account and wallet, so getting a code back is never a guessing game."
        />

        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {testimonials.map((item) => (
            <li
              key={item.name}
              className="rounded-xl border border-border bg-surface px-5 py-5"
            >
              <div className="flex items-center gap-3">
                <InitialsAvatar name={item.name} />
                <p className="text-sm font-medium">{item.name}</p>
              </div>
              <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground text-pretty">
                &ldquo;{item.quote}&rdquo;
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-xl border border-border bg-surface px-5 py-5 sm:px-6">
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {TRUST_SIGNALS.map((signal) => (
              <div key={signal.title} className="flex gap-3">
                <signal.icon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                <div>
                  <dt className="text-sm font-medium">{signal.title}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {signal.body}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </Section>
  );
}
