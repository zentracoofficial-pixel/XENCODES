"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FaqItem } from "@/data/faq";

export function FaqAccordion({
  items,
  defaultOpen = null,
}: {
  items: FaqItem[];
  defaultOpen?: number | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpen);

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={item.question}>
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-background"
              >
                <span className="text-[15px] font-medium">{item.question}</span>
                <Plus
                  aria-hidden
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-45",
                  )}
                />
              </button>
            </h3>
            {isOpen ? (
              <p className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground text-pretty">
                {item.answer}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
