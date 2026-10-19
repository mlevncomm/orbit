// Sürücü yönetimi saf yardımcıları (test edilebilir, yan etkisiz)

// PCI / USB üretici kimlikleri (yaygın olanlar). Bilinmeyen kimlik ham olarak gösterilir.
const VENDORS = {
  '1002': 'AMD (Radeon)', '1022': 'AMD', '10DE': 'NVIDIA', '8086': 'Intel', '8087': 'Intel', '10EC': 'Realtek', '0BDA': 'Realtek',
  '14E4': 'Broadcom', '168C': 'Qualcomm Atheros', '17CB': 'Qualcomm', '1B21': 'ASMedia', '144D': 'Samsung', '15B7': 'SanDisk/WD',
  '1987': 'Phison', '1C5C': 'SK hynix', '046D': 'Logitech', '1B1C': 'Corsair', '1532': 'Razer', '1038': 'SteelSeries',
  '1A86': 'WCH (CH340)', '10C4': 'Silicon Labs', '0403': 'FTDI', '303A': 'Espressif', '048D': 'ITE', '320F': 'Evision',
};

/**
 * Donanım kimliğini ayrıştırır.
 * "PCI\VEN_1002&DEV_73FF&SUBSYS_...&REV_C7" → { bus:'PCI', vendorId:'1002', deviceId:'73FF', subsys, rev, vendor:'AMD (Radeon)' }
 * "USB\VID_046D&PID_C092&MI_00\..."        → { bus:'USB', vendorId:'046D', deviceId:'C092', ... }
 */
function parseHwId(id) {
  const s = String(id || '').toUpperCase();
  const bus = (s.match(/^([A-Z0-9]+)\\/) || [])[1] || null;
  const ven = (s.match(/(?:VEN|VID)_([0-9A-F]{4})/) || [])[1] || null;
  const dev = (s.match(/(?:DEV|PID)_([0-9A-F]{4})/) || [])[1] || null;
  return {
    bus, vendorId: ven, deviceId: dev,
    subsys: (s.match(/SUBSYS_([0-9A-F]{8})/) || [])[1] || null,
    rev: (s.match(/REV_([0-9A-F]{2,4})/) || [])[1] || null,
    vendor: ven ? VENDORS[ven] || null : null,
  };
}

/** Windows Update başlığındaki sürücü sürümü: "Logitech USB Driver Update (1.1.84.7627)" → "1.1.84.7627" */
function versionFromTitle(title) {
  const m = String(title || '').match(/\(([\d]+(?:\.\d+){1,4})\)\s*$/) || String(title || '').match(/\b(\d+\.\d+\.\d+(?:\.\d+)?)\b/);
  return m ? m[1] : null;
}

/** Sürücü sürümlerini karşılaştırır: 'newer' (b daha yeni) | 'same' | 'older' | 'unknown' */
function compareVersions(current, next) {
  if (!current || !next) return 'unknown';
  const a = String(current).split('.').map((x) => parseInt(x, 10));
  const b = String(next).split('.').map((x) => parseInt(x, 10));
  if (a.some(isNaN) || b.some(isNaN)) return 'unknown';
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (y > x) return 'newer';
    if (y < x) return 'older';
  }
  return 'same';
}

/**
 * Güncellemenin cihazın mevcut sürücüsüne göre anlamı. Farklı sağlayıcıların sürüm numaraları
 * karşılaştırılamaz (ör. Microsoft 10.0.26100 ↔ Logitech 1.1.84):
 *   'newer' | 'same' | 'older'  — aynı sağlayıcı, sürüm karşılaştırıldı
 *   'vendor'    — Windows'un genel (Microsoft) sürücüsü yerine üreticinin sürücüsü
 *   'different' — farklı sağlayıcı, sürümler karşılaştırılamaz
 *   'unknown'   — cihaz eşleşmedi ya da sürüm yok
 */
function classifyUpdate(device, newProvider, newVersion) {
  if (!device?.version) return 'unknown';
  const cur = String(device.provider || '').trim().toLowerCase();
  const nxt = String(newProvider || '').trim().toLowerCase();
  if (cur && nxt && cur !== nxt) return cur === 'microsoft' ? 'vendor' : 'different';
  return compareVersions(device.version, newVersion);
}

/** BIOS / UEFI / firmware güncellemesi mi? Bunlar normal sürücü kuyruğuna asla otomatik girmez. */
function isFirmwareUpdate(u) {
  return /^firmware$/i.test(u?.cls || '') || /\b(BIOS|UEFI|firmware|ürün yazılımı)\b/i.test(u?.title || '');
}

/** Windows Update RebootBehavior: 0 asla, 1 her zaman, 2 gerekebilir */
const REBOOT_TEXT = { 0: 'Gerekmez', 1: 'Gerekli', 2: 'Gerekebilir' };

module.exports = { VENDORS, parseHwId, versionFromTitle, compareVersions, classifyUpdate, isFirmwareUpdate, REBOOT_TEXT };
