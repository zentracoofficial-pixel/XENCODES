import { KeyRound, Eye, Activity, ShieldCheck, RotateCcw, Route, BarChart3 } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";

/**
 * Why a visitor can trust Xencodes, stated only as things the product
 * actually does. Each line maps to a real mechanism in the codebase:
 *
 * - No code, no charge: reconcileActivation() refunds an activation that
 *   settles without a code (src/lib/activation-lifecycle.ts), and a cron
 *   sweep settles abandoned ones.
 * - Sellers chosen by delivery: every Activation records the GrizzlySMS
 *   seller that served it (providerOfferId), and rankPools() in
 *   src/lib/pool-ladder.ts moves sellers with a poor record to the back.
 * - Delivery history: src/lib/deliverability.ts measures each service and
 *   country from Xencodes' own settled orders, and the buy page shows it only
 *   once there are enough orders to mean something.
 * - Live price: quotePair() prices every purchase fresh, and the buy page
 *   shows that price before anything is charged.
 *
 * There are deliberately no customer reviews here. The ones that used to be
 * were placeholder copy, not real customers, and a review section returns
 * only when it can be filled with real ones.
 */
const PROMISES = [
  {
    icon: RotateCcw,
    title: "No code, no charge",
    body: "If no code arrives before the session ends, the full price goes back to your wallet automatically. No ticket to file.",
  },
  {
    icon: Route,
    title: "Sellers chosen for delivery, not price",
    body: "Each number comes from a specific supplier seller. Xencodes records whether every order received its code and moves sellers that keep failing to the back.",
  },
  {
    icon: BarChart3,
    title: "Delivery history you can see",
    body: "Once a service and country have enough completed orders, the buy page shows how many received a code. Measured from Xencodes orders, never estimated.",
  },
  {
    icon: Eye,
    title: "The exact price before you pay",
    body: "Prices follow live supplier availability. You always see the current price for your service and country before you buy.",
  },
] as const;

const SECURITY = [
  { icon: KeyRound, title: "Two-factor authentication", body: "Available on every account." },
  { icon: ShieldCheck, title: "Verified payments", body: "Your wallet is credited only after KoraPay confirms the payment." },
  { icon: Activity, title: "Real-time order status", body: "Follow each activation as it happens." },
] as const;

export function TrustSection() {
  return (
    <Section className="py-14 sm:py-16">
      <Container>
        <SectionHeading
          eyebrow="Why Xencodes"
          title="Built around the code arriving"
          description="A number is only useful if the code comes through. This is what Xencodes does to get you there, and how your money is protected when it does not."
        />

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {PROMISES.map((item) => (
            <li
              key={item.title}
              className="flex gap-4 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-subtle)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mint-soft text-forest">
                <item.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <dl className="mt-3 grid gap-x-6 gap-y-4 rounded-xl border border-border bg-background px-5 py-4 sm:grid-cols-3">
          {SECURITY.map((signal) => (
            <div key={signal.title} className="flex gap-2.5">
              <signal.icon className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
              <div>
                <dt className="text-sm font-medium">{signal.title}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{signal.body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Container>
    </Section>
  );
}
