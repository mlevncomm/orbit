// RGB aydınlatma motoru (OpenRGB SDK sunucusu, port 6742)
//
// Öncelik cihazın KENDİ donanım efektidir: akıcıdır, Orbit kapalıyken de çalışır ve
// automaticSave/manualSave destekleyen cihazlarda kalıcıdır. Yazılım animasyonu yalnızca gerçek
// "Direct" modu olan cihazlarda ve donanım karşılığı olmayan efektlerde (ya da Senkron modda)
// kullanılır; düşük kare hızında ve yalnızca renk değiştiğinde gönderilir.
// "Custom" modu her yazmada cihaz hafızasına kaydettiği için ASLA animasyonda kullanılmaz.
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const { Client } = require('openrgb-sdk');
const store = require('./store');
const log = require('./log');

const PORT = 6742;
const PROTOCOL = 4; // openrgb-sdk 0.6 daha yeni protokol alanlarını çözemiyor
const TICK = 1000 / 30;

const TYPES = ['Anakart', 'RAM', 'Ekran Kartı', 'Soğutucu', 'LED Şerit', 'Klavye', 'Fare', 'Mousepad', 'Kulaklık', 'Kulaklık Standı',
  'Gamepad', 'Işık', 'Hoparlör', 'Sanal', 'Depolama', 'Kasa', 'Mikrofon', 'Aksesuar', 'Tuş Takımı', 'Laptop', 'Monitör'];
const SLOW_BUS = new Set([0, 1, 2]); // konum bilgisi yoksa: anakart, RAM, ekran kartı genelde SMBus/I2C
/** Cihaz yavaş SMBus/I2C hattında mı? (OpenRGB konumu: "I2C: ..." / "HID: ...") */
const slowBus = (d) => (d.location ? /^(i2c|smbus)/i.test(d.location) : SLOW_BUS.has(d.type));

const EFFECTS = {
  static: 'Sabit',
  breathing: 'Nefes',
  pulse: 'Nabız',
  spectrum: 'Renk döngüsü',
  rainbow: 'Gökkuşağı dalgası',
  wave: 'Renk dalgası',
  off: 'Kapalı',
};

// Efekt -> cihazlarda aranacak donanım modları (sırayla)
const NATIVE = {
  static: [/^static$/i],
  off: [/^off$/i],
  breathing: [/^breathing$/i, /breath/i, /^color pulse$/i, /pulse/i],
  pulse: [/^color pulse$/i, /^double flash$/i, /^flashing$/i, /pulse/i, /breath/i],
  spectrum: [/^spectrum cycle$/i, /^color cycle$/i, /^cycle$/i, /^rainbow$/i, /spectrum/i, /colormixing/i],
  rainbow: [/^rainbow wave$/i, /^wave$/i, /rainbow wave/i, /vertical rainbow/i, /rainbow circle/i, /^color wheel$/i, /^rainbow$/i, /spectrum cycle/i, /color cycle/i, /^cycle$/i],
  wave: [/^color wave$/i, /^color shift$/i, /^visor$/i, /wave/i, /breath/i],
};
const ANIMATED = new Set(['breathing', 'pulse', 'spectrum', 'rainbow', 'wave']);
// Donanım modunun efekti doğru renklerle gösterebilmesi için gereken en az renk sayısı
const COLORS_NEEDED = { breathing: 1, pulse: 1, wave: 2 };

const PRESETS = [
  { id: 'p_aurora', name: 'Aurora', effect: 'wave', colors: ['#00e5c0', '#7b2ff7'], speed: 3, brightness: 100 },
  { id: 'p_rainbow', name: 'Gökkuşağı', effect: 'rainbow', colors: ['#ff0000', '#0000ff'], speed: 3, brightness: 100 },
  { id: 'p_spectrum', name: 'Renk Döngüsü', effect: 'spectrum', colors: ['#ff0000', '#000000'], speed: 3, brightness: 100 },
  { id: 'p_sunset', name: 'Gün Batımı', effect: 'wave', colors: ['#ff7a18', '#ff2e63'], speed: 3, brightness: 100 },
  { id: 'p_ocean', name: 'Okyanus Nefesi', effect: 'breathing', colors: ['#1e6bff', '#00c2ff'], speed: 3, brightness: 100 },
  { id: 'p_purple', name: 'Mor Nefes', effect: 'breathing', colors: ['#9b5cff', '#ff4fd8'], speed: 3, brightness: 100 },
  { id: 'p_gaming', name: 'Oyun Modu', effect: 'static', colors: ['#ff1e3c', '#000000'], speed: 3, brightness: 100 },
  { id: 'p_cyber', name: 'Cyberpunk', effect: 'wave', colors: ['#fcee0a', '#00f0ff'], speed: 4, brightness: 100 },
  { id: 'p_matrix', name: 'Matrix', effect: 'wave', colors: ['#00ff41', '#003b00'], speed: 3, brightness: 100 },
  { id: 'p_ice', name: 'Buz Mavisi', effect: 'static', colors: ['#7fd4ff', '#000000'], speed: 3, brightness: 100 },
  { id: 'p_focus', name: 'Odak (sıcak beyaz)', effect: 'static', colors: ['#ffb46b', '#000000'], speed: 3, brightness: 50 },
  { id: 'p_white', name: 'Saf Beyaz', effect: 'static', colors: ['#ffffff', '#000000'], speed: 3, brightness: 100 },
  { id: 'p_off', name: 'Tümünü Kapat', effect: 'off', colors: ['#000000', '#000000'], speed: 3, brightness: 0 },
];

const hexToRgb = (hex) => {
  const n = parseInt(String(hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return { red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255 };
};
const BLACK = { red: 0, green: 0, blue: 0 };
const scale = (c, f) => ({ red: Math.round(c.red * f), green: Math.round(c.green * f), blue: Math.round(c.blue * f) });
const mix = (a, b, t) => ({ red: Math.round(a.red + (b.red - a.red) * t), green: Math.round(a.green + (b.green - a.green) * t), blue: Math.round(a.blue + (b.blue - a.blue) * t) });
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function hsv(h) {
  const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); };
  return { red: f(5), green: f(3), blue: f(1) };
}
// Algısal parlaklık: lineer kaydırıcıyı gözün algıladığı ölçeğe çevir
const gamma = (b) => Math.pow(clamp(b, 0, 1), 1.8);

function normalize(p) {
  return {
    id: p.id, name: p.name,
    effect: EFFECTS[p.effect] ? p.effect : 'static',
    colors: [p.colors?.[0] || '#ffffff', p.colors?.[1] || p.colors?.[0] || '#000000'],
    speed: clamp(+p.speed || 3, 1, 10),
    brightness: clamp(p.brightness ?? 100, 0, 100),
  };
}

class RGB extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.raw = new Map();     // deviceId -> SDK Device
    this.devices = [];
    this.applied = new Map(); // deviceId -> { method, mode, effect }
    this.soft = new Map();    // deviceId -> yazılım animasyon durumu
    this.timer = null;
    this.t0 = Date.now();
    this.connecting = null;
    this.reconnectTimer = null;
    this.queue = Promise.resolve(); // uygulamalar sırayla: aynı anda iki görünüm cihaza karışarak yazılmaz
    this.pendingApply = null;       // sırada bekleyen en son genel istek (aradakiler atlanır)
    this.saveTimers = new Map();    // cihaz anahtarı -> hafızaya kaydetme gecikmesi
    this.watchTimers = [];
  }

  findExe() {
    const roots = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'OpenRGB'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WinGet', 'Packages'),
    ];
    const walk = (dir, depth) => {
      if (depth < 0 || !fs.existsSync(dir)) return null;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isFile() && e.name.toLowerCase() === 'openrgb.exe') return p;
        if (e.isDirectory() && !(dir.endsWith('Packages') && !/openrgb/i.test(e.name))) {
          const r = walk(p, depth - 1);
          if (r) return r;
        }
      }
      return null;
    };
    for (const r of roots) { const f = walk(r, 3); if (f) return f; }
    return null;
  }

  async tryConnect() {
    const c = new Client('Orbit', PORT, '127.0.0.1', { forceProtocolVersion: PROTOCOL });
    await c.connect(1500);
    // Dinleyicisiz 'error' olayı süreci düşürür (ör. OpenRGB yeniden başlarken EPIPE)
    c.on('error', (e) => log.warn('OpenRGB bağlantı hatası', e));
    // OpenRGB cihaz algılamayı bitirince / cihaz takılınca listeyi yeniler
    c.on('deviceListUpdated', () => { if (this.client === c) this.onDeviceListChanged('OpenRGB bildirdi'); });
    c.on('disconnect', () => {
      if (this.client !== c) return;
      log.warn('OpenRGB bağlantısı koptu');
      this.client = null;
      this.stopLoop();
      this.emit('status');
      this.scheduleReconnect();
    });
    return c;
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      try { await this.connect(); await this.restore(); } catch { this.scheduleReconnect(); }
    }, 5000);
  }

  /** OpenRGB sunucusuna bağlanır; çalışmıyorsa arka planda başlatır. */
  connect() {
    if (this.client) return Promise.resolve(this.status());
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        this.client = await this.tryConnect();
      } catch {
        const exe = this.findExe();
        if (!exe) return { ...this.status(), installed: false };
        log.info('OpenRGB sunucusu başlatılıyor: ' + exe);
        const proc = spawn(exe, ['--server', '--server-port', String(PORT), '--startminimized'], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsHide: true });
        proc.unref();
        for (let i = 0; i < 40 && !this.client; i++) {
          await new Promise((r) => setTimeout(r, 750));
          try { this.client = await this.tryConnect(); } catch {}
        }
        if (!this.client) throw new Error('OpenRGB başlatıldı ama bağlanılamadı. OpenRGB penceresinde "SDK Server" sekmesinden sunucuyu başlatın.');
      }
      await this.refresh();
      log.info(`OpenRGB bağlı, ${this.devices.length} cihaz`);
      this.watchDetection();
      this.watchHotplug();
      this.emit('status');
      return this.status();
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  key(d) { return `${d.name}|${d.location || d.serial || ''}`; }

  /**
   * Bilgisayar açılırken OpenRGB cihazları birkaç saniyede bulur (RAM/SMBus en son gelir).
   * Bağlandıktan sonra bir süre cihaz sayısını izle; değişirse listeyi yenileyip görünümü yeniden uygula.
   */
  watchDetection() {
    this.watchTimers.forEach(clearTimeout);
    this.watchTimers = [3, 8, 15, 30, 60].map((sec) => setTimeout(async () => {
      if (!this.client) return;
      try {
        const n = await this.client.getControllerCount();
        if (n !== this.devices.length) this.onDeviceListChanged(`${this.devices.length} → ${n} cihaz`);
      } catch {}
    }, sec * 1000));
  }

  /** Cihaz listesi değişti: numaralar kaymış olabilir → eski eşlemeleri at, yenile, son görünümü uygula */
  onDeviceListChanged(why) {
    clearTimeout(this.listTimer);
    this.listTimer = setTimeout(() => this.enqueue(async () => {
      if (!this.client) return;
      this.soft.clear();
      this.applied.clear();
      await this.refresh();
      log.info(`RGB cihaz listesi güncellendi (${why}): ${this.devices.length} cihaz`);
      await this.restoreNow();
      this.startLoop();
      this.emit('status');
    }).catch((e) => log.warn('RGB cihaz listesi yenilenemedi', e)), 800);
  }

  /**
   * OpenRGB'ye cihazları yeniden taratır ve son görünümü geri uygular.
   * OpenRGB tak-çıkarı kendisi fark etmez: fare yeniden takılınca ya da Windows cihazın
   * bağlantısını yenileyince (Dinamik Aydınlatma aç/kapa, sürücü güncellemesi) eski, kopmuş
   * bağlantıya yazmaya devam eder ve renkler cihaza ulaşmaz.
   */
  rescan(why = 'elle') {
    return this.enqueue(async () => {
      if (!this.client) return this.status();
      log.info(`RGB yeniden tarama (${why})`);
      this.stopLoop();
      this.soft.clear();
      this.applied.clear();
      this.client.requestRescan();
      // Tarama birkaç saniye sürer ve bu sürede liste boş görünebilir: sayı oturana kadar bekle
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await sleep(3000);
      let last = -1;
      for (let i = 0; i < 20; i++) {
        const n = await this.client.getControllerCount().catch(() => 0);
        if (n > 0 && n === last) break;
        last = n;
        await sleep(1000);
      }
      await this.refresh();
      log.info(`RGB yeniden tarandı: ${this.devices.length} cihaz`);
      await this.restoreNow();
      this.startLoop();
      this.emit('status');
      return this.status();
    });
  }

  /**
   * Windows'ta bir cihaz takılınca / çıkarılınca (ya da sürücüsü yeniden yüklenince) haber al.
   * Yalnızca OpenRGB'nin yönettiği USB cihazlarının VID/PID'i eşleşirse yeniden taranır;
   * USB bellek takmak ışıkları etkilemez.
   */
  watchHotplug() {
    if (this.hotplug) return;
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Register-CimIndicationEvent -Query "SELECT * FROM __InstanceOperationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity'" -SourceIdentifier orbitpnp | Out-Null
while ($true) {
  $e = Wait-Event -SourceIdentifier orbitpnp -Timeout 3600
  if ($e) {
    $t = $e.SourceEventArgs.NewEvent
    [Console]::Out.WriteLine($t.CimClass.CimClassName + '|' + $t.TargetInstance.PNPDeviceID)
    [Console]::Out.Flush()
    Remove-Event -EventIdentifier $e.EventIdentifier
  }
}`;
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    this.hotplug = proc;
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        const [kind, id = ''] = line.split('|');
        if (!/Creation|Deletion/.test(kind)) continue;
        const vp = id.match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
        if (!vp) continue;
        const key = `VID_${vp[1]}&PID_${vp[2]}`.toUpperCase();
        if (!this.knownUsb().has(key)) continue;
        clearTimeout(this.hotplugTimer);
        this.hotplugTimer = setTimeout(() => this.rescan(`${key} ${/Creation/.test(kind) ? 'takıldı' : 'çıkarıldı'}`).catch((e) => log.warn('RGB yeniden tarama', e)), 4000);
      }
    });
    proc.on('exit', () => { if (this.hotplug === proc) this.hotplug = null; });
  }

  /** OpenRGB'nin yönettiği USB cihazlarının VID/PID'leri (konum: "HID: \\?\\HID#VID_046D&PID_C092...") */
  knownUsb() {
    const set = new Set();
    for (const d of this.raw.values()) {
      const m = String(d.location || '').match(/VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i);
      if (m) set.add(`VID_${m[1]}&PID_${m[2]}`.toUpperCase());
    }
    return set;
  }

  /** İşleri sırayla çalıştırır */
  enqueue(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async refresh() {
    if (!this.client) return [];
    const list = await this.client.getAllControllerData();
    this.raw = new Map(list.map((d) => [d.deviceId, d]));
    this.devices = list.map((d) => ({
      id: d.deviceId,
      key: this.key(d),
      name: d.name,
      vendor: d.vendor || '',
      type: TYPES[d.type] || 'Cihaz',
      typeId: d.type,
      leds: d.colors.length,
      modes: d.modes.map((m) => m.name),
      activeMode: d.modes[d.activeMode]?.name,
      hasDirect: d.modes.some((m) => /^direct$/i.test(m.name)),
      saves: d.modes.some((m) => m.flagList.includes('automaticSave') || m.flagList.includes('manualSave')),
    }));
    return this.devices;
  }

  status() {
    const st = store.get('rgbState') || { global: null, devices: {} };
    return {
      installed: !!this.client || !!this.findExe(),
      connected: !!this.client,
      devices: this.devices.map((d) => ({ ...d, applied: this.applied.get(d.id) || null, excluded: (store.get('ui')?.rgbExcluded || []).includes(d.key) })),
      effects: EFFECTS,
      presets: PRESETS,
      profiles: store.get('rgbProfiles') || [],
      active: st.global,
      lastOn: st.lastOn || null,
      engine: store.get('settings').rgbEngine,
    };
  }

  // ---------- Uygulama ----------

  /** Profili tüm cihazlara (deviceId null) ya da tek cihaza uygular ve hatırlar. */
  apply(profile, deviceId = null, opts = {}) {
    // Art arda gelen genel isteklerde (hızlı tıklama, kaydırıcı) yalnızca en sonuncusu cihazlara gider
    const req = { profile };
    if (deviceId == null) this.pendingApply = req;
    return this.enqueue(() => {
      if (deviceId == null && this.pendingApply !== req) return this.status();
      return this.applyNow(profile, deviceId, opts);
    });
  }

  async applyNow(profile, deviceId = null, { remember = true } = {}) {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('OpenRGB bağlı değil');
    const p = normalize(profile);
    // Genel uygulamada "senkrondan çıkarılmış" cihazlara dokunulmaz (kendi ayarlarında kalır)
    const excluded = new Set(store.get('ui')?.rgbExcluded || []);
    const targets = deviceId == null
      ? [...this.raw.values()].filter((d) => !excluded.has(this.key(d)))
      : [this.raw.get(deviceId)].filter(Boolean);
    const errors = [];
    for (const d of targets) {
      try { await this.applyToDevice(d, p); } catch (e) { errors.push(`${d.name}: ${e.message}`); log.error(`RGB uygulanamadı (${d.name})`, e); }
    }
    if (remember) {
      const st = store.get('rgbState') || { global: null, devices: {} };
      if (deviceId == null) {
        // Çıkarılmış cihazların kendi ayarları korunur; son "açık" görünüm Aç/Kapat için saklanır
        const keep = Object.fromEntries(Object.entries(st.devices || {}).filter(([k]) => excluded.has(k)));
        store.set('rgbState', { global: p, devices: keep, lastOn: p.effect === 'off' ? (st.lastOn || st.global) : p });
      }
      else store.set('rgbState', { ...st, devices: { ...st.devices, [this.key(targets[0])]: { profile: p } } });
    }
    this.startLoop();
    this.emit('status');
    if (errors.length === targets.length && targets.length) throw new Error(errors[0]);
    return this.status();
  }

  /** Işıkları kapatır ya da son açık görünüme döner */
  async power(on) {
    const st = store.get('rgbState') || {};
    if (!on) return this.apply(PRESETS.find((x) => x.id === 'p_off'));
    const back = st.lastOn || PRESETS[0];
    return this.apply(back);
  }

  /** Cihazı genel görünümden çıkarır / geri ekler */
  async setExcluded(deviceId, excluded) {
    const d = this.raw.get(deviceId);
    if (!d) throw new Error('Cihaz bulunamadı');
    const k = this.key(d);
    const list = new Set(store.get('ui')?.rgbExcluded || []);
    if (excluded) list.add(k); else list.delete(k);
    store.patch('ui', { rgbExcluded: [...list] });
    // Geri eklenen cihaza mevcut genel görünümü uygula
    const st = store.get('rgbState') || {};
    if (!excluded && st.global) await this.apply(st.global, deviceId, { remember: false });
    this.emit('status');
    return this.status();
  }

  /** Cihazın belirli bir donanım modunu seçer (cihaz kartındaki "Mod" listesi). */
  applyNative(deviceId, modeName, opts = {}, o = {}) {
    return this.enqueue(() => this.applyNativeNow(deviceId, modeName, opts, o));
  }

  async applyNativeNow(deviceId, modeName, opts = {}, { remember = true } = {}) {
    if (!this.client) await this.connect();
    const d = this.raw.get(deviceId);
    if (!d) throw new Error('Cihaz bulunamadı');
    const mode = d.modes.find((m) => m.name === modeName);
    if (!mode) throw new Error('Mod bulunamadı');
    this.soft.delete(d.deviceId);
    const p = normalize({ effect: 'static', colors: opts.colors || ['#ffffff'], speed: opts.speed, brightness: opts.brightness });
    await this.setMode(d, mode, p);
    this.applied.set(d.deviceId, { method: 'Donanım', mode: mode.name });
    if (remember) {
      const st = store.get('rgbState') || { global: null, devices: {} };
      store.set('rgbState', { ...st, devices: { ...st.devices, [this.key(d)]: { native: { mode: modeName, ...p } } } });
    }
    this.startLoop();
    this.emit('status');
    return this.status();
  }

  findMode(d, effect) {
    for (const re of NATIVE[effect] || []) {
      const m = d.modes.find((x) => re.test(x.name));
      if (m) return m;
    }
    return null;
  }

  directMode(d) { return d.modes.find((m) => /^direct$/i.test(m.name)) || null; }

  async applyToDevice(d, p) {
    this.soft.delete(d.deviceId);
    // Eski "Senkron" motoru RAM'i yavaş SMBus üzerinden yazılımla canlandırıp takılmaya yol açıyordu;
    // artık her zaman donanım öncelikli çalışılır.
    const direct = this.directMode(d);
    const animated = ANIMATED.has(p.effect);
    const done = (method, mode, note = '') => this.applied.set(d.deviceId, { method, mode, effect: p.effect, note });

    // 1) Donanım modu — yalnızca seçilen renkleri BİREBİR gösterebiliyorsa.
    //    (ör. Logitech "Wave" renk almaz, gökkuşağı gösterir; anakart "Breathing" tek renktir → dalga için uygun değil)
    const mode = this.findMode(d, p.effect);
    const need = COLORS_NEEDED[p.effect] || 0;
    const fits = mode && (!need || (mode.colorMode === 2 && mode.colorMax >= need));
    if (fits) { await this.setMode(d, mode, p); done('Donanım', mode.name); return; }

    // 2) Akıcı yazılım animasyonu: yalnızca gerçek Direct modu olan, hızlı veri yolundaki cihazlar.
    //    SMBus (RAM vb.) saniyede birkaç yazmayı kaldıramaz → takılır; onlara sabit geçiş uygulanır.
    if (animated && direct && !slowBus(d)) { await this.startSoft(d, direct, p); return; }

    // 3) Sabit: renk / kapalı / animasyonsuz cihazlarda efektin renkleriyle tek seferlik geçiş.
    //    Static > hafızaya kaydeden per-LED mod (RAM "Custom", klavye "Custom") > Direct
    const perLed = d.modes.find((m) => m.colorMode === 1 && (m.flagList.includes('automaticSave') || m.flagList.includes('manualSave'))) || direct || d.modes.find((m) => m.colorMode === 1);
    if (p.effect === 'wave' || p.effect === 'rainbow' || p.effect === 'spectrum') {
      if (perLed) {
        const n = d.colors.length;
        const leds = Array.from({ length: n }, (_, i) => {
          const t = n > 1 ? i / (n - 1) : 0;
          return p.effect === 'wave' ? mix(hexToRgb(p.colors[0]), hexToRgb(p.colors[1]), t) : hsv(t * 300);
        });
        await this.setMode(d, perLed, p, leds);
        done('Donanım', perLed.name, 'Bu cihaz renkli animasyonu desteklemiyor: renk geçişi sabit uygulandı');
        return;
      }
    }
    // Static modu renk almıyorsa (colorMax 0) setMode rengi LED'lere yazar
    const target = (p.effect === 'off' && this.findMode(d, 'off')) || this.findMode(d, 'static') || perLed;
    if (!target) throw new Error('Desteklenen mod yok');
    await this.setMode(d, target, p.effect === 'off' ? { ...p, colors: ['#000000', '#000000'] } : p);
    done('Donanım', target.name, ['static', 'off'].includes(p.effect) ? '' : 'Bu cihazda bu efekt yok: ilk renk sabit uygulandı');
  }

  /** Donanım modunu hız/parlaklık/renk ile ayarlar; manualSave destekliyorsa cihaza kaydeder. */
  async setMode(d, mode, p, ledsOverride = null) {
    const flags = mode.flagList || [];
    const m = { id: mode.id };
    // Kaydırıcının üst ucu cihazın en yüksek hızının ~%70'i: donanımın en hızlı değerleri gözü yorar
    const t = ((p.speed - 1) / 9) * 0.7;
    if (flags.includes('speed')) m.speed = lerp(mode.speedMin, mode.speedMax, t);
    const hasBri = flags.includes('brightness') && mode.brightnessMax !== mode.brightnessMin && mode.brightnessMax != null;
    if (hasBri) m.brightness = lerp(mode.brightnessMin, mode.brightnessMax, p.effect === 'off' ? 0 : p.brightness / 100);
    const c1 = hexToRgb(p.colors[0]);
    const c2 = hexToRgb(p.colors[1]);
    // Donanım parlaklığı yoksa rengi koyulaştırarak uygula
    const tint = (c) => (hasBri ? c : scale(c, gamma(p.brightness / 100)));
    if (mode.colorMode === 2 && mode.colorMax > 0) {
      const n = clamp(2, Math.max(1, mode.colorMin), mode.colorMax);
      m.colors = [tint(c1), tint(c2)].slice(0, n);
      while (m.colors.length < n) m.colors.push(tint(c1));
    }
    await this.client.updateMode(d.deviceId, m);
    // Per-LED modlar (Direct/Custom/Static-colorMax=0) renkleri LED'lerden okur: tek seferlik yaz
    if (ledsOverride) this.client.updateLeds(d.deviceId, ledsOverride.map(tint));
    else if (mode.colorMode === 1 || (mode.colorMode === 2 && !mode.colorMax)) {
      const c = p.effect === 'off' ? BLACK : tint(c1);
      this.client.updateLeds(d.deviceId, new Array(d.colors.length).fill(c));
    }
    // Cihaz hafızasına yazma yavaştır ve hafızayı yıpratır: kaydırıcı sürüklenirken her adımda değil,
    // değişiklikler 2 sn durunca bir kez kaydet
    if (flags.includes('manualSave')) {
      const k = this.key(d);
      clearTimeout(this.saveTimers.get(k)?.t);
      const run = () => {
        this.saveTimers.delete(k);
        const cur = [...this.raw.values()].find((x) => this.key(x) === k);
        if (cur && this.client) Promise.resolve(this.client.saveMode(cur.deviceId, m)).catch((e) => log.warn('RGB kaydedilemedi', e));
      };
      this.saveTimers.set(k, { t: setTimeout(run, 2000), run });
    }
  }

  // ---------- Yazılım animasyonu (yalnızca Direct) ----------

  async startSoft(d, direct, p) {
    await this.client.updateMode(d.deviceId, { id: direct.id });
    this.soft.set(d.deviceId, {
      p, n: d.colors.length, every: slowBus(d) ? 3 : 1, // SMBus: 10 fps, USB: 30 fps
      c1: hexToRgb(p.colors[0]), c2: hexToRgb(p.colors[1]), last: '', tick: 0,
      // hız 1 → 16 sn'lik döngü, 10 → 2 sn
      period: 16 - ((p.speed - 1) / 9) * 14,
      bri: gamma(p.brightness / 100),
    });
    this.applied.set(d.deviceId, { method: 'Yazılım', mode: 'Direct', effect: p.effect });
  }

  frame() {
    if (!this.client) return;
    const t = (Date.now() - this.t0) / 1000;
    for (const [id, s] of this.soft) {
      if (s.tick++ % s.every) continue;
      const phase = (t / s.period) % 1;
      const out = new Array(s.n);
      for (let i = 0; i < s.n; i++) {
        const pos = s.n > 1 ? i / s.n : 0;
        let c;
        switch (s.p.effect) {
          case 'breathing': c = mix(scale(s.c1, 0.04), s.c1, 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI)); break;
          case 'pulse': { const b = Math.max(Math.exp(-phase * 14), 0.75 * Math.exp(-Math.abs(phase - 0.2) * 18)); c = scale(s.c1, 0.04 + 0.96 * b); break; }
          case 'spectrum': c = hsv(phase * 360); break;
          case 'rainbow': c = hsv(((phase + pos) % 1) * 360); break;
          case 'wave': c = mix(s.c1, s.c2, 0.5 + 0.5 * Math.sin((phase - pos) * 2 * Math.PI)); break;
          default: c = s.c1;
        }
        out[i] = scale(c, s.bri);
      }
      const sig = out.map((c) => (c.red >> 2) * 4096 + (c.green >> 2) * 64 + (c.blue >> 2)).join(',');
      if (sig === s.last) continue; // değişmeyen kareyi gönderme
      s.last = sig;
      try { this.client.updateLeds(id, out); } catch (e) { log.warn('LED güncellenemedi', e); }
    }
  }

  startLoop() {
    if (this.soft.size && !this.timer) this.timer = setInterval(() => this.frame(), TICK);
    if (!this.soft.size) this.stopLoop();
  }
  stopLoop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  // ---------- Profiller / kalıcılık ----------

  saveProfile(p) {
    const list = (store.get('rgbProfiles') || []).filter((x) => x.id !== p.id);
    const item = { ...normalize(p), id: p.id && String(p.id).startsWith('u_') ? p.id : 'u_' + Date.now().toString(36), name: String(p.name || 'Profilim').slice(0, 40) };
    store.set('rgbProfiles', [...list, item]);
    return item;
  }
  deleteProfile(id) { store.set('rgbProfiles', (store.get('rgbProfiles') || []).filter((x) => x.id !== id)); }

  /** Açılışta (ve bağlantı yeniden kurulunca) son görünümü geri yükler. */
  async restore() {
    try {
      await this.connect();
      if (!this.client) return;
      await this.enqueue(() => this.restoreNow());
    } catch (e) { log.warn('RGB geri yüklenemedi', e); }
  }

  /** Kuyruğun İÇİNDEN çağrılır (kendisi kuyruğa girmez, yoksa kilitlenir) */
  async restoreNow() {
    const st = store.get('rgbState');
    if (!this.client || !st || (!st.global && !Object.keys(st.devices || {}).length)) return;
    try {
      if (st.global) await this.applyNow(st.global, null, { remember: false });
      for (const [key, v] of Object.entries(st.devices || {})) {
        const d = [...this.raw.values()].find((x) => this.key(x) === key);
        if (!d) continue;
        if (v.native) await this.applyNativeNow(d.deviceId, v.native.mode, v.native, { remember: false });
        else if (v.profile) await this.applyNow(v.profile, d.deviceId, { remember: false });
      }
      log.info('RGB görünümü geri yüklendi');
    } catch (e) { log.warn('RGB geri yüklenemedi', e); }
  }

  /** Arayüzdeki canlı şerit için: cihazların şu an gösterdiği renkler (en fazla 24 örnek) */
  async live() {
    if (!this.client) return [];
    const hex = (c) => '#' + [c.red, c.green, c.blue].map((v) => v.toString(16).padStart(2, '0')).join('');
    const list = await this.client.getAllControllerData();
    return list.map((d) => {
      const m = d.modes[d.activeMode];
      const step = Math.max(1, Math.ceil(d.colors.length / 24));
      // Donanım animasyonlarında LED renkleri cihaz çipinde hesaplanır; bu durumda mod renkleri gösterilir
      const perLed = m.colorMode === 1 || (m.colorMode === 2 && !m.colorMax) || this.soft.has(d.deviceId);
      return { id: d.deviceId, mode: m.name, hardwareAnim: !perLed, colors: perLed ? d.colors.filter((_, i) => i % step === 0).map(hex) : m.colors.map(hex) };
    });
  }

  /**
   * Başka bir ışık denetleyicisi cihazları ele geçirmiş mi? (salt okunur denetim)
   * Windows "Dinamik Aydınlatma" açıkken Logitech LampArray hizmeti fareyi Windows'a bağlar ve
   * Windows renkleri sürekli yazar; OpenRGB'nin doğrudan (Direct) yazdığı renkler fareye ulaşmaz.
   */
  async conflicts() {
    if (this.conflictCache && Date.now() - this.conflictCache.at < 30000) return this.conflictCache.list;
    const run = (file, args) => new Promise((res) => execFile(file, args, { windowsHide: true, timeout: 5000 }, (e, out) => res(e ? '' : String(out))));
    const list = [];
    const [reg, devs, svc] = await Promise.all([
      run('reg', ['query', 'HKCU\\Software\\Microsoft\\Lighting', '/v', 'AmbientLightingEnabled']),
      run('reg', ['query', 'HKCU\\Software\\Microsoft\\Lighting\\Devices']),
      run('sc', ['query', 'logi_lamparray_service']),
    ]);
    const dynamicOn = /AmbientLightingEnabled\s+REG_DWORD\s+0x1\b/i.test(reg);
    const hasDevice = /Lighting\\Devices\\/i.test(devs);
    if (dynamicOn && hasDevice) {
      const logi = /RUNNING/i.test(svc);
      list.push({
        id: 'dynamic-lighting',
        title: 'Windows Dinamik Aydınlatma ışıkları kontrol ediyor',
        text: logi
          ? 'Logitech LampArray hizmeti fareyi Windows\'a bağlamış; Windows renkleri sürekli yazdığı için Orbit\'in fareye gönderdiği renkler görünmeyebilir. Ayarlar > Kişiselleştirme > Dinamik Aydınlatma\'da cihazın denetimini kapat.'
          : 'Windows bazı ışıklı cihazları kendisi yönetiyor; Orbit\'in renkleri bu cihazlarda görünmeyebilir. Ayarlar > Kişiselleştirme > Dinamik Aydınlatma\'da cihazın denetimini kapat.',
      });
    }
    this.conflictCache = { at: Date.now(), list };
    return list;
  }

  shutdown() {
    try { this.hotplug?.kill(); } catch {}
    clearTimeout(this.hotplugTimer);
    this.stopLoop(); clearTimeout(this.reconnectTimer); clearTimeout(this.listTimer); this.watchTimers.forEach(clearTimeout);
    // Bekleyen hafıza kayıtlarını kapanmadan önce yaz
    for (const { t, run } of [...this.saveTimers.values()]) { clearTimeout(t); run(); }
  }
}

module.exports = new RGB();
module.exports.slowBus = slowBus;
