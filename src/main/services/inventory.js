// Sistem envanteri: bu bilgisayarda kurulu her şey, sürümleri ve bekleyen güncellemeler.
// Kaynaklar birleştirilir:
//   1) Kayıt defteri Uninstall anahtarları (HKLM 64/32 bit + HKCU) — her kurulum programı
//   2) `winget list` — winget kimliği, kurulu sürüm, mevcut güncelleme (Store/MSIX dahil)
//   3) Dosya kontrolleri — kurulum kaydı bırakmayan araçlar (ör. Claude Code)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { runPS } = require('./ps');
const log = require('./log');

const TTL = 10 * 60 * 1000;

/** winget tablo çıktısını sütun konumlarına göre ayrıştırır (dilden bağımsız) */
function parseTable(stdout) {
  const lines = stdout.split(/\r?\n/).map((l) => l.replace(/^[\s\S]*\r/, '')).filter((l) => l.trim() && !/^\s*[-\\|/]\s*$/.test(l));
  const sep = lines.findIndex((l) => /^-{10,}/.test(l.trim()));
  if (sep < 1) return [];
  const header = lines[sep - 1];
  const starts = [0];
  for (let i = 1; i < header.length; i++) if (header[i - 1] === ' ' && header[i] !== ' ') starts.push(i);
  const cols = starts.length; // 5: Ad Kimlik Sürüm Mevcut Kaynak  ·  4: Ad Kimlik Sürüm Kaynak
  return lines.slice(sep + 1).filter((l) => !/^\d+ (upgrades|güncelleme)/i.test(l.trim()) && l.length > starts[1]).map((l) => {
    const col = (i) => (i < cols ? l.slice(starts[i], starts[i + 1] ?? l.length).trim() : '');
    return cols >= 5
      ? { name: col(0), id: col(1), version: col(2), available: col(3), source: col(4) }
      : { name: col(0), id: col(1), version: col(2), available: '', source: col(3) };
  }).filter((x) => x.id);
}

const REGISTRY = `
  $keys = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
          'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
          'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
  @(Get-ItemProperty $keys -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -and $_.SystemComponent -ne 1 -and -not $_.ParentKeyName -and $_.ReleaseType -notmatch 'Update|Hotfix' } |
    ForEach-Object { @{ name = [string]$_.DisplayName; version = [string]$_.DisplayVersion; publisher = [string]$_.Publisher;
                        date = [string]$_.InstallDate; icon = [string]$_.DisplayIcon; sizeMB = if ($_.EstimatedSize) { [math]::Round($_.EstimatedSize / 1024) } else { 0 } } }) |
    ConvertTo-Json -Depth 3 -Compress
`;

class Inventory extends EventEmitter {
  constructor() {
    super();
    this.data = null;
    this.at = 0;
    this.pending = null;
  }

  /** Tüm envanter (önbellekli). force: önbelleği yok say */
  get(force = false) {
    if (!force && this.data && Date.now() - this.at < TTL) return Promise.resolve(this.data);
    if (this.pending) return this.pending;
    this.pending = this.scan().finally(() => { this.pending = null; });
    return this.pending;
  }

  async scan() {
    const t0 = Date.now();
    const [reg, list] = await Promise.all([
      runPS(REGISTRY, { timeoutMs: 60000 }).then((r) => { try { return [].concat(JSON.parse(r.stdout.trim() || '[]')); } catch { return []; } }),
      runPS('winget list --accept-source-agreements --disable-interactivity', { timeoutMs: 120000 }).then((r) => parseTable(r.stdout)),
    ]);
    // Kayıt defterindeki çift kayıtları (32/64 bit) tekilleştir
    const byName = new Map();
    for (const p of reg) {
      const k = p.name.toLowerCase();
      if (!byName.has(k) || (p.version && !byName.get(k).version)) byName.set(k, p);
    }
    // winget satırlarını ada göre eşle: kayıt defteri girdisine kimlik ve güncelleme bilgisini ekle
    const wingetById = new Map(list.map((w) => [w.id.toLowerCase(), w]));
    const programs = [...byName.values()].map((p) => {
      const w = list.find((x) => x.name.toLowerCase() === p.name.toLowerCase())
        || list.find((x) => x.name.length > 3 && p.name.toLowerCase().startsWith(x.name.toLowerCase().replace(/…$/, '')));
      return {
        ...p,
        wingetId: w && !/^(ARP|MSIX)\\/.test(w.id) ? w.id : null,
        available: w?.available || '',
      };
    });
    // Kayıt defterinde olmayan winget paketleri (Store/MSIX uygulamaları)
    for (const w of list) {
      if (/^ARP\\/.test(w.id)) continue;
      if (programs.some((p) => p.wingetId && p.wingetId.toLowerCase() === w.id.toLowerCase())) continue;
      if (programs.some((p) => p.name.toLowerCase() === w.name.toLowerCase())) continue;
      programs.push({ name: w.name, version: w.version, publisher: '', date: '', sizeMB: 0, wingetId: /^MSIX\\/.test(w.id) ? null : w.id, available: w.available, store: /^MSIX\\/.test(w.id) });
    }
    programs.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const upgrades = list.filter((w) => w.available && w.source && !/^(ARP|MSIX)\\/.test(w.id))
      .map((w) => ({ name: w.name, id: w.id, version: w.version, available: w.available }));
    this.data = { programs, upgrades, wingetById: Object.fromEntries(wingetById), scannedAt: Date.now() };
    this.at = Date.now();
    log.info(`Envanter: ${programs.length} program, ${upgrades.length} güncelleme (${Date.now() - t0} ms)`);
    this.emit('changed', this.summary());
    return this.data;
  }

  invalidate() { this.at = 0; }

  summary() {
    if (!this.data) return null;
    return { programs: this.data.programs.length, upgrades: this.data.upgrades.length, scannedAt: this.data.scannedAt };
  }

  /**
   * Katalog uygulamasının bu bilgisayardaki durumu.
   * Eşleşme sırası: winget kimliği (aile öneki dahil, ör. OpenJS.NodeJS.22 ↔ OpenJS.NodeJS.LTS) →
   * kayıt defteri adı (app.match) → dosya varlığı (app.files)
   */
  statusOf(app) {
    const inv = this.data;
    if (!inv) return null;
    const ids = Object.keys(inv.wingetById);
    const want = (app.wingetId || '').toLowerCase();
    const family = (app.family || '').toLowerCase();
    let w = want && inv.wingetById[want];
    if (!w && family) w = inv.wingetById[ids.find((i) => i.startsWith(family))];
    const re = app.match ? (app.match instanceof RegExp ? app.match : new RegExp(app.match, 'i')) : null;
    if (w) {
      const p = inv.programs.find((x) => (x.wingetId && x.wingetId.toLowerCase() === w.id.toLowerCase()) || (re && re.test(x.name)));
      return { installed: true, version: w.version, available: w.source ? w.available : '', id: w.id, icon: p?.icon || '' };
    }
    if (re) {
      const p = inv.programs.find((x) => re.test(x.name));
      if (p) return { installed: true, version: p.version, available: p.available, id: p.wingetId, icon: p.icon || '' };
    }
    for (const f of app.files || []) {
      const full = f.replace(/%(\w+)%/g, (_, v) => process.env[v] || (v === 'USERPROFILE' ? os.homedir() : ''));
      if (fs.existsSync(full)) return { installed: true, version: '', available: '' };
    }
    return { installed: false };
  }
}

module.exports = new Inventory();
module.exports.parseTable = parseTable;
