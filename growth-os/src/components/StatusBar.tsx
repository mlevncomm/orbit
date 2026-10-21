"use client";

import { useEffect, useState } from "react";

// Program durum çubuğu: bağlantı, açık profil, gönderim biçimi, tarama ve sürüm
export function StatusBar({ tenantName, scanning, scanPct, queued }: { tenantName: string; scanning: boolean; scanPct: number; queued: number }) {
  const [online, setOnline] = useState(true);
  const [surum, setSurum] = useState("");

  useEffect(() => {
    const guncelle = () => setOnline(navigator.onLine);
    const t = window.setTimeout(guncelle, 0);
    window.addEventListener("online", guncelle);
    window.addEventListener("offline", guncelle);
    void fetch("/api/surum", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { surum?: string }) => setSurum((j.surum ?? "").slice(0, 7)))
      .catch(() => undefined);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("online", guncelle);
      window.removeEventListener("offline", guncelle);
    };
  }, []);

  return (
    <footer className="os-status" role="contentinfo">
      <span className={`st-item ${online ? "ok" : "bad"}`}>
        <i className="dot" />
        {online ? "Çevrimiçi" : "Bağlantı yok"}
      </span>
      {tenantName ? <span className="st-item">{tenantName}</span> : null}
      <span className="st-item" title="Hiçbir mesaj siz onaylamadan gönderilmez">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
        Gönderim elle onaylı
      </span>
      {queued ? <span className="st-item">Kuyrukta {queued}</span> : null}
      {scanning ? (
        <span className="st-item st-scan">
          <span className="st-bar">
            <span style={{ width: `${scanPct}%` }} />
          </span>
          Taranıyor %{scanPct}
        </span>
      ) : null}
      <span className="st-spacer" />
      <span className="st-item st-keys">
        <kbd>Ctrl F</kbd> ara <kbd>Ctrl 1–4</kbd> ekranlar <kbd>Ctrl P</kbd> profil <kbd>Ctrl L</kbd> kilitle
      </span>
      {surum ? <span className="st-item">Sürüm {surum}</span> : null}
    </footer>
  );
}
