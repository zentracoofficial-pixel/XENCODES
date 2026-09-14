"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A search-and-select field for lists too long to render as a menu.
 *
 * The buy page picks from SMSPool's full catalog, which runs to well over
 * a thousand services and more than a hundred countries. Options are
 * therefore supplied already filtered and capped by the caller, which for
 * services means the server does the filtering: typing is the way through
 * the list, and scrolling is for the shortlist that typing produces.
 */

export interface ComboboxOption {
  value: string;
  label: string;
  /** Rendered on the left of the row, for example a flag or a logo. */
  leading?: React.ReactNode;
  /** Rendered on the right of the row, for example a price. */
  trailing?: React.ReactNode;
  /** Second line under the label. */
  hint?: string;
  /** Optional section this option belongs under, for example "Popular
   *  services". Options are rendered in the order given, and a heading is
   *  drawn each time the group changes, so the caller controls grouping by
   *  ordering rather than by nesting arrays. */
  group?: string;
}

export function Combobox({
  label,
  placeholder,
  emptyMessage,
  options,
  value,
  onChange,
  onQueryChange,
  loading = false,
  disabled = false,
  disabledMessage,
  autoFocus = false,
}: {
  label: string;
  placeholder: string;
  emptyMessage: string;
  options: ComboboxOption[];
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption) => void;
  /** Called as the query changes, for server side filtering. */
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledMessage?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  // Close on an outside click, so the list never sits over the rest of the
  // form after attention has moved elsewhere.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    optionRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted, options]);

  function select(option: ComboboxOption) {
    onChange(option);
    setOpen(false);
    setQuery("");
    onQueryChange?.("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlighted((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && options[highlighted]) {
      event.preventDefault();
      select(options[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  if (disabled) {
    return (
      <div>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="mt-1.5 flex h-12 items-center rounded-xl border border-border bg-background px-3.5 text-sm text-muted-foreground">
          {disabledMessage ?? placeholder}
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>

      <div className="relative mt-1.5">
        {value && !open ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 text-left text-sm transition-colors hover:border-mint"
          >
            {value.leading}
            <span className="min-w-0 flex-1 truncate font-medium">{value.label}</span>
            {value.trailing}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id={id}
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={`${id}-listbox`}
              aria-autocomplete="list"
              autoComplete="off"
              autoFocus={autoFocus}
              value={query}
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
                setOpen(true);
                onQueryChange?.(e.target.value);
              }}
              onKeyDown={onKeyDown}
              className="h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-9 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
            {loading ? (
              <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : query ? (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => {
                  setQuery("");
                  onQueryChange?.("");
                  inputRef.current?.focus();
                }}
                className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-mint-soft"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </>
        )}

        {open ? (
          <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-panel)]">
            {options.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
                {loading ? "Searching..." : emptyMessage}
              </p>
            ) : (
              <ul
                id={`${id}-listbox`}
                role="listbox"
                aria-label={label}
                className="max-h-72 overflow-y-auto py-1"
              >
                {options.map((option, index) => (
                  <li key={option.value}>
                    {option.group && option.group !== options[index - 1]?.group ? (
                      <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {option.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => select(option)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors",
                        index === highlighted && "bg-background",
                      )}
                    >
                      {option.leading}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {option.label}
                        </span>
                        {option.hint ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {option.hint}
                          </span>
                        ) : null}
                      </span>
                      {option.trailing}
                      {value?.value === option.value ? (
                        <Check className="h-4 w-4 shrink-0 text-forest" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
