"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { NavRail } from "./NavRail";

export function PlatformShell({
  children,
  search,
  onSearch,
  kasaCount = 0,
}: {
  children: ReactNode;
  search: string;
  onSearch: (value: string) => void;
  kasaCount?: number;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    void fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { email?: string }) => setEmail(j.email ?? ""))
      .catch(() => undefined);
  }, []);

  function onFind(e: FormEvent) {
    e.preventDefault();
  }

  return (
    <div className={`os${navOpen ? " nav-open" : ""}`}>
      <NavRail
        variant="platform"
        queueOpen={false}
        onQueueToggle={() => undefined}
        onNavigate={() => setNavOpen(false)}
        tenantName="Wexon"
        email={email}
      />
      <div className="os-stage">
        <header className="os-top">
          <button className="btn btn-ghost menu-btn" type="button" aria-label="Menü" onClick={() => setNavOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
              <path d="M5 7h14M5 12h14M5 17h14" />
            </svg>
          </button>
          <form className="search" onSubmit={onFind}>
            <span className="search-ico" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="6.2" />
                <path d="M16.2 16.2 20.4 20.4" />
              </svg>
            </span>
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="İşletme veya e-posta"
            />
            <kbd className="kbd">Ctrl F</kbd>
          </form>
          <div className="top-actions">
            <div className="top-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <rect x="4" y="5.5" width="16" height="14.5" rx="2.2" />
                <path d="M8 3.8v3.2M16 3.8v3.2M4 10h16" />
              </svg>
              <span>Gösterge</span>
            </div>
            <span className="btn btn-wexon queue-toggle">
              <span className="queue-label">Kasalar</span>
              <span className="q-count">{kasaCount}</span>
            </span>
          </div>
        </header>
        <main className="os-main">{children}</main>
      </div>
      <button type="button" className="nav-backdrop" aria-label="Menüyü kapat" onClick={() => setNavOpen(false)} />
    </div>
  );
}
