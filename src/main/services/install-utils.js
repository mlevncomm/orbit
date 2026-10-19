// Kurulum motorunun saf (yan etkisiz, test edilebilir) yardımcıları

// winget / Windows Installer çıkış kodları → anlam. Kodlar işaretli 32-bit tamsayı olarak gelir.
const hex = (code) => '0x' + (code >>> 0).toString(16).toUpperCase().padStart(8, '0');

const CODES = {
  '0x8A15002B': { kind: 'already', text: 'Zaten kurulu ve güncel' },
  '0x8A150061': { kind: 'already', text: 'Zaten kurulu' },
  '0x8A150056': { kind: 'needs-user', text: 'Yükleyici yönetici yetkisiyle çalışmayı reddetti (ör. Spotify); normal kullanıcı olarak denenmeli' },
  '0x8A150109': { kind: 'reboot', text: 'Kuruldu, tamamlanması için yeniden başlatma gerekli' },
  '0x8A150014': { kind: 'error', text: 'Paket winget deposunda bulunamadı (kimlik değişmiş olabilir)' },
  '0x8A150008': { kind: 'error', text: 'Kurulum dosyası indirilemedi (internet bağlantısını kontrol et)' },
  '0x8A150011': { kind: 'error', text: 'İndirilen dosyanın imza/karma doğrulaması tutmadı; güvenlik için kurulmadı' },
  '0x80072EE7': { kind: 'error', text: 'Sunucu adı çözümlenemedi (DNS / internet sorunu)' },
  '0x80072EFD': { kind: 'error', text: 'Sunucuya bağlanılamadı (internet / güvenlik duvarı)' },
};
const MSI = {
  1602: { kind: 'error', text: 'Kurulum kullanıcı tarafından iptal edildi' },
  1603: { kind: 'error', text: 'Kurulum sırasında ölümcül hata (yükleyicinin kendi günlüğüne bak)' },
  1618: { kind: 'error', text: 'Başka bir kurulum sürüyor; bitince yeniden dene' },
  1641: { kind: 'reboot', text: 'Kuruldu, yükleyici yeniden başlatma başlattı' },
  3010: { kind: 'reboot', text: 'Kuruldu, tamamlanması için yeniden başlatma gerekli' },
};

/** Çıkış kodunu sınıflandırır: { kind: ok|already|reboot|error, text } */
function explainExit(code) {
  if (code === 0) return { kind: 'ok', text: 'Kurulum komutu başarıyla bitti' };
  if (MSI[code]) return MSI[code];
  const h = hex(code);
  if (CODES[h]) return CODES[h];
  if (code === -1 || code == null) return { kind: 'error', text: 'Kurulum programı başlatılamadı' };
  return { kind: 'error', text: `Kurulum başarısız (kod ${h})` };
}

const UNIT = { KB: 1 / 1024, MB: 1, GB: 1024 };
/**
 * winget çıktı satırından GERÇEK indirme ilerlemesini çıkarır.
 * "  ██████   12.0 MB / 100 MB" → { doneMB: 12, totalMB: 100, percent: 12 }
 * Sadece yüzde içeren satır (" 45%") → { percent: 45 }. Bilgi yoksa null.
 */
function parseProgress(line) {
  const m = String(line).match(/([\d.,]+)\s*(KB|MB|GB)\s*\/\s*([\d.,]+)\s*(KB|MB|GB)/i);
  if (m) {
    const done = parseFloat(m[1].replace(',', '.')) * UNIT[m[2].toUpperCase()];
    const total = parseFloat(m[3].replace(',', '.')) * UNIT[m[4].toUpperCase()];
    if (total > 0) return { doneMB: +done.toFixed(1), totalMB: +total.toFixed(1), percent: Math.max(0, Math.min(100, Math.round((done / total) * 100))) };
  }
  const p = String(line).match(/(?:^|\s)(\d{1,3})\s*%/);
  if (p && +p[1] <= 100) return { percent: +p[1] };
  return null;
}

/** winget kimliği güvenlik denetimi: yalnızca beklenen karakterler (komut enjeksiyonunu önler) */
function safeWingetId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9.+\-_]{1,120}$/.test(id);
}
/** npm paket adı denetimi (@kapsam/ad dahil) */
function safeNpmName(name) {
  return typeof name === 'string' && /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]{0,213}$/.test(name);
}

/** "v22.11.0", "git version 2.47.1.windows.1", "Python 3.13.1" → "22.11.0" / "2.47.1" / "3.13.1" */
function extractVersion(text) {
  const m = String(text).match(/(\d+\.\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

/**
 * `winget show` çıktısından sürümü ve kurulum dosyası adresini çıkarır (İngilizce/Türkçe etiketler).
 * Birden çok "Installer Url" varsa (mimariye göre) x64 olanı tercih edilir.
 */
function parseShow(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.replace(/^[\s\S]*\r/, ''));
  const ver = lines.map((l) => l.match(/^\s*(?:Version|Sürüm)\s*:\s*(\S+)/i)).find(Boolean);
  const urls = lines.map((l) => l.match(/^\s*(?:Installer Url|Yükleyici (?:URL|Url|Adresi))\s*:\s*(https:\/\/\S+)/i)).filter(Boolean).map((m) => m[1]);
  const url = urls.find((u) => /x64|amd64|win64/i.test(u)) || urls[0] || null;
  return { version: ver ? ver[1] : null, url };
}

module.exports = { explainExit, parseProgress, parseShow, safeWingetId, safeNpmName, extractVersion, hex };
