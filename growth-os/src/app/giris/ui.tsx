"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AquailsMark, GrowthMark, WexonMark } from "@/components/BrandMarks";
import styles from "./auth.module.css";

function nextPath() {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

const AKIS = [
  { no: "01", baslik: "Müşteri bul", metin: "Bölge ve sektör seçin; Google’daki işletmeler puanı ve iletişim bilgisiyle listelensin." },
  { no: "02", baslik: "Müşterilerini yönet", metin: "Durum, not ve iletişim izni her işletme için tek ekranda." },
  { no: "03", baslik: "WhatsApp’tan yaz", metin: "Kalite kontrolünden geçmiş, işletmeye özel taslak; siz onaylamadan hiçbir şey gitmez." },
];

export default function GirisPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("wexon_admin_email");
        if (saved) setEmail(saved);
      } catch {}
    }, 0);
    void fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; home?: string; role?: string }) => {
        if (!j.ok) return;
        const n = nextPath();
        if (j.role === "member" && n.startsWith("/platform")) router.replace("/");
        else if (j.role === "platform" && (n === "/" || n.startsWith("/platform"))) router.replace(j.home || "/platform");
        else router.replace(n);
      })
      .catch(() => undefined);
    return () => window.clearTimeout(restore);
  }, [router]);

  function capsKontrol(e: KeyboardEvent<HTMLInputElement>) {
    setCaps(e.getModifierState?.("CapsLock") ?? false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Giriş yapılamadı");
      try {
        window.localStorage.setItem("wexon_admin_email", email.trim().toLowerCase());
      } catch {}
      setDone(true);
      const home = typeof json.home === "string" ? json.home : "/";
      const n = nextPath();
      if (json.role === "member" && n.startsWith("/platform")) router.replace("/");
      else if (json.role === "platform" && (n === "/" || n.startsWith("/platform"))) router.replace(home);
      else router.replace(n === "/" ? home : n);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş yapılamadı");
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.brand}>
        <div className={styles.glow} aria-hidden />
        <div className={styles.lines} aria-hidden />
        <div className={styles.brandInner}>
          <div className={styles.logo}>
            <GrowthMark size={40} />
            <span>
              Wexon <b>Growth OS</b>
            </span>
          </div>

          <div className={styles.pitch}>
            <h1>
              Doğru işletmeyi bulun, <em>doğru mesajı</em> yazın.
            </h1>
            <p>Yeni müşteri bulma, takip ve WhatsApp iletişimi tek bir sakin çalışma alanında.</p>
          </div>

          <ol className={styles.flow}>
            {AKIS.map((a) => (
              <li key={a.no}>
                <span className={styles.no}>{a.no}</span>
                <div>
                  <strong>{a.baslik}</strong>
                  <p>{a.metin}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className={styles.profiles}>
            <span>Profiller</span>
            <span className={styles.chip} style={{ color: "#3dff9a" }}>
              <WexonMark size={16} /> Wexon.dev
            </span>
            <span className={styles.chip} style={{ color: "#5fd4ff" }}>
              <AquailsMark size={16} /> Aquails
            </span>
          </div>
        </div>
      </aside>

      <main className={styles.panel}>
        <form className={styles.form} onSubmit={(e) => void submit(e)}>
          <div className={styles.mobileLogo}>
            <GrowthMark size={36} />
            <span>
              Wexon <b>Growth OS</b>
            </span>
          </div>
          <header className={styles.head}>
            <h2>Tekrar hoş geldiniz</h2>
            <p>Hesabınızla giriş yapın; ardından çalışacağınız profili seçeceksiniz.</p>
          </header>

          {error ? (
            <p className={styles.alert} role="alert">
              <AlertIcon /> {error}
            </p>
          ) : null}

          <label className={styles.field}>
            <span>E-posta</span>
            <div className={styles.control}>
              <MailIcon />
              <input
                type="email"
                autoComplete="username"
                autoFocus
                placeholder="ornek@firma.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
              />
            </div>
          </label>

          <label className={styles.field}>
            <span>Şifre</span>
            <div className={styles.control}>
              <KeyIcon />
              <input
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Şifreniz"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={capsKontrol}
                onKeyUp={capsKontrol}
                onBlur={() => setCaps(false)}
                required
                disabled={busy}
              />
              <button
                type="button"
                className={styles.eye}
                aria-label={showPass ? "Şifreyi gizle" : "Şifreyi göster"}
                aria-pressed={showPass}
                onClick={() => setShowPass((v) => !v)}
              >
                {showPass ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {caps ? <em className={styles.caps}>Büyük harf kilidi (Caps Lock) açık</em> : null}
          </label>

          <button className={styles.submit} type="submit" disabled={busy || !email || !password}>
            {busy ? (
              <>
                <span className={styles.spinner} aria-hidden /> {done ? "Açılıyor…" : "Giriş yapılıyor…"}
              </>
            ) : (
              <>
                Giriş yap <ArrowIcon />
              </>
            )}
          </button>

          <p className={styles.foot}>
            <ShieldIcon /> Oturumunuz bu cihazda şifreli çerezle tutulur. Her profil ayrıca kendi şifresiyle açılır.
          </p>
        </form>
      </main>
    </div>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7.5l8 5.5 8-5.5" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 018 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.4-7.5 9.5-4.3-1.1-7.5-4.9-7.5-9.5V6L12 3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2.2 12C4 7 8.6 4 12 4s8 3 9.8 8c-1.8 5-6.4 8-9.8 8s-8-3-9.8-8z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A2 2 0 0012 14a2 2 0 001.4-.6" />
      <path d="M9.9 5.1A10.5 10.5 0 0121 12c-.6 1-1.4 2-2.4 2.9M6.1 6.1C4.4 7.4 3.1 9.1 2.2 12c1.8 5 6.4 8 9.8 8 1.6 0 3.2-.5 4.6-1.4" />
    </svg>
  );
}
