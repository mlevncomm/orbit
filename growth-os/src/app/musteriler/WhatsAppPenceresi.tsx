"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPhoneDisplay, isWhatsAppCapablePhone, normalizePhone } from "@/lib/phone";
import { categoriesFor, categoryById, REFINE_MODES, type CategoryId, type RefineMode } from "@/lib/sales/categories";
import { BASIS_SOURCES, BASIS_TYPES, legalLabel, WHATSAPP_SOURCES, whatsappLabel, type BasisSource, type BasisType, type ChannelState, type LegalState, type WhatsAppSource } from "@/lib/sales/consent";
import { cleanExternal, cleanLink, contextSummary, type CustomerContext } from "@/lib/sales/context";
import { localResult, type Draft, type DraftResult } from "@/lib/sales/engine";
import { OPT_OUT_LINE, withOptOut } from "@/lib/sales/policy";
import { evaluateMessage, TARGET_SCORE } from "@/lib/sales/quality";

export type MesajLead = { id: string; name: string; phone: string; notes: string; status: string };
type Recent = { at: string; status: string; category: string };
type Policy = { allowed: boolean; kind: "ilk" | "takip" | "yanit" | "kapanis"; reason: string; warnings: string[]; retHakkiGerekli?: boolean };
type Boot = { ctx: CustomerContext; policy: Policy & { needsBasis?: boolean; needsWhatsApp?: boolean }; legal: LegalState; whatsapp: ChannelState; kapanisAllowed: boolean; category: CategoryId; hasLlm: boolean; recent: Recent[] };

const AD_KEY = "growth-os:mesaj:ad";

const waDigits = (p: string) => {
  const e = normalizePhone(p, "TR");
  return e && isWhatsAppCapablePhone(e) ? e.replace(/^\+/, "") : "";
};

function scoreTone(score: number, blocked: boolean) {
  if (blocked) return "bad";
  return score >= TARGET_SCORE ? "ok" : score >= 85 ? "warn" : "bad";
}

function statusText(cat: CategoryId) {
  if (cat === "kapanis") return "İlgilenmiyor";
  if (categoryById(cat).needsReply) return "Dönüş var";
  return "Yazıldı";
}

export function WhatsAppPenceresi({ lead, onClose, onSent }: {
  lead: MesajLead;
  onClose: () => void;
  onSent: (updated: MesajLead, info: string) => void;
}) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [ad, setAd] = useState(() => { try { return localStorage.getItem(AD_KEY) ?? ""; } catch { return ""; } });
  const [numara, setNumara] = useState(isWhatsAppCapablePhone(lead.phone) ? lead.phone : "");
  const [link, setLink] = useState("");
  const [reply, setReply] = useState("");
  const [aiResult, setAiResult] = useState<DraftResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "ai" | RefineMode | "kayit">("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const [reload, setReload] = useState(0);
  const [basisTur, setBasisTur] = useState<BasisType>("acik_onay");
  const [basisKaynak, setBasisKaynak] = useState<BasisSource>("whatsapp_yazisma");
  const [basisNot, setBasisNot] = useState("");
  const [waKaynak, setWaKaynak] = useState<WhatsAppSource>("musteri_whatsapp_yazdi");
  const [waNot, setWaNot] = useState("");

  async function waIzniKaydet(revoke = false) {
    setError("");
    const r = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(revoke ? { whatsappOptInRevoke: { neden: "Operatör WhatsApp iznini geri çekti" } } : { whatsappOptIn: { kaynak: waKaynak, not: waNot } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error || "WhatsApp izni kaydedilemedi");
      return;
    }
    setInfo(revoke ? "WhatsApp izni geri çekildi; bu müşteriye WhatsApp’tan yazılmaz." : "WhatsApp izni kaydedildi (kim, ne zaman, hangi kaynak).");
    setReload((n) => n + 1);
  }

  async function dayanakKaydet(revoke = false) {
    setError("");
    const r = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(revoke ? { legalBasisRevoke: { neden: "Operatör dayanağı geri çekti" } } : { legalBasis: { tur: basisTur, kaynak: basisKaynak, not: basisNot } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error || "Dayanak kaydedilemedi");
      return;
    }
    setInfo(revoke ? "Dayanak geri çekildi; bu müşteriye satış mesajı gönderilmez." : "İletişim dayanağı kaydedildi (kim, ne zaman, hangi kaynak).");
    setReload((n) => n + 1);
  }

  useEffect(() => {
    let alive = true;
    fetch(`/api/leads/${lead.id}/mesaj`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Müşteri bilgisi alınamadı");
        return j as Boot;
      })
      .then((j) => { if (alive) setBoot(j); })
      .catch((e: Error) => { if (alive) setLoadError(e.message); });
    return () => { alive = false; };
  }, [lead.id, reload]);

  useEffect(() => {
    const kapat = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", kapat);
    return () => window.removeEventListener("keydown", kapat);
  }, [onClose]);

  const cat = category ?? boot?.category ?? "ilk_temas";
  const catInfo = categoryById(cat, boot?.ctx.vertical);

  // Operatörün girdileriyle güncellenmiş bağlam (link, ad, müşteri mesajı)
  const ctx = useMemo<CustomerContext | null>(() => {
    if (!boot) return null;
    return { ...boot.ctx, senderName: cleanExternal(ad, 30), designLink: cleanLink(link), customerReply: cleanExternal(reply, 800) };
  }, [boot, ad, link, reply]);

  const blockedForSales = Boolean(ctx?.optedOut && catInfo.sales);
  const result: DraftResult | null = useMemo(() => {
    if (!ctx || blockedForSales) return null;
    return aiResult ?? localResult(ctx, cat);
  }, [ctx, cat, aiResult, blockedForSales]);

  const index = selected ?? result?.recommended ?? 0;
  const draft: Draft | undefined = result?.drafts[index];
  const mesaj = edited ?? draft?.message ?? "";
  const quality = useMemo(() => (ctx && mesaj ? evaluateMessage(mesaj, ctx, cat) : null), [mesaj, ctx, cat]);
  const digits = waDigits(numara);
  const duplicate = boot?.recent.find((r) => r.category === cat);
  // Politika: ret, takip aralığı ve takip sınırı sunucuda da ayrıca uygulanır
  const policyBlock = !boot
    ? ""
    : cat === "kapanis"
      ? boot.kapanisAllowed ? "" : "Bu müşteriye kapanış mesajı zaten gönderildi."
      : !boot.policy.allowed
        ? boot.policy.reason
        : boot.policy.kind === "takip" && cat !== "takip"
          ? "Bu müşteriye daha önce yazıldı ve dönüş olmadı; ilk temas tekrar gönderilmez. “Nazik takip” türünü seçin."
          : "";
  const blockedQuality = Boolean(quality?.blockers.length) || Boolean(policyBlock);

  function resetDrafts() {
    setAiResult(null);
    setSelected(null);
    setEdited(null);
    setInfo("");
    setError("");
  }

  function body(extra: Record<string, unknown>) {
    return JSON.stringify({ category: cat, senderName: ad.trim(), designLink: link.trim(), customerReply: reply.trim(), ...extra });
  }

  async function aiUret() {
    setBusy("ai");
    setError("");
    try {
      const r = await fetch(`/api/leads/${lead.id}/mesaj`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body({ action: "generate" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Taslak üretilemedi");
      const res = j.result as DraftResult;
      setAiResult(res);
      setSelected(null);
      setEdited(null);
      setInfo(res.warnings.join(" "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Taslak üretilemedi");
    } finally {
      setBusy("");
    }
  }

  async function duzenle(mode: RefineMode) {
    if (!mesaj.trim()) return;
    setBusy(mode);
    setError("");
    try {
      const r = await fetch(`/api/leads/${lead.id}/mesaj`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body({ action: "refine", mode, style: draft?.style, message: mesaj }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Düzenlenemedi");
      const d = j.draft as Draft;
      setEdited(d.message);
      setInfo([d.reason, ...(j.warnings as string[])].filter(Boolean).join(" "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Düzenlenemedi");
    } finally {
      setBusy("");
    }
  }

  async function ac(masaustu: boolean) {
    if (!digits || !mesaj.trim() || !quality || quality.blockers.length) return;
    if (duplicate && !window.confirm(`Bu müşteriye son 24 saat içinde “${categoryById(duplicate.category).label}” mesajı açılmış. Yine de devam edilsin mi?`)) return;
    try { localStorage.setItem(AD_KEY, ad.trim()); } catch {}
    // Açık onay yoksa ret cümlesi kendiliğinden eklenir; sunucu da aynı metni kaydeder
    const gidecek = boot?.policy.retHakkiGerekli && catInfo.sales ? withOptOut(mesaj) : mesaj.trim();
    const metin = encodeURIComponent(gidecek);
    // Pencere tıklamayla hemen açılmalı (açılır pencere engeli); kayıt arkasından yapılır
    window.open(masaustu ? `whatsapp://send?phone=${digits}&text=${metin}` : `https://wa.me/${digits}?text=${metin}`, "_blank", "noopener");
    setBusy("kayit");
    try {
      const r = await fetch(`/api/leads/${lead.id}/mesaj`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body({ action: "record", style: edited !== null ? "elle" : draft?.style, message: gidecek, phone: numara }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Kayıt yapılamadı");
      onSent(j.lead as MesajLead, `WhatsApp açıldı; göndermek sende. Müşteri “${statusText(cat)}” olarak işaretlendi.`);
      onClose();
    } catch (e) {
      setError(`WhatsApp açıldı ama kayıt yapılamadı: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setBusy("");
    }
  }

  async function sablonKaydet() {
    if (!ctx || !mesaj.trim()) return;
    let govde = mesaj.trim();
    for (const n of [ctx.name, ctx.shortName]) if (n) govde = govde.split(n).join("{ad}");
    const r = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${catInfo.label} · ${draft?.label ?? "elle"}`.slice(0, 80), body: govde }),
    });
    setInfo(r.ok ? "Şablon olarak kaydedildi; işletme adı {ad} oldu." : "Şablon kaydedilemedi.");
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,.32)", zIndex: 80, display: "grid", placeItems: "center", padding: 16 }}
    >
      <div className="card" role="dialog" aria-label="WhatsApp’tan yaz" style={{ width: "min(760px, 100%)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="page-kicker">WhatsApp’tan yaz</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 21, letterSpacing: "-0.03em" }}>{lead.name}</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              {lead.phone ? formatPhoneDisplay(lead.phone) : "Telefon yok"}
              {ctx ? ` · ${ctx.sector.inferred ? ctx.sector.label : "sektör bilinmiyor"}${ctx.location ? ` · ${ctx.location}` : ""}` : ""}
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Kapat</button>
        </div>

        {loadError ? <p className="error-box" style={{ margin: 0 }}>{loadError}</p> : null}
        {!boot && !loadError ? <div className="skel" style={{ height: 220 }} /> : null}

        {ctx ? (
          <>
            {!isWhatsAppCapablePhone(lead.phone) ? (
              <p className="notice" style={{ margin: 0 }}>Bu numara sabit hat, WhatsApp’ı yok. İşletmenin cep numarasını biliyorsan aşağıya yaz.</p>
            ) : null}
            {boot ? (
              <details className="key-block">
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>İzin kayıtları · isteğe bağlı, yalnızca otomatik gönderim için</summary>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>İletişim dayanağı: {legalLabel(boot.legal)}</strong>
                  {boot.legal.durum === "var" ? (
                    <button type="button" className="btn btn-ghost" style={{ minHeight: 30, fontSize: 12.5 }} onClick={() => void dayanakKaydet(true)}>Geri çek</button>
                  ) : null}
                </div>
                {boot.legal.zaman ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {boot.legal.kaynak ? `${BASIS_SOURCES.find((s) => s.id === boot.legal.kaynak)?.label ?? boot.legal.kaynak} · ` : ""}
                    {new Date(boot.legal.zaman).toLocaleString("tr-TR")}{boot.legal.kaydeden ? ` · ${boot.legal.kaydeden}` : ""}
                    {boot.legal.not ? ` · ${boot.legal.not}` : ""}
                  </div>
                ) : null}
                {boot.legal.durum !== "var" && !ctx.optedOut ? (
                  <>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      Müşteri açıkça onay verdiyse kaydet; böylece otomatik gönderim açılır ve ret cümlesi eklenmez.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                      <select value={basisTur} onChange={(e) => { const t = e.target.value as BasisType; setBasisTur(t); setBasisKaynak(t === "tacir_esnaf" ? "operator_beyani" : "whatsapp_yazisma"); }} style={{ width: "100%" }}>
                        {BASIS_TYPES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                      <select value={basisKaynak} onChange={(e) => setBasisKaynak(e.target.value as BasisSource)} style={{ width: "100%" }}>
                        {BASIS_SOURCES.filter((s) => (basisTur === "tacir_esnaf" ? s.id === "operator_beyani" : s.id !== "operator_beyani")).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <input value={basisNot} onChange={(e) => setBasisNot(e.target.value)} placeholder="Not / kanıt (ör. yazışma tarihi)" />
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => void dayanakKaydet()}>Dayanağı kaydet</button>
                  </>
                ) : null}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                  <strong style={{ fontSize: 13 }}>{whatsappLabel(boot.whatsapp)}</strong>
                  {boot.whatsapp.durum === "var" ? (
                    <button type="button" className="btn btn-ghost" style={{ minHeight: 30, fontSize: 12.5 }} onClick={() => void waIzniKaydet(true)}>Geri çek</button>
                  ) : null}
                </div>
                {boot.whatsapp.zaman ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    {boot.whatsapp.kaynak ? `${WHATSAPP_SOURCES.find((s) => s.id === boot.whatsapp.kaynak)?.label ?? boot.whatsapp.kaynak} · ` : ""}
                    {new Date(boot.whatsapp.zaman).toLocaleString("tr-TR")}{boot.whatsapp.kaydeden ? ` · ${boot.whatsapp.kaydeden}` : ""}
                  </div>
                ) : null}
                {boot.whatsapp.durum !== "var" && !ctx.optedOut ? (
                  <>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      Otomatik gönderim için müşterinin WhatsApp’ı kabul ettiğini kaydet. Elle göndermek için gerekmez.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                      <select value={waKaynak} onChange={(e) => setWaKaynak(e.target.value as WhatsAppSource)} style={{ width: "100%" }}>
                        {WHATSAPP_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <input value={waNot} onChange={(e) => setWaNot(e.target.value)} placeholder="Not / kanıt (ör. mesaj tarihi)" />
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => void waIzniKaydet()}>WhatsApp iznini kaydet</button>
                  </>
                ) : null}
                </div>
              </details>
            ) : null}
            {boot?.policy.retHakkiGerekli && catInfo.sales ? (
              <div className="muted" style={{ fontSize: 12 }}>Mesajın sonuna “{OPT_OUT_LINE}” cümlesi kendiliğinden eklenir.</div>
            ) : null}
            {ctx.optedOut ? (
              <p className="error-box" style={{ margin: 0 }}>Bu müşteri iletişim istemediğini belirtmiş. Satış mesajı hazırlanmaz; yalnızca kapanış mesajı gönderebilirsin.</p>
            ) : null}
            {policyBlock && !ctx.optedOut ? <p className="error-box" style={{ margin: 0 }}>{policyBlock}</p> : null}
            {boot?.policy.warnings.map((w) => <p key={w} className="notice" style={{ margin: 0 }}>{w}</p>)}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <label className="field">
                <span>Mesaj türü</span>
                <select value={cat} onChange={(e) => { setCategory(e.target.value as CategoryId); resetDrafts(); }} style={{ width: "100%" }}>
                  {categoriesFor(ctx.vertical).map((c) => (
                    <option key={c.id} value={c.id} disabled={ctx.optedOut && c.sales}>{c.label}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Adın (mesajda)</span><input value={ad} onChange={(e) => { setAd(e.target.value); resetDrafts(); }} placeholder="Örn. Mehmet" /></label>
              <label className="field"><span>WhatsApp numarası</span><input value={numara} onChange={(e) => setNumara(e.target.value)} placeholder="05xx xxx xx xx" /></label>
            </div>

            {cat === "ilk_temas" ? (
              <label className="field">
                <span>Tasarım linki (yalnızca bu işletme için gerçekten hazırladıysan)</span>
                <input value={link} onChange={(e) => { setLink(e.target.value); resetDrafts(); }} placeholder="https://… (yoksa boş bırak)" />
              </label>
            ) : null}
            {catInfo.needsReply ? (
              <label className="field">
                <span>Müşterinin yazdığı mesaj</span>
                <textarea value={reply} onChange={(e) => { setReply(e.target.value); resetDrafts(); }} placeholder="Müşterinin son mesajını buraya yapıştır" style={{ minHeight: 64 }} />
              </label>
            ) : null}

            {result ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
                {result.drafts.map((d, i) => (
                  <button
                    key={`${d.style}-${i}`}
                    type="button"
                    onClick={() => { setSelected(i); setEdited(null); }}
                    className="key-block"
                    style={{ textAlign: "left", cursor: "pointer", outline: i === index ? "2px solid var(--teal)" : undefined, display: "grid", gap: 6 }}
                  >
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                      <strong style={{ fontSize: 12.5 }}>{d.label}{i === result.recommended ? " · önerilen" : ""}</strong>
                      <span className={`pill ${scoreTone(d.qualityScore, d.blockers.length > 0)}`}>{d.qualityScore}</span>
                    </span>
                    <span className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{d.message.slice(0, 110)}{d.message.length > 110 ? "…" : ""}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {!blockedForSales ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-wexon"
                  disabled={!boot?.hasLlm || Boolean(busy)}
                  title={boot?.hasLlm ? "Müşteri bilgisine göre 3 yeni taslak yazar" : "Ayarlar’a Gemini anahtarı ekleyince açılır"}
                  onClick={() => void aiUret()}
                >
                  {busy === "ai" ? "Yazıyor…" : "AI ile 3 alternatif üret"}
                </button>
                {REFINE_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chip"
                    style={{ opacity: Boolean(busy) || !mesaj.trim() || (!boot?.hasLlm && m.id !== "kisa") ? 0.45 : 1 }}
                    disabled={Boolean(busy) || !mesaj.trim() || (!boot?.hasLlm && m.id !== "kisa")}
                    title={!boot?.hasLlm && m.id !== "kisa" ? "Ayarlar’a Gemini anahtarı ekleyince açılır" : undefined}
                    onClick={() => void duzenle(m.id)}
                  >
                    {busy === m.id ? "…" : m.label}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="field">
              <span>Gönderilecek mesaj (son önizleme, istediğin gibi düzelt)</span>
              <textarea value={mesaj} onChange={(e) => setEdited(e.target.value)} style={{ minHeight: 140 }} />
            </label>

            {quality ? (
              <div className="key-block" style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className={`pill ${scoreTone(quality.score, blockedQuality)}`}>Kalite {quality.score}/100</span>
                  <span className="muted" style={{ fontSize: 12 }}>{quality.words} kelime · hedef {catInfo.words[0]}-{catInfo.words[1]}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {edited !== null ? "Düzenlendi" : draft?.source === "ai" ? "AI taslağı" : "Kayıtlı bilgiyle hazırlandı"}
                  </span>
                </div>
                {quality.blockers.map((b) => <div key={b} className="error-box" style={{ margin: 0, fontSize: 13 }}>{b}</div>)}
                {quality.warnings.map((w) => <div key={w} className="notice" style={{ margin: 0, fontSize: 13 }}>{w}</div>)}
                {quality.reasons.length ? (
                  <div className="muted" style={{ fontSize: 12.5 }}>Puanı düşürenler: {quality.reasons.join(" · ")}</div>
                ) : null}
                {draft?.reason && edited === null ? <div style={{ fontSize: 12.5 }}><strong>Neden bu taslak:</strong> {draft.reason}</div> : null}
                <details>
                  <summary className="muted" style={{ fontSize: 12.5, cursor: "pointer" }}>Kullanılan müşteri bilgisi</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
                    {contextSummary(ctx).map((f) => <li key={f}>{f}</li>)}
                    {ctx.unknowns.map((u) => <li key={u} className="muted">{u}</li>)}
                  </ul>
                </details>
                <div className="muted" style={{ fontSize: 11.5 }}>Bu puan sistemin kendi metin değerlendirmesidir; cevap ya da satış oranı değildir.</div>
              </div>
            ) : null}

            {error ? <p className="error-box" style={{ margin: 0 }}>{error}</p> : null}
            {info ? <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{info}</p> : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" className="btn btn-mint" style={{ minHeight: 48, flex: "1 1 220px" }} disabled={!digits || !mesaj.trim() || blockedQuality || busy === "kayit"} onClick={() => void ac(false)}>
                WhatsApp’ta aç
              </button>
              <button type="button" className="btn btn-ghost" disabled={!digits || !mesaj.trim() || blockedQuality} onClick={() => void ac(true)} title="Bilgisayardaki WhatsApp uygulamasında açar">
                Masaüstü WhatsApp
              </button>
              <button type="button" className="btn btn-ghost" disabled={!mesaj.trim()} onClick={() => { void navigator.clipboard.writeText(mesaj); setInfo("Mesaj kopyalandı."); }}>Kopyala</button>
              <button type="button" className="btn btn-ghost" disabled={!mesaj.trim() || blockedQuality} onClick={() => void sablonKaydet()}>Şablon olarak kaydet</button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              {blockedQuality
                ? "Kırmızı uyarı düzelmeden mesaj açılmaz."
                : digits
                  ? "WhatsApp mesaj yazılmış halde açılır; göndermek ve konuşmak sende. Hiçbir mesaj kendiliğinden gönderilmez."
                  : "Geçerli bir cep numarası gerekli."}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
