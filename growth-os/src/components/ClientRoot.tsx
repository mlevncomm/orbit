"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RuntimeShell } from "./RuntimeShell";
import { SurumKontrol } from "./SurumKontrol";
import { ToastProvider } from "./Toast";

export function ClientRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/giris") || pathname.startsWith("/profil") || pathname === "/platform" || pathname.startsWith("/platform/")) {
    return (
      <ToastProvider>
        {children}
        <SurumKontrol />
      </ToastProvider>
    );
  }
  return (
    <>
      <RuntimeShell>{children}</RuntimeShell>
      <SurumKontrol />
    </>
  );
}
