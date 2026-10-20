// Site klonlayıcının tarayıcı katmanı: sayfayı gerçek bir tarayıcıda (gizli pencere) çizer,
// JavaScript'in oluşturduğu son HTML'i ve tarayıcının yüklediği tüm dosyaları toplar;
// klonu internetsiz açıp orijinalle piksel piksel karşılaştırır.
//
// Güvenlik: her iş kendi bellek içi oturumunda (çerez paylaşmaz) çalışır; pencerenin Node erişimi,
// ön yükleme betiği, izinleri, açılır pencereleri ve indirmeleri yoktur.
const { BrowserWindow, session, nativeImage } = require('electron');

const VIEW = { width: 1440, height: 900 };
const TAKE = new Set(['stylesheet', 'script', 'image', 'font', 'media', 'object', 'other']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FINISH_ANIM = `(async () => {
  // Giriş / kaydırma animasyonlarını son karelerine getir: klonda öğeler yarı saydam ya da gizli kalmasın
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let k = 0; k < 3; k++) {
    for (const a of document.getAnimations()) { try { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish(); } catch {} }
    await s(250);
  }
  return true;
})()`;


class Renderer {
  constructor(jobId, ua, sameSite) {
    this.ses = session.fromPartition(`orbit-clone-${jobId}`); // 'persist:' yok → yalnızca bellekte
    this.ses.setUserAgent(ua);
    this.ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    this.ses.on('will-download', (e) => e.preventDefault());
    this.inflight = new Map(); // webContents id → bekleyen istek sayısı
    this.found = new Map();    // webContents id → yüklenen dosya adresleri
    this.sameSite = sameSite;
    const wcId = (d) => d.webContentsId ?? d.webContents?.id;
    this.ses.webRequest.onBeforeRequest((d, cb) => {
      const id = wcId(d);
      if (id != null) this.inflight.set(id, (this.inflight.get(id) || 0) + 1);
      // Reklam / izleme istekleri sayfa görünümünü etkilemez ve klona girmemeli
      cb({ cancel: /google-analytics|googletagmanager|doubleclick|facebook\.net\/.*fbevents|hotjar|clarity\.ms/i.test(d.url) });
    });
    const done = (d, ok) => {
      const id = wcId(d);
      if (id != null) this.inflight.set(id, Math.max(0, (this.inflight.get(id) || 1) - 1));
      if (ok && id != null && TAKE.has(d.resourceType) && /^https?:/.test(d.url) && d.statusCode >= 200 && d.statusCode < 300) {
        if (!this.found.has(id)) this.found.set(id, new Set());
        this.found.get(id).add(d.url.replace(/#.*$/, ''));
      }
    };
    this.ses.webRequest.onCompleted((d) => done(d, true));
    this.ses.webRequest.onErrorOccurred((d) => done(d, false));
  }

  async waitIdle(wc, quietMs = 700, maxMs = 15000) {
    const t0 = Date.now(); let quietSince = Date.now();
    while (Date.now() - t0 < maxMs) {
      if ((this.inflight.get(wc.id) || 0) > 0) quietSince = Date.now();
      else if (Date.now() - quietSince >= quietMs) return;
      await sleep(100);
    }
  }

  /** Sayfayı çizer: { html, finalUrl, resources[], shot (PNG Buffer) } */
  async render(url) {
    const win = new BrowserWindow({
      ...VIEW, show: false,
      // Ekran dışı çizim: gizli pencerede requestAnimationFrame durur ve JS animasyonları (ör. Framer Motion)
      // başlangıç karesinde (görünmez) kalır; offscreen modda sayfa gerçek ekrandaki gibi çizilir
      webPreferences: { session: this.ses, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true },
    });
    const wc = win.webContents;
    wc.setFrameRate(30);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Sayfanın kendi betikleri başka siteye yönlendirmesin
    wc.on('will-navigate', (e, to) => { try { if (!this.sameSite(new URL(to).host)) e.preventDefault(); } catch { e.preventDefault(); } });
    try {
      await Promise.race([wc.loadURL(url).catch((e) => { if (!/ERR_ABORTED/.test(e.message)) throw e; }), sleep(30000).then(() => { throw new Error('Sayfa 30 sn içinde açılmadı'); })]);
      await this.waitIdle(wc);
      // Orijinal görünüm: kullanıcının ilk gördüğü hali (kaydırmadan önce, animasyonlar bitmiş)
      await sleep(1200);
      await wc.executeJavaScript(FINISH_ANIM, true).catch(() => {});
      const shot = (await wc.capturePage()).toPNG();
      // Geç yüklenen görseller ve kaydırınca beliren bölümler için sayfanın sonuna kadar in
      await wc.executeJavaScript(`(async () => {
        const s = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 80; i++) {
          window.scrollBy(0, Math.round(innerHeight * 0.8)); await s(130);
          if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) break;
        }
        await s(400); window.scrollTo(0, 0); await s(300);
        try { await document.fonts.ready; } catch {}
        return true;
      })()`, true).catch(() => {});
      await this.waitIdle(wc, 700, 10000);
      await sleep(1200);
      await wc.executeJavaScript(FINISH_ANIM, true).catch(() => {});
      const html = await wc.executeJavaScript(`(() => {
        const dt = document.doctype ? '<!DOCTYPE ' + document.doctype.name + '>' : '<!DOCTYPE html>';
        return dt + '\\n' + document.documentElement.outerHTML;
      })()`, true);
      return { html, finalUrl: new URL(wc.getURL()), resources: [...(this.found.get(wc.id) || [])], shot };
    } finally {
      this.found.delete(wc.id); this.inflight.delete(wc.id);
      win.destroy();
    }
  }
}

/**
 * Klonu internetsiz açar ve ekran görüntüsünü alır. Dönüş: { shot, blocked } (blocked: engellenen internet isteği)
 */
async function renderOffline(file, jobId) {
  const ses = session.fromPartition(`orbit-clone-verify-${jobId}`);
  let blocked = 0;
  ses.webRequest.onBeforeRequest((d, cb) => { if (/^(https?|wss?):/i.test(d.url)) { blocked++; return cb({ cancel: true }); } cb({}); });
  const win = new BrowserWindow({ ...VIEW, show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await win.loadFile(file).catch(() => {});
    await win.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true', true).catch(() => {});
    await sleep(1200);
    await win.webContents.executeJavaScript(FINISH_ANIM, true).catch(() => {});
    return { shot: (await win.webContents.capturePage()).toPNG(), blocked };
  } finally { win.destroy(); }
}

/** İki ekran görüntüsünün benzerliği (0-100): küçültülmüş görüntülerde ortalama renk farkı */
function similarity(pngA, pngB) {
  const W = 360, H = 225;
  const a = nativeImage.createFromBuffer(pngA).resize({ width: W, height: H, quality: 'good' }).toBitmap();
  const b = nativeImage.createFromBuffer(pngB).resize({ width: W, height: H, quality: 'good' }).toBitmap();
  if (!a.length || a.length !== b.length) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return +(100 * (1 - diff / ((a.length / 4) * 3 * 255))).toFixed(1);
}

module.exports = { Renderer, renderOffline, similarity, VIEW };
