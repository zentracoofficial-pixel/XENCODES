import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/marketing/code-block";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Complete Xencodes API documentation: getting started, authentication, endpoint reference, webhooks, error codes, and SDKs.",
};

const toc = [
  { href: "#getting-started", label: "Getting Started" },
  { href: "#authentication", label: "Authentication" },
  { href: "#api-reference", label: "API Reference" },
  { href: "#webhooks", label: "Webhooks" },
  { href: "#errors", label: "Error Codes" },
  { href: "#sdks", label: "SDKs" },
];

const endpoints = [
  {
    id: "countries",
    method: "GET",
    path: "/v1/countries",
    description: "List supported countries with live availability status.",
  },
  {
    id: "services",
    method: "GET",
    path: "/v1/services",
    description: "List supported services, optionally filtered by country.",
  },
  {
    id: "pricing",
    method: "GET",
    path: "/v1/pricing",
    description: "Get current price for a given service and country pair.",
  },
  {
    id: "activations",
    method: "POST",
    path: "/v1/activations",
    description: "Purchase a number and start an activation or rental.",
  },
  {
    id: "sms",
    method: "GET",
    path: "/v1/activations/{id}/sms",
    description: "Retrieve SMS messages received for an activation.",
  },
  {
    id: "balance",
    method: "GET",
    path: "/v1/balance",
    description: "Get current wallet balance for the authenticated account.",
  },
];

const errorCodes = [
  { code: "400", name: "invalid_request", description: "The request is missing required fields or malformed." },
  { code: "401", name: "unauthorized", description: "The API key is missing, invalid, or revoked." },
  { code: "402", name: "insufficient_balance", description: "Wallet balance is too low to complete the purchase." },
  { code: "404", name: "not_found", description: "The requested resource does not exist." },
  { code: "409", name: "unavailable", description: "No numbers are currently available for that country/service pair." },
  { code: "429", name: "rate_limited", description: "Too many requests — see your plan's rate limit." },
];

export default function DocsPage() {
  return (
    <Section>
      <Container>
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1">
              {toc.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="max-w-3xl space-y-16">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Xencodes API documentation
              </h1>
              <p className="mt-3 text-muted-foreground">
                Everything you need to integrate virtual numbers and SMS
                verification into your own systems.
              </p>
            </div>

            <section id="getting-started" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">Getting Started</h2>
              <p className="mt-3 text-muted-foreground">
                Create an account, generate an API key from{" "}
                <code className="rounded bg-secondary px-1.5 py-0.5 text-sm">
                  /dashboard/api/keys
                </code>
                , and make your first request against the base URL below.
              </p>
              <CodeBlock
                className="mt-5"
                language="bash"
                code={`BASE_URL=https://api.xencodes.com

curl $BASE_URL/v1/services \\
  -H "Authorization: Bearer $XENCODES_API_KEY"`}
              />
            </section>

            <section id="authentication" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">Authentication</h2>
              <p className="mt-3 text-muted-foreground">
                All requests require an API key sent as a bearer token in the{" "}
                <code className="rounded bg-secondary px-1.5 py-0.5 text-sm">
                  Authorization
                </code>{" "}
                header. Keys are scoped per account and can be revoked at any
                time from your dashboard.
              </p>
              <CodeBlock
                className="mt-5"
                language="http"
                code={`Authorization: Bearer xnc_live_51H8f...`}
              />
            </section>

            <section id="api-reference" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">API Reference</h2>
              <p className="mt-3 text-muted-foreground">
                Core resources for building a verification flow end to end.
              </p>
              <div className="mt-5 space-y-3">
                {endpoints.map((endpoint) => (
                  <Card key={endpoint.id} id={endpoint.id} className="scroll-mt-24 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant={endpoint.method === "GET" ? "primary" : "success"}>
                        {endpoint.method}
                      </Badge>
                      <code className="text-sm font-mono">{endpoint.path}</code>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {endpoint.description}
                    </p>
                  </Card>
                ))}
              </div>
            </section>

            <section id="webhooks" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">Webhooks</h2>
              <p className="mt-3 text-muted-foreground">
                Configure a webhook endpoint from{" "}
                <code className="rounded bg-secondary px-1.5 py-0.5 text-sm">
                  /dashboard/api/webhooks
                </code>{" "}
                to receive activation lifecycle events instead of polling.
              </p>
              <CodeBlock
                className="mt-5"
                language="json"
                code={`{
  "event": "activation.sms_received",
  "activation_id": "act_8f2c1a",
  "code": "482019",
  "received_at": "2026-09-12T14:30:11Z"
}`}
              />
            </section>

            <section id="errors" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">Error Codes</h2>
              <Card className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Code</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorCodes.map((error) => (
                      <tr key={error.code} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono">{error.code}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {error.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {error.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>

            <section id="sdks" className="scroll-mt-24">
              <h2 className="text-xl font-semibold">SDKs</h2>
              <p className="mt-3 text-muted-foreground">
                Official client libraries are on the roadmap. Until then, the
                REST API works with any HTTP client in any language.
              </p>
            </section>
          </div>
        </div>
      </Container>
    </Section>
  );
}
