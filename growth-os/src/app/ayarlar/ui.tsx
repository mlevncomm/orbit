"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ChipStrip } from "@/components/ChipStrip";
import { ConnectGuide } from "@/components/ConnectGuide";
import { useToast } from "@/components/Toast";
import { DEFAULT_LLM, LLM_PROVIDERS, normalizeLlmConfig } from "@/lib/llm-providers";

type Settings = {
  googlePlacesApiKey: string;
  waCloudToken: string;
  waPhoneNumberId: string;
  campaignMediaEnabled: boolean;
  campaignMediaType: string;
  campaignMediaUrl: string;
  campaignMediaId: string;
  campaignMediaName: string;
  delayMinSec: number;
  delayMaxSec: number;
  dailyCap: number;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmProvider: string;
  igAccessToken: string;
  igUserId: string;
  igWebhookVerifyToken: string;
  hasPlacesKey: boolean;
  hasCloudToken: boolean;
  hasLlmKey: boolean;
  hasIgToken: boolean;
  hasIgUserId: boolean;
  hosted?: boolean;
  appUrl?: string;
  instagramWebhookUrl?: string;
  postgres?: boolean;
  authConfigured?: boolean;
};

type SettingsForm = Pick<
  Settings,
  | "googlePlacesApiKey"
  | "waCloudToken"
  | "waPhoneNumberId"
  | "campaignMediaEnabled"
  | "campaignMediaType"
  | "campaignMediaUrl"
  | "delayMinSec"
  | "delayMaxSec"
  | "dailyCap"
  | "llmApiKey"
  | "llmBaseUrl"
  | "llmModel"
  | "llmProvider"
  | "igAccessToken"
  | "igUserId"
  | "igWebhookVerifyToken"
>;

export default function AyarlarPage() {
  const toast = useToast();
  const [form, setForm] = useState<SettingsForm>({
    googlePlacesApiKey: "",
    waCloudToken: "",
    waPhoneNumberId: "",
    campaignMediaEnabled: false,
    campaignMediaType: "",
    campaignMediaUrl: "",
    delayMinSec: 20,
    delayMaxSec: 45,
    dailyCap: 40,
    llmApiKey: "",
    llmBaseUrl: DEFAULT_LLM.baseUrl,
    llmModel: DEFAULT_LLM.model,
    llmProvider: DEFAULT_LLM.id,
    igAccessToken: "",
    igUserId: "",
    igWebhookVerifyToken: "",
  });
  const [flags, setFlags] = useState({
    hasPlacesKey: false,
    hasCloudToken: false,
    hasLlmKey: false,
    hasIgToken: false,
    hasIgUserId: false,
  });
  const [deploy, setDeploy] = useState({
    hosted: false,
    appUrl: "http://127.0.0.1:3000",
    instagramWebhookUrl: "http://127.0.0.1:3000/api/instagram/webhook",
    postgres: false,
    authConfigured: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmCheck, setLlmCheck] = useState<"idle" | "ok" | "bad">("idle");
  const [llmCheckMsg, setLlmCheckMsg] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaName, setMediaName] = useState("");
  const [hasMediaId, setHasMediaId] = useState(false);
  const [mediaProgress, setMediaProgress] = useState(0);
  const [ortak, setOrtak] = useState<string | null>(null);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((s: Settings) => {
          const llm = normalizeLlmConfig({
            llmApiKey: s.llmApiKey ?? "",
            llmBaseUrl: s.llmBaseUrl,
            llmModel: s.llmModel,
            llmProvider: s.llmProvider,
          });
          setForm({
            googlePlacesApiKey: s.googlePlacesApiKey,
            waCloudToken: s.waCloudToken,
            waPhoneNumberId: s.waPhoneNumberId,
            campaignMediaEnabled: Boolean(s.campaignMediaEnabled),
            campaignMediaType: s.campaignMediaType ?? "",
            campaignMediaUrl: s.campaignMediaUrl ?? "",
            delayMinSec: s.delayMinSec,
            delayMaxSec: s.delayMaxSec,
            dailyCap: s.dailyCap,
            ...llm,
            igAccessToken: s.igAccessToken ?? "",
            igUserId: s.igUserId ?? "",
            igWebhookVerifyToken: s.igWebhookVerifyToken ?? "",
          });
          setFlags({
            hasPlacesKey: s.hasPlacesKey,
            hasCloudToken: s.hasCloudToken,
            hasLlmKey: s.hasLlmKey,
            hasIgToken: s.hasIgToken,
            hasIgUserId: s.hasIgUserId,
          });
          setOrtak((s as Settings & { ortakAnahtar?: string | null }).ortakAnahtar ?? null);
          setMediaName(s.campaignMediaName ?? "");
          setHasMediaId(Boolean(s.campaignMediaId));
          setDeploy({
            hosted: Boolean(s.hosted),
            appUrl: s.appUrl || "http://127.0.0.1:3000",
            instagramWebhookUrl: s.instagramWebhookUrl || "",
            postgres: Boolean(s.postgres),
            authConfigured: Boolean(s.authConfigured),
          });
          setLoading(false);
        })
        .catch(() => {
          setError("Ayarlar okunamadı");
          setLoading(false);
        });
    }, 0);
    return () => window.clearTimeout(boot);
  }, []);

  function applyProvider(id: string) {
    const preset = LLM_PROVIDERS.find((p) => p.id === id);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      llmProvider: preset.id,
      llmBaseUrl: preset.baseUrl,
      llmModel: preset.model,
    }));
  }

  async function save() {
    setError("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Kaydedilemedi");
      toast.push("Ayarlar kaydedilemedi", "bad");
      return false;
    }
    toast.push("Ayarlar kaydedildi");
    setFlags({
      hasPlacesKey: json.hasPlacesKey,
      hasCloudToken: json.hasCloudToken,
      hasLlmKey: json.hasLlmKey,
      hasIgToken: json.hasIgToken,
      hasIgUserId: json.hasIgUserId,
    });
    if (typeof json.llmApiKey === "string") {
      setForm((prev) => ({ ...prev, llmApiKey: json.llmApiKey }));
    }
    if (typeof json.igAccessToken === "string") {
      setForm((prev) => ({ ...prev, igAccessToken: json.igAccessToken }));
    }
    if (typeof json.igWebhookVerifyToken === "string") {
      setForm((prev) => ({ ...prev, igWebhookVerifyToken: json.igWebhookVerifyToken }));
    }
    return true;
  }

  async function uploadCampaignMedia(file: File) {
    const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "";
    if (!type) {
      toast.push("Yalnızca görsel veya video seçin", "bad");
      return;
    }
    const max = 60 * 1024 * 1024;
    if (file.size > max) {
      toast.push(`Dosya en fazla ${max / 1024 / 1024} MB olabilir`, "bad");
      return;
    }
    setMediaBusy(true);
    setMediaProgress(0);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (type === "video" ? "mp4" : "jpg");
      const blob = await upload(`campaign/ilk-mesaj.${extension}`, file, {
        access: "public",
        handleUploadUrl: "/api/campaign-media",
        multipart: file.size > 10 * 1024 * 1024,
        clientPayload: JSON.stringify({ type, name: file.name }),
        onUploadProgress: ({ percentage }) => setMediaProgress(Math.round(percentage)),
      });
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignMediaEnabled: true,
          campaignMediaType: type,
          campaignMediaUrl: blob.url,
          campaignMediaName: type === "video" ? "Kampanya videosu" : "Kampanya görseli",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Medya ayarı kaydedilemedi");
      setForm((prev) => ({
        ...prev,
        campaignMediaEnabled: true,
        campaignMediaType: type,
        campaignMediaUrl: blob.url,
      }));
      setMediaName(type === "video" ? "Kampanya videosu" : "Kampanya görseli");
      setHasMediaId(false);
      setMediaProgress(100);
      toast.push("Kampanya medyası kaydedildi");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Medya yüklenemedi", "bad");
    } finally {
      setMediaBusy(false);
    }
  }

  async function clearCampaignMedia() {
    setMediaBusy(true);
    try {
      const res = await fetch("/api/campaign-media", { method: "DELETE" });
      if (!res.ok) throw new Error("Medya kaldırılamadı");
      setForm((prev) => ({
        ...prev,
        campaignMediaEnabled: false,
        campaignMediaType: "",
        campaignMediaUrl: "",
      }));
      setMediaName("");
      setHasMediaId(false);
      toast.push("Kampanya medyası kaldırıldı");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Medya kaldırılamadı", "bad");
    } finally {
      setMediaBusy(false);
    }
  }

  async function testLlm() {
    setLlmBusy(true);
    setLlmCheck("idle");
    setLlmCheckMsg("");
    try {
      const saved = await save();
      if (!saved) return;
      const res = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ping: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gemini yanıt vermedi");
      setLlmCheck("ok");
      setLlmCheckMsg("Gemini bağlandı. Mesaj asistanı ve şablonlar bu anahtarı kullanır.");
      toast.push("Gemini çalışıyor");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gemini bağlanamadı";
      setLlmCheck("bad");
      setLlmCheckMsg(message);
      toast.push(message, "bad");
    } finally {
      setLlmBusy(false);
    }
  }

  const provider = LLM_PROVIDERS.find((p) => p.id === form.llmProvider) ?? LLM_PROVIDERS[0];

  return (
    <div>
      <div className="page-kicker">Sistem</div>
      <h1 className="page-title">Bağlantılar ve gönderim</h1>
      <p className="page-copy">
        WhatsApp bağlantısı ve gönderim ayarları her profilde ayrıdır. Google ve Gemini anahtarları Wexon.dev ile Aquails arasında ortaktır. Maskeli bir alanı değiştirmezseniz kayıtlı değer korunur.
      </p>

      {error ? <p className="error-box" style={{ marginTop: 16 }}>{error}</p> : null}

      {loading ? (
        <div className="settings-grid">
          <div className="card panel"><div className="skel" style={{ height: 280 }} /></div>
          <div className="card panel"><div className="skel" style={{ height: 220 }} /></div>
        </div>
      ) : (
        <>
        <div style={{ marginBottom: 14 }}>
          <ConnectGuide
            id="anahtar-kilavuzu"
            kicker="Kılavuz"
            title="Kendi anahtarınızı alın"
            note="Gemini ve Google Places anahtarları Google hesabınızdan, WhatsApp Cloud bilgileri Meta hesabınızdan alınır. Google anahtarları Wexon.dev ve Aquails’te ortak kullanılır; WhatsApp her profil için ayrı girilir."
            steps={[
              {
                title: "Google Gemini (mesaj asistanı)",
                body: "Google hesabıyla AI Studio’ya girin. Create API key → anahtarı kopyalayın (AIza…). Bu sayfada Google Gemini alanına yapıştırıp kaydedin, sonra Kontrol et’e basın. Kart istemez; ücretsiz kota vardır.",
                href: "https://aistudio.google.com/apikey",
                linkLabel: "AI Studio’da anahtar al",
              },
              {
                title: "Google Places (Keşif)",
                body: "Google Cloud Console’da proje açın. Places API (New) ve Places API’yi etkinleştirin. Credentials → API key. AIza… anahtarını yukarıdaki Google Places alanına yazın. Anahtar yetmez: iki API de açık olmalı.",
                href: "https://console.cloud.google.com/apis/library/places.googleapis.com",
                linkLabel: "Places API’yi aç",
              },
              {
                title: "WhatsApp Cloud (canlı gönderim)",
                body: "Meta Business’ta kendi şirket sayfanız ve WhatsApp Business Platform (Cloud API) gerekir. Sistem kullanıcısından kalıcı token + Phone number ID (numaranın kendisi değil) alın. Bu hesaba özeldir; Vercel’de QR çalışmaz.",
                href: "https://business.facebook.com",
                linkLabel: "Meta Business’ı aç",
              },
            ]}
          />
        </div>
        <div className="settings-grid">
          <section className="card panel">
            <div className="panel-head">
              <div>
                <div className="page-kicker">Bağlantı</div>
                <h2>API anahtarları</h2>
              </div>
            </div>
            <p className="panel-note">
              Places keşif için zorunlu. Anahtar yetmez: Google Cloud’da Places API (New) ve Places API’yi açın. WhatsApp Cloud canlıda zorunlu; yerelde yoksa QR yedek kalır.
            </p>
            <div className="key-stack">
              <div className="key-block">
                <label className="field">
                  <span>
                    Google Places
                    <span className={`pill ${flags.hasPlacesKey ? "ok" : "warn"}`}>
                      {flags.hasPlacesKey ? "Kayıtlı" : "Eksik"}
                    </span>
                  </span>
                  <input
                    value={form.googlePlacesApiKey}
                    onChange={(e) => setForm({ ...form, googlePlacesApiKey: e.target.value })}
                    placeholder="AIza..."
                    autoComplete="off"
                    readOnly={Boolean(ortak)}
                  />
                </label>
                {ortak ? <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Bu profil Google Places anahtarını {ortak} ile ortak kullanır; değiştirmek için {ortak} profilini açın.</div> : null}
              </div>
              <div className="key-block">
                <label className="field">
                  <span>
                    WhatsApp Cloud token
                    <span className={`pill ${flags.hasCloudToken ? "ok" : deploy.hosted ? "warn" : "mute"}`}>
                      {flags.hasCloudToken ? "Kayıtlı" : deploy.hosted ? "Canlıda zorunlu" : "İsteğe bağlı"}
                    </span>
                  </span>
                  <input
                    value={form.waCloudToken}
                    onChange={(e) => setForm({ ...form, waCloudToken: e.target.value })}
                    placeholder="Boş bırakılırsa QR"
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="key-block">
                <label className="field">
                  <span>WhatsApp phone number ID</span>
                  <input
                    value={form.waPhoneNumberId}
                    onChange={(e) => setForm({ ...form, waPhoneNumberId: e.target.value })}
                    placeholder="Cloud kullanıyorsanız"
                    autoComplete="off"
                  />
                </label>
              </div>
            </div>
            <div className="save-row">
              <button className="btn btn-wexon" type="button" onClick={() => void save()}>
                Ayarları kaydet
              </button>
              <span className="muted" style={{ fontSize: 13 }}>
                Maskeli alanı değiştirmezseniz eski değer korunur.
              </span>
            </div>
          </section>

          <section className="card panel">
            <div className="panel-head">
              <div>
                <div className="page-kicker">Gönderim</div>
                <h2>Tavan ve tempo</h2>
              </div>
            </div>
            <p className="panel-note">
              Günlük tavan ve mesaj aralığı spam gibi görünmeyi keser. İYS onayı sizin sorumluluğunuzdadır.
            </p>
            <div className="cap-tiles">
              <label className="cap-tile">
                <span>Min gecikme</span>
                <input
                  type="number"
                  min={8}
                  value={form.delayMinSec}
                  onChange={(e) => setForm({ ...form, delayMinSec: Number(e.target.value) })}
                />
                <em>saniye</em>
              </label>
              <label className="cap-tile">
                <span>Max gecikme</span>
                <input
                  type="number"
                  min={8}
                  value={form.delayMaxSec}
                  onChange={(e) => setForm({ ...form, delayMaxSec: Number(e.target.value) })}
                />
                <em>saniye</em>
              </label>
              <label className="cap-tile">
                <span>Günlük tavan</span>
                <input
                  type="number"
                  min={1}
                  value={form.dailyCap}
                  onChange={(e) => setForm({ ...form, dailyCap: Number(e.target.value) })}
                />
                <em>mesaj / gün</em>
              </label>
            </div>
          </section>
        </div>

        <section className="card panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <div>
              <div className="page-kicker">İlk temas</div>
              <h2>Kampanya medyası</h2>
            </div>
            <span className={`pill ${form.campaignMediaEnabled && (hasMediaId || form.campaignMediaUrl) ? "ok" : "mute"}`}>
              {form.campaignMediaEnabled && (hasMediaId || form.campaignMediaUrl) ? "Aktif" : "Kapalı"}
            </span>
          </div>
          <p className="panel-note">
            Görsel veya videoyu seçin; sistem Vercel&apos;e yükleyip ilk WhatsApp mesajlarına otomatik ekler. Takip mesajlarında tekrar göndermez. En fazla 60 MB.
          </p>
          <div className="key-stack">
            <label className="field">
              <span>Görsel veya video seç</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp"
                disabled={mediaBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadCampaignMedia(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {mediaBusy ? <p className="panel-note">Yükleniyor: %{mediaProgress}</p> : null}
          {mediaName ? <p className="panel-note"><strong>{form.campaignMediaType === "video" ? "Video yüklendi" : "Görsel yüklendi"}</strong></p> : null}
          <div className="save-row">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.campaignMediaEnabled}
                onChange={(e) => setForm({ ...form, campaignMediaEnabled: e.target.checked })}
              />
              İlk mesajlarda otomatik gönder
            </label>
            <button className="btn btn-wexon" type="button" onClick={() => void save()} disabled={mediaBusy}>
              Medya ayarını kaydet
            </button>
            {(hasMediaId || form.campaignMediaUrl) ? (
              <button className="btn" type="button" onClick={() => void clearCampaignMedia()} disabled={mediaBusy}>
                Medyayı kaldır
              </button>
            ) : null}
          </div>
        </section>

        <section className="card panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <div>
              <div className="page-kicker">Yapay zeka</div>
              <h2>Google Gemini</h2>
            </div>
            <span className={`pill ${flags.hasLlmKey ? "ok" : "mute"}`}>
              {flags.hasLlmKey ? "Kayıtlı" : "Anahtar yok"}
            </span>
          </div>
          <p className="panel-note">
            Mesaj asistanı Google Gemini kullanır. Anahtarı{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>{" "}
            adresinden alın (AIza…). Anahtar yoksa Mesaj ekranı hazır metinle çalışır. Varsayılan model: Gemini 3.7 Flash; Pro modeli hesabınızda ücretli kota gerektirebilir.
          </p>
          <div className="field">
            <span>Sağlayıcı</span>
            <ChipStrip>
              {LLM_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip${form.llmProvider === p.id ? " on" : ""}`}
                  onClick={() => applyProvider(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </ChipStrip>
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{provider.hint}</div>
          </div>
          <div className="key-stack" style={{ marginTop: 14 }}>
            <div className="key-block">
              <label className="field">
                <span>Google Gemini anahtarı</span>
                <input
                  value={form.llmApiKey}
                  onChange={(e) => {
                    setLlmCheck("idle");
                    setLlmCheckMsg("");
                    setForm({ ...form, llmApiKey: e.target.value });
                  }}
                  placeholder="AIza…"
                  autoComplete="off"
                  readOnly={Boolean(ortak)}
                />
              </label>
              {ortak ? <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Bu profil Gemini ayarlarını {ortak} ile ortak kullanır; WhatsApp bağlantısı bu profile özeldir.</div> : null}
            </div>
            <div className="key-block">
              <label className="field">
                <span>Base URL</span>
                <input
                  value={form.llmBaseUrl}
                  onChange={(e) => setForm({ ...form, llmBaseUrl: e.target.value, llmProvider: "custom" })}
                  placeholder={DEFAULT_LLM.baseUrl}
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="key-block">
              <label className="field">
                <span>Model</span>
                <input
                  value={form.llmModel}
                  onChange={(e) => setForm({ ...form, llmModel: e.target.value })}
                  placeholder={DEFAULT_LLM.model}
                  autoComplete="off"
                />
              </label>
            </div>
          </div>
          <div className="save-row">
            <button className="btn btn-wexon" type="button" onClick={() => void save()}>
              Gemini’yi kaydet
            </button>
          </div>
          {flags.hasLlmKey || form.llmApiKey.trim().length > 8 ? (
            <div className="key-block" style={{ marginTop: 14 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Kontrol et
              </div>
              <p className="panel-note" style={{ marginTop: 6 }}>
                Kaydettikten sonra Google’a kısa bir ping atar. Mesaj asistanı ancak bu geçince yazar.
              </p>
              <div className="save-row" style={{ marginTop: 10 }}>
                <button className="btn btn-wexon" type="button" disabled={llmBusy} onClick={() => void testLlm()}>
                  {llmBusy ? "Kontrol ediliyor…" : "Kontrol et"}
                </button>
                {llmCheck === "ok" ? <span className="pill ok">Çalışıyor</span> : null}
                {llmCheck === "bad" ? <span className="pill bad">Hata</span> : null}
              </div>
              {llmCheckMsg ? (
                <p className={llmCheck === "bad" ? "error-box" : "panel-note"} style={{ marginTop: 10 }}>
                  {llmCheckMsg}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="panel-note" style={{ marginTop: 12 }}>
              Anahtarı yapıştırıp kaydedin. Kontrol et alanı ondan sonra açılır.
            </p>
          )}
        </section>

        </>
      )}
    </div>
  );
}
