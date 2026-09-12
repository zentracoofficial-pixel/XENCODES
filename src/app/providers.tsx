"use client";

import { ThemeProvider } from "next-themes";
import type { ComponentProps } from "react";

export function Providers({
  children,
  ...props
}: ComponentProps<typeof ThemeProvider>) {
  return <ThemeProvider {...props}>{children}</ThemeProvider>;
}
