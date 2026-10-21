"use client";

import { useEffect, useState } from "react";
import { markStatsDirty } from "@/lib/os-events";
import { phoneForWhatsApp } from "@/lib/phone";
import { useToast } from "./Toast";

type Draft = {
  id: string;
  name: string;
  phone: string;
  message: string;
  channel: string;
  firstContact: boolean;
  blocked?: string | null;
};

type Snapshot = {
  sendingLocked?: boolean;
  paused: boolean;
  stopped: boolean;
  dailyCap: number;
  delayMinSec: number;
  delayMaxSec: number;
  cloud?: boolean;
  serverless?: boolean;
  queued: number;
  pending?: number;
  sending: number;
  sentToday: number;
  failed: number;
  lastError?: string | null;
  campaignMedia?: { type: "image" | "video"; url: string } | null;
  current: { id: string; status: string; name: string; phone: string } | null;
  drafts?: Draft[];
};

export function QueuePanel({ onClose, open = false }: { onClose?: () => void; open?: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let timer: number | undefined;
    let delay = 2500;
    const load = async () => {
      try {
        const res = await fetch("/api/outreach", { cache: "no-store" });
        if (!alive) return;
        if (res.ok) setSnap(await res.json());
        delay = res.ok ? 2500 : Math.min(delay * 2, 60_000);
      } catch {
        delay = Math.min(delay * 2, 60_000);
      }
      if (alive) timer = window.setTimeout(() => void load(), delay);
    };
    const boot = window.setTimeout(() => void load(), 0);
    return () => {
      alive = false;
      window.clearTimeout(boot);
      if (timer) window.clearTimeout(timer);
    };
  }, [open]);

  async function control(action: "pause" | "resume" | "stop") {
    await fetch("/api/outreach/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const res = await fetch("/api/outreach", { cache: "no-store" });
    if (res.ok) setSnap(await res.json());
    markStatsDirty();
    toast.push(
      action === "pause" ? "Gönderim duraklatıldı" : action === "resume" ? "Gönderim devam ediyor" : "Kuyruk durduruldu",
    );
  }

  async function moderate(id: string, action: "approve" | "reject" | "edit") {
    const message = editing[id] ?? snap?.drafts?.find((d) => d.id === id)?.message ?? "";
    const res = await fetch("/api/outreach/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        action,
        message: action === "reject" ? undefined : message,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.push(json.error || "Onaylanamadı", "bad");
      return;
    }
    const next = await fetch("/api/outreach", { cache: "no-store" });
    if (next.ok) setSnap(await next.json());
    markStatsDirty();
    if (Array.isArray(json.blocked) && json.blocked.length) {
      toast.push(`Onaylanmadı: ${json.blocked[0]}`, "bad");
      return;
    }
    toast.push(
      action === "reject"
        ? "Reddedildi"
        : !snap?.cloud
          ? "Taslak güncellendi; “WhatsApp’ta aç” ile gönder"
          : snap?.sendingLocked
          ? "Onaylandı; otomatik gönderim kilitli olduğu için sırada bekliyor"
          : action === "edit" ? "Düzenlenip kuyruğa alındı" : "Onaylandı, gönderim deneniyor",
    );
  }

  async function tickNow() {
    const res = await fetch("/api/outreach/tick", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    const next = await fetch("/api/outreach", { cache: "no-store" });
    if (next.ok) setSnap(await next.json());
    markStatsDirty();
    if (!res.ok) {
      toast.push(json.error || "Tick çalışmadı", "bad");
      return;
    }
    toast.push("Kuyruk şimdi denendi");
  }

  async function markSent(id: string) {
    const message = editing[id] ?? snap?.drafts?.find((d) => d.id === id)?.message ?? "";
    const res = await fetch("/api/outreach/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "manual-sent", message }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push(json.error || "Gönderim kaydedilemedi", "bad");
      return;
    }
    const next = await fetch("/api/outreach", { cache: "no-store" });
    if (next.ok) setSnap(await next.json());
    markStatsDirty();
    toast.push("Gönderim kaydedildi; müşteri Yazıldı durumuna alındı");
  }

  const waiting = (snap?.queued ?? 0) + (snap?.sending ?? 0);
  const pending = snap?.pending ?? snap?.drafts?.length ?? 0;
  const cap = snap?.dailyCap ?? 40;
  const sent = snap?.sentToday ?? 0;
  const pct = Math.min(100, Math.round((sent / Math.max(1, cap)) * 100));
  const canSend = Boolean(snap?.cloud);
  const live = canSend && waiting > 0 && !snap?.paused && !snap?.stopped;
  const label = snap?.stopped
    ? "Durdu"
    : snap?.paused
      ? "Duraklatıldı"
      : pending
        ? `${pending} onay bekliyor`
        : waiting
          ? "Gönderiyor"
          : "Boş kuyruk";

  return (
    <aside className="os-queue" aria-label="Kuyruk" inert={open ? undefined : true}>
      <button className="btn btn-ghost" type="button" onClick={onClose}>
        Kapat
      </button>
      <div>
        <div className="page-kicker">Kuyruk</div>
        <h2 style={{ margin: "8px 0 0", fontSize: 26, letterSpacing: "-0.04em" }}>{label}</h2>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          {snap?.cloud
            ? "Kanal: WhatsApp Cloud"
            : snap?.serverless
              ? "Manuel mod — WhatsApp Business'ta açıp son gönderimi siz onaylarsınız."
              : "Kanal: QR yedek (Cloud yok)"}
          {pending > 0 ? " Her kart sektör ve siteye göre yazıldı." : ""}
        </div>
        {snap?.sendingLocked && snap?.cloud ? (
          <div className="notice" style={{ marginTop: 10, fontSize: 13 }}>
            Otomatik gönderim güvenlik kilidiyle kapalı. Onayladığınız taslaklar sırada bekler, hiçbiri kendiliğinden gönderilmez.
          </div>
        ) : null}
      </div>
      {pending > 0 ? (
        <div className="pending-list">
          <div className="muted" style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 700 }}>ONAY</div>
          {(snap?.drafts ?? []).map((d) => (
            <div key={d.id} className="pending-item">
              <strong>{d.name}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{d.phone}</div>
              {d.blocked ? <div className="error-box" style={{ fontSize: 12.5 }}>{d.blocked}</div> : null}
              <textarea
                rows={4}
                value={editing[d.id] ?? d.message}
                onChange={(e) => setEditing((prev) => ({ ...prev, [d.id]: e.target.value }))}
              />
              {d.firstContact && snap?.campaignMedia ? (
                <div className="pending-media" aria-label="İlk mesaj medya önizlemesi">
                  {snap.campaignMedia.type === "video" ? (
                    <video src={snap.campaignMedia.url} controls preload="metadata" playsInline />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- kullanıcı tarafından yüklenen değişken Blob URL'si
                    <img src={snap.campaignMedia.url} alt="İlk mesaj görsel önizlemesi" />
                  )}
                  <span>İlk mesajla birlikte gönderilecek</span>
                </div>
              ) : null}
              <div className="pending-actions">
                {d.blocked ? null : snap?.cloud ? (
                  <button className="btn btn-wexon" type="button" onClick={() => void moderate(d.id, "approve")}>
                    Onayla
                  </button>
                ) : (
                  <a
                    className="btn btn-wexon"
                    href={`https://wa.me/${phoneForWhatsApp(d.phone)}?text=${encodeURIComponent(editing[d.id] ?? d.message)}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpened((prev) => ({ ...prev, [d.id]: true }))}
                  >
                    WhatsApp&apos;ta aç
                  </a>
                )}
                {!snap?.cloud && opened[d.id] ? (
                  <button className="btn btn-ghost" type="button" onClick={() => void markSent(d.id)}>
                    Gönderdim
                  </button>
                ) : null}
                <button className="btn btn-ghost" type="button" onClick={() => void moderate(d.id, "edit")}>
                  Düzenle
                </button>
                <button className="btn btn-danger" type="button" onClick={() => void moderate(d.id, "reject")}>
                  Reddet
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="paper">
        <div className="muted" style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 700 }}>SIRADAKİ</div>
        <div style={{ marginTop: 8, fontWeight: 800 }}>{snap?.current?.name ?? "Bekleyen yok"}</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          {snap?.current?.phone || (canSend ? "Onaylananlar tavan ve gecikmeyle gider" : "Taslakları tek tek WhatsApp’ta açın")}
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Bugün {sent}/{cap}</div>
        <div className="progress teal"><span style={{ width: `${pct}%` }} /></div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {waiting} sırada · {pending} onay · {snap?.failed ?? 0} hata
          {snap?.serverless ? "" : ` · ${snap?.delayMinSec ?? 20}–${snap?.delayMaxSec ?? 45} sn`}
        </div>
        {snap?.lastError ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 8, color: "var(--danger)" }}>
            Son hata: {snap.lastError}
          </div>
        ) : null}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        <span className={`dot${live ? "" : snap?.paused ? " warn" : " off"}`} />
        {live ? "Canlı gönderim" : canSend ? "Beklemede" : "Manuel gönderim hazır"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        {canSend ? (
          <button className="btn btn-ghost" type="button" onClick={() => void tickNow()}>
            Şimdi dene
          </button>
        ) : null}
        {canSend ? (
          <>
            {snap?.paused || snap?.stopped ? (
              <button className="btn btn-wexon" type="button" onClick={() => void control("resume")}>
                Gönderime devam et
              </button>
            ) : (
              <button className="btn btn-ghost" type="button" onClick={() => void control("pause")}>
                Gönderimi duraklat
              </button>
            )}
            <button className="btn btn-danger" type="button" onClick={() => void control("stop")}>
              Kuyruğu durdur
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
