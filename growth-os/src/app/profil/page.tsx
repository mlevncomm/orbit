"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GrowthMark, ProfileMark } from "@/components/BrandMarks";
import styles from "./profil.module.css";

type Profil = {
  tenantId: string;
  ad: string;
  aciklama: string;
  alan: string;
  renk: string;
  vurgu: string;
  pinUzunluk: number;
  sifreAyarli: boolean;
  sonAcilis: string | null;
  kilitBitis: number | null;
  /** Son 24 saatteki yanlış deneme sayısı (tüm cihazlar) */
  yanlis24: number;
};

type Durum = "bos" | "gonderiliyor" | "hata" | "tamam";

function selamlama(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

function sonAcilisMetni(iso: string | null): string {
  if (!iso) return "Henüz açılmadı";
  const t = new Date(iso);
  const simdi = new Date();
  const saat = t.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const gun = Math.round((new Date(simdi.toDateString()).getTime() - new Date(t.toDateString()).getTime()) / 86_400_000);
  if (gun <= 0) return `Son açılış bugün ${saat}`;
  if (gun === 1) return `Son açılış dün ${saat}`;
  if (gun < 7) return `Son açılış ${gun} gün önce`;
  return `Son açılış ${t.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}`;
}

function kalanSure(bitis: number, simdi: number) {
  const s = Math.max(0, Math.ceil((bitis - simdi) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const TUSLAR = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "sil"] as const;

export default function ProfilPage() {
  const [profiller, setProfiller] = useState<Profil[] | null>(null);
  const [secili, setSecili] = useState<Profil | null>(null);
  const [isaret, setIsaret] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [durum, setDurum] = useState<Durum>("bos");
  const [mesaj, setMesaj] = useState("");
  const [sallan, setSallan] = useState(0);
  const [simdi, setSimdi] = useState(() => Date.now());
  const [yukHata, setYukHata] = useState("");
  const pinRef = useRef<HTMLInputElement>(null);

  const yukle = useCallback(async () => {
    setYukHata("");
    try {
      // Ekran her açıldığında program kilitlenir: profil ve şifre yeniden istenir
      await fetch("/api/profil", { method: "DELETE" });
      const r = await fetch("/api/profil", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { profiller: Profil[] };
      setProfiller(j.profiller ?? []);
      setSimdi(Date.now());
    } catch {
      setYukHata("Profiller yüklenemedi. İnternet bağlantınızı kontrol edin.");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void yukle(), 0);
    return () => window.clearTimeout(t);
  }, [yukle]);

  // Kilit geri sayımı
  const kilitBitis = secili?.kilitBitis && secili.kilitBitis > simdi ? secili.kilitBitis : null;
  useEffect(() => {
    if (!kilitBitis) return;
    const t = window.setInterval(() => setSimdi(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [kilitBitis]);

  const sec = useCallback((p: Profil) => {
    setSecili(p);
    setPin("");
    setDurum("bos");
    setMesaj("");
    setSimdi(Date.now());
  }, []);

  const geri = useCallback(() => {
    setSecili(null);
    setPin("");
    setDurum("bos");
    setMesaj("");
  }, []);

  useEffect(() => {
    if (secili && !kilitBitis) pinRef.current?.focus();
  }, [secili, kilitBitis]);

  const gonder = useCallback(
    async (deger: string) => {
      if (!secili) return;
      setDurum("gonderiliyor");
      setMesaj("");
      try {
        const r = await fetch("/api/profil", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: secili.tenantId, pin: deger }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string; git?: string; kilitBitis?: number | null };
        if (r.ok) {
          setDurum("tamam");
          window.setTimeout(() => window.location.replace(j.git || "/ara"), 420);
          return;
        }
        if (r.status === 429 && j.kilitBitis) {
          const guncel = { ...secili, kilitBitis: j.kilitBitis };
          setSecili(guncel);
          setProfiller((ps) => ps?.map((p) => (p.tenantId === guncel.tenantId ? guncel : p)) ?? ps);
          setSimdi(Date.now());
        }
        setDurum("hata");
        setMesaj(j.error || "Profil açılamadı");
        setSallan((n) => n + 1);
        window.setTimeout(() => {
          setPin("");
          setDurum((d) => (d === "hata" ? "bos" : d));
          pinRef.current?.focus();
        }, 650);
      } catch {
        setDurum("hata");
        setMesaj("Bağlantı kurulamadı. Tekrar deneyin.");
        setPin("");
      }
    },
    [secili],
  );

  const yaz = useCallback(
    (deger: string) => {
      if (!secili || kilitBitis || durum === "gonderiliyor" || durum === "tamam") return;
      const temiz = deger.replace(/\D/g, "").slice(0, secili.pinUzunluk);
      setPin(temiz);
      if (durum === "hata") setDurum("bos");
      if (temiz.length === secili.pinUzunluk) void gonder(temiz);
    },
    [secili, kilitBitis, durum, gonder],
  );

  const tus = (t: (typeof TUSLAR)[number]) => {
    if (t === "sil") yaz(pin.slice(0, -1));
    else if (t) yaz(pin + t);
    pinRef.current?.focus();
  };

  // Klavye: profil ekranında 1/2 ile seçim, şifre adımında Esc ile geri
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && secili) {
        e.preventDefault();
        geri();
        return;
      }
      if (!secili && profiller) {
        const i = Number(e.key) - 1;
        if (Number.isInteger(i) && profiller[i]) {
          // Seçim tuşu şifre kutusuna rakam olarak düşmesin
          e.preventDefault();
          sec(profiller[i]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [secili, profiller, sec, geri]);


  const odak = secili ?? profiller?.find((p) => p.tenantId === isaret) ?? null;
  const sahne = useMemo(
    () => ({ "--p-renk": odak?.renk ?? "#0b4f4a", "--p-vurgu": odak?.vurgu ?? "#3dff9a" }) as CSSProperties,
    [odak],
  );
  const selam = useMemo(() => selamlama(), []);

  return (
    <div className={styles.shell} style={sahne} data-odak={odak ? "1" : "0"}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.grid} aria-hidden />

      <header className={styles.top}>
        <div className={styles.brand}>
          <GrowthMark size={34} />
          <span>
            Wexon <b>Growth OS</b>
          </span>
        </div>
        <span className={styles.lockNote}>
          <LockIcon /> Program kilitli
        </span>
      </header>

      <main className={styles.stage}>
        {!secili ? (
          <section className={styles.pick} key="sec">
            <div className={styles.heading}>
              <p className={styles.eyebrow}>{selam}</p>
              <h1>Bugün hangi işletmeyle çalışıyoruz?</h1>
              <p className={styles.lead}>Her profilin müşterileri, mesajları ve WhatsApp bağlantısı birbirinden tamamen ayrıdır.</p>
            </div>

            {yukHata ? (
              <div className={styles.loadError} role="alert">
                <span>{yukHata}</span>
                <button type="button" className={styles.ghost} onClick={() => void yukle()}>
                  Tekrar dene
                </button>
              </div>
            ) : null}

            <div className={styles.cards} role="list">
              {(profiller ?? [null, null]).map((p, i) =>
                p ? (
                  <button
                    key={p.tenantId}
                    type="button"
                    role="listitem"
                    className={styles.card}
                    style={{ "--c-renk": p.renk, "--c-vurgu": p.vurgu, animationDelay: `${i * 70}ms` } as CSSProperties}
                    onClick={() => sec(p)}
                    onMouseEnter={() => setIsaret(p.tenantId)}
                    onMouseLeave={() => setIsaret(null)}
                    onFocus={() => setIsaret(p.tenantId)}
                    onBlur={() => setIsaret(null)}
                    aria-label={`${p.ad} profilini seç`}
                  >
                    <span className={styles.kbd} aria-hidden>
                      {i + 1}
                    </span>
                    <span className={styles.tile}>
                      <ProfileMark tenantId={p.tenantId} size={46} />
                    </span>
                    <span className={styles.cardText}>
                      <span className={styles.cardTag}>{p.alan}</span>
                      <span className={styles.cardName}>{p.ad}</span>
                      <span className={styles.cardDesc}>{p.aciklama}</span>
                    </span>
                    <span className={styles.cardFoot}>
                      <span className={`${styles.meta} ${p.yanlis24 ? styles.metaWarn : ""}`}>
                        {p.yanlis24 && !(p.kilitBitis && p.kilitBitis > simdi) ? (
                          <>
                            <WarnIcon /> Son 24 saatte {p.yanlis24} yanlış deneme
                          </>
                        ) : p.kilitBitis && p.kilitBitis > simdi ? (
                          <>
                            <LockIcon /> Geçici olarak kilitli
                          </>
                        ) : (
                          sonAcilisMetni(p.sonAcilis)
                        )}
                      </span>
                      <span className={styles.go} aria-hidden>
                        <ArrowIcon />
                      </span>
                    </span>
                  </button>
                ) : (
                  <div key={`s${i}`} className={`${styles.card} ${styles.skeleton}`} aria-hidden />
                ),
              )}
            </div>

            <p className={styles.hint}>
              <kbd>1</kbd> <kbd>2</kbd> ile de seçebilirsiniz
            </p>
          </section>
        ) : (
          <section className={styles.unlock} key={secili.tenantId} aria-labelledby="pin-baslik">
            <button type="button" className={styles.back} onClick={geri}>
              <ArrowIcon flip /> Profiller
            </button>

            <div className={`${styles.badge} ${durum === "tamam" ? styles.badgeOk : ""}`}>
              <ProfileMark tenantId={secili.tenantId} size={54} />
            </div>
            <h2 id="pin-baslik">{secili.ad}</h2>
            <p className={styles.lead}>
              {kilitBitis ? "Çok fazla yanlış deneme yapıldı." : durum === "tamam" ? "Profil açılıyor…" : "Devam etmek için profil şifresini girin."}
            </p>

            {kilitBitis ? (
              <div className={styles.locked} role="status">
                <LockIcon />
                <div>
                  <strong>{kalanSure(kilitBitis, simdi)}</strong>
                  <span>sonra tekrar deneyebilirsiniz</span>
                </div>
              </div>
            ) : !secili.sifreAyarli ? (
              <p className={styles.error}>Bu profilin şifresi henüz ayarlanmamış.</p>
            ) : (
              <>
                <label className={styles.pinWrap} key={sallan} data-durum={durum} data-sallan={sallan ? "1" : "0"}>
                  <span className="sr-only">{secili.ad} profil şifresi</span>
                  <input
                    ref={pinRef}
                    className={styles.pinInput}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]*"
                    maxLength={secili.pinUzunluk}
                    value={pin}
                    onChange={(e) => yaz(e.target.value)}
                    disabled={durum === "gonderiliyor" || durum === "tamam"}
                    aria-invalid={durum === "hata"}
                    aria-describedby="pin-mesaj"
                  />
                  {Array.from({ length: secili.pinUzunluk }, (_, i) => (
                    <span
                      key={i}
                      className={`${styles.slot} ${i < pin.length ? styles.filled : ""} ${i === pin.length && durum === "bos" ? styles.caret : ""}`}
                      aria-hidden
                    />
                  ))}
                </label>

                <p id="pin-mesaj" className={styles.error} role="alert" aria-live="assertive">
                  {mesaj}
                </p>

                <div className={styles.pad} aria-label="Tuş takımı">
                  {TUSLAR.map((t, i) =>
                    t === "" ? (
                      <span key={i} />
                    ) : (
                      <button
                        key={i}
                        type="button"
                        tabIndex={-1}
                        className={`${styles.key} ${t === "sil" ? styles.keyAlt : ""}`}
                        onClick={() => tus(t)}
                        disabled={durum === "gonderiliyor" || durum === "tamam" || (t === "sil" && !pin)}
                        aria-label={t === "sil" ? "Son rakamı sil" : t}
                      >
                        {t === "sil" ? <BackIcon /> : t}
                      </button>
                    ),
                  )}
                </div>
              </>
            )}

            <p className={styles.hint}>
              <kbd>Esc</kbd> profillere döner
            </p>
          </section>
        )}
      </main>

      <footer className={styles.foot}>Müşteri bul · Doğru mesajı yaz · WhatsApp’tan ulaş</footer>
    </div>
  );
}

function ArrowIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 018 0v3" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5h10a2 2 0 012 2v10a2 2 0 01-2 2H9l-6-7 6-7z" />
      <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}
