"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { renderTemplate } from "@/lib/templates";
import { ChipStrip } from "@/components/ChipStrip";
import { ConnectGuide } from "@/components/ConnectGuide";
import { useToast } from "@/components/Toast";
import { MesajSonuclari } from "./MesajSonuclari";

type CopyAngle = { id: string; label: string };
type Template = { id: string; name: string; body: string };
type WaInfo = {
  cloud: boolean;
  serverless?: boolean;
  webQr?: boolean;
  local: { state: string; qrDataUrl: string | null; error: string | null };
};

const SAMPLE = {
  name: "Moda Restoran",
  address: "Caferağa",
  district: "Kadıköy",
  city: "İstanbul",
  phone: "+905321112233",
};

function statusLabel(state: string) {
  if (state === "ready") return "WhatsApp Web bağlı";
  if (state === "qr") return "QR bekleniyor";
  if (state === "starting") return "QR hazırlanıyor";
  if (state === "error") return "Bağlantı hatası";
  return "Bağlı değil";
}

export default function OutreachPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [angles, setAngles] = useState<CopyAngle[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [angle, setAngle] = useState("");
  const [wa, setWa] = useState<WaInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [brief, setBrief] = useState("");
  const [hasLlm, setHasLlm] = useState(false);
  const [playbookActive, setPlaybookActive] = useState(false);
  const [copySource, setCopySource] = useState<"ai" | "local">("local");
  const seeded = useRef(false);

  async function refresh() {
    const [t, w, c] = await Promise.all([
      fetch("/api/templates").then((r) => r.json()),
      fetch("/api/whatsapp").then((r) => r.json()),
      fetch("/api/copy").then((r) => r.json()).catch(() => ({ hasLlm: false })),
    ]);
    setTemplates(t);
    if (!seeded.current && Array.isArray(t) && t[0]) {
      setName(t[0].name);
      setBody(t[0].body);
      seeded.current = true;
    }
    setWa(w);
    setHasLlm(Boolean(c?.hasLlm));
    setPlaybookActive(Boolean(c?.playbookActive));
    if (Array.isArray(c?.angles)) setAngles(c.angles);
    if (!angle && typeof c?.defaultAngle === "string") setAngle(c.defaultAngle);
    setLoading(false);
    if (w?.local?.state === "ready" || w?.local?.state === "error") setConnecting(false);
  }

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void refresh().catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
    }, 0);
    const live = wa?.local.state === "starting" || wa?.local.state === "qr" || connecting;
    const t = window.setInterval(() => void refresh(), live ? 1500 : 4000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(t);
    };
  }, [wa?.local.state, connecting]);

  async function applyAngle(next: string) {
    setAngle(next);
    setCopyBusy(true);
    try {
      const res = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle: next, brief }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Metin üretilemedi");
      setName(json.name);
      setBody(json.body);
      setCopySource(json.source === "ai" ? "ai" : "local");
      if (json.warning) toast.push(json.warning, "bad");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Metin üretilemedi", "bad");
    } finally {
      setCopyBusy(false);
    }
  }

  async function saveTemplate() {
    setError("");
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, body }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Şablon kaydedilemedi");
      toast.push("Şablon kaydedilemedi", "bad");
      return;
    }
    toast.push("Şablon kaydedildi");
    await refresh();
  }

  async function deleteTemplate(id: string, event: MouseEvent) {
    event.stopPropagation();
    if (templates.length <= 1) {
      toast.push("En az bir şablon kalmalı", "bad");
      return;
    }
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push(json.error || "Şablon silinemedi", "bad");
      return;
    }
    if (name && templates.find((t) => t.id === id)?.name === name) {
      setName("");
      setBody("");
    }
    toast.push("Şablon silindi");
    await refresh();
  }

  async function connectQr() {
    setError("");
    setConnecting(true);
    toast.push("QR çıkınca hemen okutun. Bu sekmeyi kapatmayın.");
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "QR başlatılamadı");
        toast.push("QR başlatılamadı", "bad");
        return;
      }
      setWa(json);
      if (json.local?.state === "error") {
        toast.push(json.local.error || "Bağlanamadı", "bad");
      } else if (json.local?.state === "ready") {
        toast.push("WhatsApp bağlı");
      } else if (json.local?.state === "qr") {
        toast.push("QR süresi doldu, tekrar açın", "bad");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR başlatılamadı");
      toast.push("QR bağlantısı koptu, tekrar deneyin", "bad");
    } finally {
      setConnecting(false);
      await refresh();
    }
  }

  async function disconnect() {
    await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    setConnecting(false);
    await refresh();
  }

  const connected = wa?.cloud || wa?.local.state === "ready";
  const preview = useMemo(() => renderTemplate(body, SAMPLE), [body]);
  const localState = wa?.local.state ?? "disconnected";

  return (
    <div>
      <div className="page-kicker">WhatsApp</div>
      <h1 className="page-title">Mesaj şablonları ve bağlantı</h1>
      <p className="page-copy">
        Toplu gönderimde kullanılacak şablonu hazırlayıp kaydedin. Hiçbir mesaj siz onaylamadan kuyruktan çıkmaz.
        {wa?.serverless
          ? " Canlı gönderim için WhatsApp Cloud API kullanılır."
          : " Yerel kurulumda WhatsApp Business'ı QR ile bağlayabilirsiniz."}
      </p>

      <div className="notice" style={{ marginTop: 16 }}>
        {wa?.serverless
          ? "Uygulama bulutta çalıştığı için QR ile bağlantı kullanılamaz. Otomatik gönderim için Ayarlar’a bu profilin WhatsApp Cloud bilgilerini (erişim anahtarı ve telefon numarası kimliği) girin. Tek tek yazmak için Müşteriler ekranındaki “WhatsApp’tan yaz” düğmesi her zaman çalışır."
          : "“QR oturumu aç”a basın. Kod görünür görünmez WhatsApp Business → Ayarlar → Cihazlar → Cihaz bağla ile okutun."}
      </div>

      {error ? <p className="error-box" style={{ marginTop: 14 }}>{error}</p> : null}

      {loading ? (
        <div className="split" style={{ marginTop: 18 }}>
          <div className="card panel"><div className="skel" style={{ height: 220 }} /></div>
          <div className="card panel"><div className="skel" style={{ height: 220 }} /></div>
        </div>
      ) : (
        <div className="split" style={{ marginTop: 18 }}>
          <section className="card panel">
            <div className="panel-head">
              <div>
                <div className="page-kicker">Satış asistanı</div>
                <h2>Mesaj şablonu</h2>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {playbookActive ? <span className="pill ok">Marka kuralları açık</span> : null}
                <span className={`pill ${copySource === "ai" ? "ok" : "mute"}`}>
                  {copyBusy ? "Yazıyor…" : copySource === "ai" ? "Yapay zekâ" : "Hazır metin"}
                </span>
              </div>
            </div>
            <p className="panel-note">
              Bir konu seçin ya da yapay zekâya not yazın. {`{ad}`} ve {`{ilçe}`} gönderimde işletmenin bilgisiyle dolar.
              {hasLlm ? " Metni Gemini yazar." : " Yapay zekâ için Ayarlar’a Gemini anahtarı girin."}
              {playbookActive ? " Marka kurallarınız uygulanır." : ""}
            </p>
            <div className="field">
              <span>Konu</span>
              <ChipStrip>
                {angles.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`chip${angle === a.id ? " on" : ""}`}
                    disabled={copyBusy}
                    onClick={() => void applyAngle(a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </ChipStrip>
            </div>
            <label className="field" style={{ marginTop: 14 }}>
              <span>Yapay zekâya not (isteğe bağlı)</span>
              <input
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="ör. otel mutfağı, 2 cümle, samimi"
              />
            </label>
            <label className="field" style={{ marginTop: 14 }}>
              <span>Ad</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              <span>Metin</span>
              <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <div className="key-block" style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Önizleme · {SAMPLE.name}
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5 }}>{preview}</p>
            </div>
            <div className="save-row">
              <button className="btn btn-wexon" type="button" onClick={() => void saveTemplate()}>
                Şablonu kaydet
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={copyBusy}
                onClick={() => void applyAngle(angle)}
              >
                {copyBusy ? "Yazıyor…" : hasLlm ? "AI ile yaz" : "Hazır metni getir"}
              </button>
            </div>
            <div className="key-stack" style={{ marginTop: 14 }}>
              {templates.map((t) => (
                <div key={t.id} className="key-block" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <button
                    type="button"
                    style={{ textAlign: "left", cursor: "pointer", flex: 1, background: "none", border: 0, padding: 0 }}
                    onClick={() => {
                      setName(t.name);
                      setBody(t.body);
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>{t.name}</strong>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {t.body.slice(0, 90)}{t.body.length > 90 ? "…" : ""}
                    </div>
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={(e) => void deleteTemplate(t.id, e)}
                  >
                    Sil
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="card panel">
            <div className="panel-head">
              <div>
                <div className="page-kicker">Bağlantı</div>
                <h2>WhatsApp</h2>
              </div>
              <span className={`pill ${connected ? "ok" : localState === "error" ? "bad" : "warn"}`}>
                {wa?.cloud ? "Cloud" : statusLabel(localState)}
              </span>
            </div>
            <p style={{ margin: 0, fontWeight: 700 }}>
              <span className={`dot${connected ? "" : localState === "error" ? " bad" : " warn"}`} />
              {wa?.cloud
                ? "Cloud API asıl kanal — onay sonrası Cloud gider."
                : statusLabel(localState)}
            </p>
            <p className="panel-note" style={{ marginTop: 8 }}>
              {wa?.serverless
                ? "Cloud API Meta'nın resmi canlı bağlantısıdır."
                : "WhatsApp Business uygulaması bağlı cihaz kabul eder."}
            </p>
            {wa?.local.error ? <p className="error-box">{wa.local.error}</p> : null}
            {wa?.local.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={wa.local.qrDataUrl}
                alt="WhatsApp QR"
                width={240}
                height={240}
                style={{ marginTop: 12, background: "white", padding: 10, borderRadius: 16, border: "1px solid var(--line)" }}
              />
            ) : null}
            {localState === "qr" || connecting ? (
              <p className="panel-note" style={{ marginTop: 10 }}>
                QR görünür görünmez okutun. Kod yaklaşık her dakika yenilenir; eski kodu okutmayın. Yeşil olana kadar bu sekmeyi kapatmayın.
              </p>
            ) : null}
            <div className="save-row">
              <button
                className="btn btn-wexon"
                type="button"
                disabled={connected || connecting || wa?.webQr === false}
                onClick={() => void connectQr()}
              >
                {wa?.webQr === false
                  ? "Cloud API gerekli"
                  : connecting || localState === "starting"
                  ? "QR bekleniyor"
                  : localState === "qr"
                    ? "QR yenile"
                    : "QR oturumu aç"}
              </button>
              {localState !== "disconnected" && !wa?.cloud ? (
                <button className="btn btn-ghost" type="button" onClick={() => void disconnect()}>
                  Kes
                </button>
              ) : null}
            </div>
          </section>
        </div>
      )}

      <MesajSonuclari />

      <div style={{ marginTop: 18 }}>
        <ConnectGuide
          kicker="WhatsApp Business"
          title={wa?.serverless ? "Cloud API ile bağla" : "QR ile bağla"}
          steps={wa?.serverless ? [
            {
              title: "Meta Business hazırlığı",
              body: "WhatsApp Business Platform'da işletme numaranızı ekleyin ve telefon doğrulamasını tamamlayın.",
            },
            {
              title: "Kalıcı token alın",
              body: "Meta Business Settings'te sistem kullanıcısına WhatsApp yetkisi verip kalıcı erişim token'ı oluşturun.",
            },
            {
              title: "Phone number ID'yi kopyalayın",
              body: "Numaranın kendisini değil, WhatsApp API Setup ekranındaki Phone number ID değerini alın.",
            },
            {
              title: "Sistem'e kaydedin",
              body: "Cloud token ve Phone number ID'yi Ayarlar ekranına yazın. Bağlantı rozeti Cloud olunca onay kuyruğu canlı gönderime hazırdır.",
            },
          ] : [
            {
              title: "Bu sitede QR aç",
              body: "Mesaj ekranında “QR oturumu aç”a basın. Kod bu sayfada çıkar; localhost veya ayrı bir PC oturumu gerekmez.",
            },
            {
              title: "Telefonda WhatsApp Business",
              body: "Yeşil WhatsApp Business uygulaması → Ayarlar → Cihazlar → Cihaz bağla. Ekrandaki QR’ı okutun. Normal WhatsApp da aynı menüden bağlanır; ikisini aynı anda karıştırmayın.",
            },
            {
              title: "Oturum canlıda kalır",
              body: "Bağlandıktan sonra oturum bu işletmenin kaydına yazılır. Gönderim onay kuyruğundan çıkar; rastgele spam yok. Kes’e basınca kanal düşer.",
            },
            {
              title: "Canlı yayın için Cloud",
              body: "Bulutta çalışan sürümde QR yerine WhatsApp Cloud bağlantısı kullanılır.",
            },
          ]}
        />
      </div>
    </div>
  );
}
