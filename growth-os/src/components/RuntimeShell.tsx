"use client";

import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { ToastProvider } from "./Toast";

export function RuntimeShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
