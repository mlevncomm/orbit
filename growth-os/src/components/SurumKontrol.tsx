"use client";

import { useEffect, useRef, useState } from "react";

// Yeni yayın çıkınca program kendiliğinden yenilenir (kullanıcıdan onay beklemez).
// Yazılan bir şey kaybolmasın diye yalnızca güvenli anda yenilenir: ekran arka plandaysa,
// profil ekranındaysa ya da kullanıcı bir süredir dokunmuyorsa ve açık bir yazı alanı yoksa.

const ARALIK_MS = 2 * 60 * 1000;
const BOSTA_MS = 45 * 1000;
const BEKLEME_MS = 4 * 1000;

function yaziVar(): boolean {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return el.value.trim().length > 0;
  if (el instanceof HTMLInputElement) return !["button", "checkbox", "radio", "submit"].includes(el.type) && el.value.trim().length > 0;
  return el.isContentEditable;
}

export function SurumKontrol() {
  const [yeni, setYeni] = useState(false);
  const [sayac, setSayac] = useState<number | null>(null);
  const sonHareket = useRef(0);

  // Yeni sürümü denetle
  useEffect(() => {
    // Temel değer: bu sayfanın derlendiği sürüm (yoksa ilk görülen sürüm)
    const gomulu = process.env.NEXT_PUBLIC_SURUM;
    let ilk: string | null = gomulu && gomulu !== "yerel" ? gomulu : null;
    let alive = true;
    sonHareket.current = Date.now();
    const kontrol = async () => {
      if (!alive) return;
      try {
        const r = await fetch("/api/surum", { cache: "no-store" });
        const { surum } = (await r.json()) as { surum?: string };
        if (!surum || surum === "yerel") return;
        if (ilk === null) ilk = surum;
        else if (surum !== ilk) setYeni(true);
      } catch {}
    };
    void kontrol();
    const t = window.setInterval(() => void kontrol(), ARALIK_MS);
    const tekrar = () => void kontrol();
    document.addEventListener("visibilitychange", tekrar);
    window.addEventListener("focus", tekrar);
    window.addEventListener("online", tekrar);
    const hareket = () => {
      sonHareket.current = Date.now();
    };
    for (const e of ["keydown", "pointerdown", "input", "wheel"]) window.addEventListener(e, hareket, { passive: true });
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", tekrar);
      window.removeEventListener("focus", tekrar);
      window.removeEventListener("online", tekrar);
      for (const e of ["keydown", "pointerdown", "input", "wheel"]) window.removeEventListener(e, hareket);
    };
  }, []);

  // Güvenli an gelince kısa bir geri sayımla yenile
  useEffect(() => {
    if (!yeni) return;
    let geriSayim: number | null = null;
    const t = window.setInterval(() => {
      const profilEkrani = window.location.pathname.startsWith("/profil");
      const guvenli = document.hidden || profilEkrani || (Date.now() - sonHareket.current > BOSTA_MS && !yaziVar());
      if (!guvenli) {
        geriSayim = null;
        setSayac(null);
        return;
      }
      if (document.hidden) {
        window.location.reload();
        return;
      }
      geriSayim = geriSayim === null ? BEKLEME_MS / 1000 : geriSayim - 1;
      setSayac(geriSayim);
      if (geriSayim <= 0) window.location.reload();
    }, 1000);
    return () => window.clearInterval(t);
  }, [yeni]);

  if (!yeni) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", right: 18, bottom: 40, zIndex: 90, display: "flex", alignItems: "center", gap: 12,
        background: "#0b1418", color: "#fff", borderRadius: 14, padding: "10px 12px 10px 16px",
        boxShadow: "0 16px 36px rgba(0, 0, 0, 0.28)", fontSize: 13, border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span>{sayac !== null ? `Yeni sürüm yükleniyor… ${sayac}` : "Yeni sürüm hazır · işiniz bitince kendiliğinden yüklenecek"}</span>
      <button type="button" className="btn btn-mint" style={{ minHeight: 32, padding: "0 12px" }} onClick={() => window.location.reload()}>
        Şimdi
      </button>
    </div>
  );
}
