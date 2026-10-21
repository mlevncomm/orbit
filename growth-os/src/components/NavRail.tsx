"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_PROFILES } from "@/lib/app-profiles-list";
import { GrowthMark, ProfileMark } from "./BrandMarks";

export const MAIN = [
  { href: "/ara", label: "Müşteri Bul", kbd: "1" },
  { href: "/musteriler", label: "Müşteriler", kbd: "2" },
  { href: "/whatsapp", label: "Mesaj", kbd: "3" },
] as const;

export const SETTINGS = { href: "/ayarlar", label: "Ayarlar", kbd: "4" } as const;

function Ico({ href }: { href: string }) {
  const p = {
    className: "nav-ico",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (href === "/ara") {
    return (
      <svg {...p}>
        <circle cx="11" cy="11" r="6.2" />
        <path d="M16.2 16.2 20.4 20.4" />
      </svg>
    );
  }
  if (href === "/musteriler") {
    return (
      <svg {...p}>
        <circle cx="9" cy="8.2" r="2.4" />
        <path d="M4.6 17.4c.4-2.6 2.3-4 4.4-4s4 1.4 4.4 4" />
        <circle cx="16.2" cy="9" r="2" />
        <path d="M15.2 13.6c1.8.2 3.4 1.3 3.8 3.4" />
      </svg>
    );
  }
  if (href === "/whatsapp") {
    return (
      <svg {...p}>
        <path d="M5 16.6V7.8A2.3 2.3 0 0 1 7.3 5.5h9.4A2.3 2.3 0 0 1 19 7.8v5.4a2.3 2.3 0 0 1-2.3 2.3H9.2L5 16.6z" />
      </svg>
    );
  }
  if (href === "/platform") {
    return (
      <svg {...p}>
        <rect x="4.5" y="5.5" width="6.2" height="13" rx="1.6" />
        <rect x="13.3" y="5.5" width="6.2" height="8" rx="1.6" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 4.6v1.7M12 17.7v1.7M4.6 12h1.7M17.7 12h1.7M6.8 6.8l1.2 1.2M16 16l1.2 1.2M17.2 6.8 16 8M8 16l-1.2 1.2" />
    </svg>
  );
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

type Durum = "ok" | "warn" | "bad" | "off";

function waDurum(waCloud: boolean, waLocal: string): { durum: Durum; metin: string } {
  if (waCloud || waLocal === "ready") return { durum: "ok", metin: "Bağlı" };
  if (waLocal === "qr") return { durum: "warn", metin: "QR bekleniyor" };
  if (waLocal === "starting") return { durum: "warn", metin: "Açılıyor" };
  if (waLocal === "error") return { durum: "bad", metin: "Hata" };
  // API yoksa mesajlar bilgisayardaki WhatsApp uygulamasından elle gönderilir
  return { durum: "ok", metin: "Elle (WhatsApp uygulaması)" };
}

export function NavRail({
  queueOpen,
  onQueueToggle,
  onNavigate,
  places = false,
  waCloud = false,
  waLocal = "disconnected",
  tenantName = "Wexon",
  tenantId = "",
  email = "",
  queued = 0,
  variant = "app",
}: {
  queueOpen: boolean;
  onQueueToggle: () => void;
  onNavigate: () => void;
  places?: boolean;
  waCloud?: boolean;
  waLocal?: string;
  tenantName?: string;
  tenantId?: string;
  email?: string;
  queued?: number;
  variant?: "app" | "platform";
}) {
  const pathname = usePathname();
  const platform = variant === "platform";
  const profil = APP_PROFILES.find((p) => p.tenantId === tenantId) ?? APP_PROFILES.find((p) => p.ad === tenantName);
  const wa = waDurum(waCloud, waLocal);
  const links = platform ? ([{ href: "/platform", label: "Profiller", kbd: "1" }] as const) : MAIN;
  const kisaAd = email ? email.split("@")[0] : "Operatör";

  // Program e-postasız, profil şifresiyle açılır: "Kilitle" oturumu kapatıp profil ekranına döner
  function kilitle() {
    const [adres, hedef] = platform ? ["/api/auth", "/giris"] : ["/api/profil", "/profil"];
    void fetch(adres, { method: "DELETE" }).then(() => {
      window.location.href = hedef;
    });
  }

  const tile = (
    <span className="rail-tile" aria-hidden>
      {profil ? <ProfileMark tenantId={profil.tenantId} size={24} /> : <GrowthMark size={36} />}
    </span>
  );

  return (
    <nav className="os-rail" aria-label="Modüller">
      {profil && !platform ? (
        <Link href="/profil" className="brand rail-profile" onClick={onNavigate} title="Profil değiştir (Ctrl+P)">
          {tile}
          <span className="brand-name">
            <strong>{profil.ad}</strong>
            <span>{profil.alan}</span>
          </span>
          <svg className="rail-switch-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
          </svg>
        </Link>
      ) : (
        <div className="brand rail-profile is-static">
          {tile}
          <span className="brand-name">
            <strong>{platform ? "Wexon" : tenantName}</strong>
            <span>{platform ? "Üst yönetim" : "Growth OS"}</span>
          </span>
        </div>
      )}

      <div className="nav-group">{platform ? "Yönetim" : "Çalışma alanı"}</div>
      {links.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          className={`nav-link${isActive(pathname, m.href) ? " active" : ""}`}
          onClick={onNavigate}
          aria-current={isActive(pathname, m.href) ? "page" : undefined}
          title={`${m.label} (Ctrl+${m.kbd})`}
        >
          <span className="nav-ico-wrap" aria-hidden>
            <Ico href={m.href} />
          </span>
          <span className="nav-label">{m.label}</span>
          <span className="nav-kbd">Ctrl {m.kbd}</span>
        </Link>
      ))}

      {platform ? null : (
        <>
          <div className="nav-group">Sistem</div>
          <Link
            href={SETTINGS.href}
            className={`nav-link${isActive(pathname, SETTINGS.href) ? " active" : ""}`}
            onClick={onNavigate}
            aria-current={isActive(pathname, SETTINGS.href) ? "page" : undefined}
            title={`${SETTINGS.label} (Ctrl+${SETTINGS.kbd})`}
          >
            <span className="nav-ico-wrap" aria-hidden>
              <Ico href={SETTINGS.href} />
            </span>
            <span className="nav-label">{SETTINGS.label}</span>
            <span className="nav-kbd">Ctrl {SETTINGS.kbd}</span>
          </Link>
        </>
      )}

      <div className="rail-foot">
        {platform ? null : (
          <>
            <Link href="/ayarlar" className="rail-status" onClick={onNavigate} title="Bağlantı ayarları">
              <span className="rail-status-row">
                <i className={`dot ${places ? "ok" : "off"}`} />
                <span className="rail-copy">Google arama</span>
                <em>{places ? "Hazır" : "Anahtar yok"}</em>
              </span>
              <span className="rail-status-row">
                <i className={`dot ${wa.durum}`} />
                <span className="rail-copy">{wa.durum === "ok" && !(waCloud || waLocal === "ready") ? "Gönderim" : "WhatsApp"}</span>
                <em>{wa.metin}</em>
              </span>
            </Link>
            <button
              type="button"
              className={`rail-row${queueOpen ? " is-on" : ""}`}
              aria-pressed={queueOpen}
              aria-label={queueOpen ? "Kuyruğu kapat" : "Kuyruğu aç"}
              onClick={onQueueToggle}
            >
              <span className="rail-ico" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                  <path d="M5 7h14M5 12h10M5 17h14" />
                </svg>
              </span>
              <span className="rail-copy">
                <b>Gönderim kuyruğu</b>
                <em>{queued ? `${queued} mesaj bekliyor` : "Boş"}</em>
              </span>
              <span className={`switch${queueOpen ? " on" : ""}`} aria-hidden>
                <i />
              </span>
            </button>
          </>
        )}
        <div className="rail-user">
          <span className="op-ava" aria-hidden>
            {platform ? (kisaAd[0] || "W").toLocaleUpperCase("tr") : <i className="dot ok" />}
          </span>
          <span className="rail-copy">
            <b>{platform ? kisaAd : "Program açık"}</b>
            <em>{platform ? email || "Üst yönetici" : "Ctrl+L ile kilitle"}</em>
          </span>
          <button
            type="button"
            className="rail-logout"
            onClick={kilitle}
            aria-label={platform ? "Çıkış yap" : "Programı kilitle"}
            title={platform ? "Çıkış yap" : "Programı kilitle (Ctrl+L)"}
            data-lpignore="true"
            data-1p-ignore="true"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
