"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlatformShell } from "@/components/PlatformShell";

type TenantUser = { id: string; email: string; createdAt: string };
type TenantCard = {
  id: string;
  slug: string;
  name: string;
  vertical: string;
  active: boolean;
  users: TenantUser[];
  userCount: number;
  leadCount: number;
};

const VERTICAL: Record<string, string> = {
  water: "Su arıtma",
  software: "Yazılım",
  yks: "YKS kursu",
};

export default function PlatformPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantCard[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/platform", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Platform yüklenemedi");
    const rows = (json.tenants ?? []) as TenantCard[];
    setTenants(rows);
    setTenantId((prev) => prev || rows[0]?.id || "");
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void load().catch((err: Error) => setError(err.message));
    }, 0);
    return () => window.clearTimeout(boot);
  }, [load]);

  const census = useMemo(() => {
    return {
      kasas: tenants.length,
      open: tenants.filter((t) => t.active).length,
      leads: tenants.reduce((n, t) => n + t.leadCount, 0),
      users: tenants.reduce((n, t) => n + t.users.length, 0),
    };
  }, [tenants]);

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return tenants;
    return tenants.filter((t) => {
      const hay = `${t.name} ${t.slug} ${VERTICAL[t.vertical] ?? ""} ${t.users.map((u) => u.email).join(" ")}`.toLocaleLowerCase("tr");
      return hay.includes(needle);
    });
  }, [tenants, q]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "İşlem başarısız");
      if (body.action === "impersonate") {
        router.replace("/");
        router.refresh();
        return;
      }
      await load();
      if (body.action === "create-user") {
        setEmail("");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem başarısız");
    } finally {
      setBusy("");
    }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    void post({ action: "create-user", email, password, tenantId }, "create");
  }

  return (
    <PlatformShell search={q} onSearch={setQ} kasaCount={census.kasas}>
      {error ? <p className="error-box">{error}</p> : null}

      <section className="hero">
        <div>
          <div className="hero-kicker">İşletme kasaları</div>
          <div className="hero-val">
            {census.kasas}
            <span className="delta">{census.open} açık</span>
          </div>
          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
            Bugün {census.leads} müşteri · {census.users} kullanıcı
          </div>
        </div>
        <div className="hero-actions">
          <a className="btn btn-mint" href="#hesap">+ Hesap</a>
          <button
            className="btn btn-on-teal"
            type="button"
            onClick={() => {
              void fetch("/api/auth", { method: "DELETE" }).then(() => {
                router.replace("/giris");
                router.refresh();
              });
            }}
          >
            Çıkış
          </button>
        </div>
      </section>

      <div className="kpis">
        <Mini title="Müşteri" value={census.leads} hint="Tüm kasalar" />
        <Mini title="Kullanıcı" value={census.users} hint="İşletme hesapları" />
        <Mini title="Açık kasa" value={`${census.open}/${census.kasas || 0}`} hint="Girişe açık" />
      </div>

      <div className="plat-kasas">
        {visible.length === 0 ? (
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div className="empty" style={{ padding: "24px 0" }}>
              <strong>{tenants.length ? "Eşleşme yok" : "Kasa yok"}</strong>
              {tenants.length ? "Aramayı değiştirin." : "Tenant kayıtları yüklenemedi."}
            </div>
          </div>
        ) : (
          visible.map((t) => (
            <article key={t.id} className={`card${t.active ? "" : " plat-kasa-off"}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div className="page-kicker">{VERTICAL[t.vertical] ?? t.vertical}</div>
                  <h2 style={{ margin: "6px 0 0", fontSize: 22 }}>{t.name}</h2>
                </div>
                <span className={`pill ${t.active ? "ok" : "mute"}`}>{t.active ? "Açık" : "Kapalı"}</span>
              </div>
              <div className="kpi-val">{t.leadCount}</div>
              <div className="muted" style={{ fontSize: 13 }}>müşteri · {t.users.length} kullanıcı</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8, minHeight: 18 }}>
                {t.users.length ? t.users.map((u) => u.email).join(" · ") : "Henüz kullanıcı yok"}
              </div>
              <div className="plat-row-actions" style={{ marginTop: 16 }}>
                <button
                  className="btn btn-wexon"
                  type="button"
                  disabled={!t.active || busy === `in-${t.id}`}
                  onClick={() => void post({ action: "impersonate", tenantId: t.id }, `in-${t.id}`)}
                >
                  {busy === `in-${t.id}` ? "Giriliyor…" : "Destek için gir"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy === `tg-${t.id}`}
                  onClick={() => void post({ action: "toggle", tenantId: t.id, active: !t.active }, `tg-${t.id}`)}
                >
                  {t.active ? "Kapat" : "Aç"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="split-bottom">
        <section className="card" id="hesap">
          <div className="flow-head">
            <div>
              <div className="page-kicker">Kullanıcı</div>
              <h2 style={{ margin: "6px 0 0", fontSize: 20 }}>İşletme hesabı aç</h2>
            </div>
          </div>
          <p className="page-copy">Şifreyi siz belirlersiniz; kişiye ayrı iletin. Kayıt açık değil.</p>
          <form className="plat-fields" onSubmit={onCreate}>
            <label className="field">
              <span>İşletme</span>
              <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>E-posta</span>
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="iris.p@example.org"
                required
              />
            </label>
            <label className="field">
              <span>Şifre</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder="En az 8 karakter"
                required
              />
            </label>
            <button className="btn btn-mint" type="submit" disabled={busy === "create" || !tenants.length}>
              {busy === "create" ? "Ekleniyor…" : "Hesap oluştur"}
            </button>
          </form>
        </section>

        <article className="campaign-card">
          <div>
            <div className="page-kicker" style={{ color: "rgba(255,255,255,0.7)" }}>Kanal</div>
            <h3 style={{ margin: "10px 0 6px", fontSize: 22 }}>WhatsApp kapalı</h3>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Bu ekrandan mesaj gitmez. Destek girişi kayda düşer.
            </div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>{census.users}</div>
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>tanımlı işletme kullanıcısı</div>
          </div>
        </article>
      </div>
    </PlatformShell>
  );
}

function Mini({ title, value, hint }: { title: string; value: number | string; hint: string }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="kpi-ico">◆</div>
        <span className="muted" style={{ fontSize: 12 }}>Anlık</span>
      </div>
      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>{title}</div>
      <div className="kpi-val">{value}</div>
      <div className="muted" style={{ fontSize: 12 }}>{hint}</div>
    </div>
  );
}
