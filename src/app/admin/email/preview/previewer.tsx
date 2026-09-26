"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  label: string;
  subject: string;
  light: string;
  dark: string;
  text: string;
}

const WIDTHS = [
  { label: "320", value: 320 },
  { label: "375", value: 375 },
  { label: "390", value: 390 },
  { label: "430", value: 430 },
  { label: "600", value: 600 },
  { label: "Desktop", value: 0 },
] as const;

export function EmailPreviewer({ templates }: { templates: Template[] }) {
  const [id, setId] = useState(templates[0]?.id);
  const [scheme, setScheme] = useState<"light" | "dark" | "text">("light");
  const [width, setWidth] = useState<number>(0);
  const template = templates.find((t) => t.id === id) ?? templates[0];
  if (!template) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <nav className="flex gap-1.5 overflow-x-auto lg:flex-col">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setId(t.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              t.id === template.id
                ? "bg-mint-soft font-medium text-forest"
                : "text-muted-foreground hover:bg-background",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["light", "dark", "text"] as const).map((value) => (
            <Pill key={value} active={scheme === value} onClick={() => setScheme(value)}>
              {value === "text" ? "Plain text" : value === "light" ? "Light" : "Dark"}
            </Pill>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          {WIDTHS.map((w) => (
            <Pill key={w.label} active={width === w.value} onClick={() => setWidth(w.value)}>
              {w.label}
            </Pill>
          ))}
        </div>

        <p className="text-sm">
          <span className="text-muted-foreground">Subject: </span>
          <span className="font-medium">{template.subject}</span>
        </p>

        <div className="overflow-x-auto rounded-xl border border-border bg-background p-3">
          {scheme === "text" ? (
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-surface p-4 font-mono text-xs leading-relaxed">
              {template.text}
            </pre>
          ) : (
            <iframe
              key={`${template.id}-${scheme}`}
              title={`${template.label} (${scheme})`}
              srcDoc={scheme === "dark" ? template.dark : template.light}
              className="mx-auto block rounded-lg border border-border"
              style={{ width: width ? `${width}px` : "100%", height: "760px" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({
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
      className={cn(
        "h-8 rounded-lg border px-3 text-xs font-medium transition-colors",
        active ? "border-forest bg-mint-soft text-forest" : "border-border text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
