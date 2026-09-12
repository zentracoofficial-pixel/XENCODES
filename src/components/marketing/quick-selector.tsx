"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Service } from "@/data/types";
import type { Country } from "@/data/types";

export function QuickSelector({
  services,
  countries,
}: {
  services: Service[];
  countries: Country[];
}) {
  const router = useRouter();
  const [service, setService] = useState(services[0]?.slug ?? "");
  const [country, setCountry] = useState(countries[0]?.slug ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/buy?service=${service}&country=${country}`);
      }}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center"
    >
      <select
        value={service}
        onChange={(e) => setService(e.target.value)}
        className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
        aria-label="Service"
      >
        {services.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
        aria-label="Country"
      >
        {countries.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.flag} {c.name}
          </option>
        ))}
      </select>

      <Button type="submit" size="lg" className="sm:shrink-0">
        Get Number
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
