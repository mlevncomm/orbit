// Otomasyon: ESP32 (BOOT tuşu, Wi-Fi paneli) ve ileride diğer tetikleyicilerden gelen istekleri
// İZİN LİSTESİ üzerinden çalıştırır ve Orbit'in durumunu karta "ikiz" olarak yansıtır.
//
// Güvenlik:
//  - Yalnızca ACTIONS içindeki eylemler çalışır; ham metin asla komuta dönüşmez.
//  - level 'confirm' olan eylemler (program/sürücü kurulumu) bilgisayar ekranında açık onay ister.
//  - Argümanlar her eylemin kendi doğrulamasından geçer.
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');

/** CPU kullanımını (son ölçümden bu yana) yüzde olarak hesaplar */
function cpuSampler() {
  let prev = os.cpus();
  return () => {
    const cur = os.cpus();
    let idle = 0, total = 0;
    cur.forEach((c, i) => {
      const p = prev[i]?.times || c.times;
      const t = (k) => c.times[k] - p[k];
      const sum = t('user') + t('nice') + t('sys') + t('idle') + t('irq');
      idle += t('idle'); total += sum;
    });
    prev = cur;
    return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
  };
}

class Automation extends EventEmitter {
  /**
   * deps: { rgb, store, installer, inventory, catalog, drivers, assistant, hub, log, showWindow, confirm(text, detail), setSettings(patch), version }
   */
  constructor(deps) {
    super();
    this.d = deps;
    this.history = [];
    this.cpu = cpuSampler();
    this.timer = null;
    this.busy = false;
    this.ACTIONS = this.buildActions();
  }

  buildActions() {
    const { rgb, store, installer, inventory, catalog, drivers, assistant } = this.d;
    const presetsAll = () => [...rgb.status().presets, ...(store.get('rgbProfiles') || [])];
    const global = () => store.get('rgbState')?.global || null;
    return {
      'app.show': { level: 'safe', label: "Orbit'i öne getir", run: async () => { this.d.showWindow(); return 'Orbit penceresi açıldı'; } },
      'settings.theme': {
        level: 'safe', label: 'Temayı değiştir', args: ['toggle', 'light', 'dark'],
        run: async (arg) => {
          const cur = store.get('settings').theme;
          const next = arg === 'light' || arg === 'dark' ? arg : cur === 'dark' ? 'light' : 'dark';
          await this.d.setSettings({ theme: next });
          return `Tema: ${next === 'dark' ? 'koyu' : 'açık'}`;
        },
      },
      'lights.power': {
        level: 'safe', label: 'Işıkları aç / kapat', args: ['toggle', 'on', 'off'],
        run: async (arg) => {
          const isOff = global()?.effect === 'off';
          const on = arg === 'on' ? true : arg === 'off' ? false : isOff;
          await rgb.power(on);
          return on ? `Işıklar açıldı: ${store.get('rgbState')?.global?.name || ''}` : 'Işıklar kapatıldı';
        },
      },
      'lights.next': {
        level: 'safe', label: 'Sonraki ışık görünümü',
        run: async () => {
          const list = presetsAll().filter((p) => p.effect !== 'off');
          const i = list.findIndex((p) => p.id === global()?.id);
          const next = list[(i + 1) % list.length];
          await rgb.apply(next);
          return `Işıklar: ${next.name}`;
        },
      },
      'lights.preset': {
        level: 'safe', label: 'Işık görünümü seç', argFrom: () => presetsAll().map((p) => p.id),
        run: async (arg) => {
          const p = presetsAll().find((x) => x.id === arg);
          if (!p) throw new Error('Bilinmeyen görünüm');
          await rgb.apply(p);
          return `Işıklar: ${p.name}`;
        },
      },
      'drivers.scan': {
        level: 'safe', label: 'Sürücü güncellemelerini tara',
        run: async () => {
          const list = await drivers.scanWindowsUpdate();
          this.lastDriverScan = list;
          this.emit('drivers', list);
          return list.length ? `${list.length} sürücü güncellemesi bulundu` : 'Windows Update sürücüleri güncel';
        },
      },
      'drivers.install': {
        level: 'confirm', label: 'Windows Update sürücülerini kur (BIOS/firmware hariç)',
        run: async () => {
          installer.enqueue([{ key: 'wu_drivers', name: 'Windows Update Sürücüleri', source: 'wudrivers', color: '#0078d4', ids: [] }]);
          return 'Sürücü kurulumu kuyruğa eklendi (BIOS/firmware hariç)';
        },
      },
      'apps.update_all': {
        level: 'confirm', label: 'Tüm program güncellemelerini kur',
        run: async () => {
          const inv = await inventory.get();
          if (!inv.upgrades.length) return 'Güncellenecek program yok';
          const n = installer.enqueue(inv.upgrades.map((u) => ({ key: 'upg_' + u.id, name: u.name, source: 'winget', wingetId: u.id })));
          return `${n} güncelleme kuyruğa eklendi`;
        },
      },
      'apps.profile': {
        level: 'confirm', label: 'Kurulum profilindeki eksikleri kur', argFrom: () => catalog.getCatalog().profiles.map((p) => p.id),
        run: async (arg) => {
          const cat = catalog.getCatalog();
          const p = cat.profiles.find((x) => x.id === arg);
          if (!p) throw new Error('Bilinmeyen profil');
          const missing = p.keys.map((k) => cat.apps.find((a) => a.key === k)).filter((a) => a && !a.status?.installed);
          if (!missing.length) return `${p.name}: hepsi zaten kurulu`;
          const n = installer.enqueue(missing.map(({ key, name, source, wingetId, npmPkg, color }) => ({ key, name, source, wingetId, npmPkg, color })));
          return `${p.name}: ${n} program kuyruğa eklendi`;
        },
      },
      'assistant.ask': {
        level: 'safe', label: 'Asistana sor (serbest metin)', freeText: true,
        run: async (arg) => {
          const q = String(arg || '').trim();
          if (!q) throw new Error('Soru boş');
          const r = await assistant.chat([{ role: 'user', content: q }], { emit: () => {} });
          return String(r.text || '(boş yanıt)').slice(0, 380);
        },
      },
    };
  }

  /** Arayüz için eylem listesi */
  catalog() {
    return Object.entries(this.ACTIONS).map(([id, a]) => ({ id, level: a.level, label: a.label, args: a.args || (a.argFrom ? a.argFrom() : null), freeText: !!a.freeText }));
  }

  /** İzin listesinden bir eylemi çalıştırır. Dönüş: { ok, message } */
  async run(action, arg = '', { source = 'esp32' } = {}) {
    const def = this.ACTIONS[action];
    const entry = { at: Date.now(), source, action, arg: def?.freeText ? String(arg).slice(0, 60) : arg, label: def?.label || action };
    const finish = (ok, message) => {
      Object.assign(entry, { ok, message });
      this.history.unshift(entry);
      this.history = this.history.slice(0, 50);
      this.d.log.info(`Otomasyon [${source}] ${action}${arg && !def?.freeText ? ' ' + arg : ''} → ${ok ? 'tamam' : 'red/hata'}: ${message}`);
      this.emit('history', this.history);
      return { ok, message };
    };
    if (!def) return finish(false, `İzin verilmeyen eylem: ${action}`);
    const allowed = def.args || (def.argFrom ? def.argFrom() : null);
    if (allowed && arg && !allowed.includes(arg)) return finish(false, `Geçersiz değer: ${arg}`);
    if (!def.freeText && String(arg).length > 64) return finish(false, 'Değer çok uzun');
    if (def.level === 'confirm') {
      this.d.showWindow();
      const ok = await this.d.confirm(`ESP32 şu işlemi istiyor: ${def.label}${arg ? ` (${arg})` : ''}`, `Kaynak: ${source === 'wifi' ? 'Wi-Fi paneli' : 'ESP32 tuşu'}. Onaylamazsan hiçbir şey yapılmaz.`);
      if (!ok) return finish(false, 'Bilgisayarda reddedildi');
    }
    try { return finish(true, await def.run(arg)); } catch (e) { return finish(false, e.message || String(e)); }
  }

  // ---------- ESP32 olayları ----------

  /** Karttan gelen EVENT mesajı */
  async onDeviceEvent(ev) {
    const hub = this.d.hub;
    if (ev.event === 'button') {
      const map = this.d.store.get('settings').esp32Buttons || {};
      const m = map[ev.press === 'long' ? 'long' : 'short'];
      if (!m?.action) return;
      const r = await this.run(m.action, m.arg || '', { source: 'button' });
      hub.command('notify', { text: r.message.slice(0, 100) }).catch(() => {});
      this.pushState();
    } else if (ev.event === 'action') {
      const r = await this.run(String(ev.action || ''), String(ev.arg || ''), { source: 'wifi' });
      if (Number.isInteger(ev.rid)) hub.command('result', { rid: ev.rid, ok: r.ok, msg: r.message }).catch(() => {});
      this.pushState();
    } else if (ev.event === 'wifi') {
      this.wifi = ev.wifi || null;
      this.emit('wifi', this.wifi);
    }
  }

  // ---------- İkiz durum ----------

  async snapshot() {
    const { rgb, store, installer, inventory, catalog } = this.d;
    const g = store.get('rgbState')?.global;
    const q = installer.list();
    const active = q.filter((x) => ['queued', 'running'].includes(x.status));
    const presets = rgb.status().presets.filter((p) => p.effect !== 'off').slice(0, 10).map(({ id, name }) => ({ id, name }));
    const mine = (store.get('rgbProfiles') || []).slice(0, 4).map(({ id, name }) => ({ id, name }));
    return {
      pc: os.hostname(), ver: this.d.version, theme: store.get('settings').theme,
      cpu: this.cpu(), ram: Math.round((1 - os.freemem() / os.totalmem()) * 100),
      lights: { on: !!g && g.effect !== 'off', name: g?.name || '' },
      queue: { running: installer.running, active: active.length, current: q.find((x) => x.status === 'running')?.name || '' },
      updates: inventory.summary()?.upgrades ?? null,
      presets: [...presets, ...mine],
      profiles: catalog.getCatalog().profiles.map(({ id, name }) => ({ id, name })),
    };
  }

  async pushState() {
    const hub = this.d.hub;
    if (!hub.device || this.busy) return;
    this.busy = true;
    try { hub.sendState(await this.snapshot()); } catch (e) { this.d.log.warn('İkiz durum gönderilemedi', e); } finally { this.busy = false; }
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.pushState(), 3000);
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  /** Kart bağlanınca: durum ışığı + ilk durum */
  async onConnected() {
    const s = this.d.store.get('settings');
    if (s.esp32LedAuto !== false && (this.d.hub.device?.caps || []).includes('led')) await this.d.hub.command('led', { state: 'auto' }).catch(() => {});
    const st = await this.d.hub.readStatus().catch(() => null);
    if (st?.wifi) { this.wifi = st.wifi; this.emit('wifi', this.wifi); }
    this.pushState();
  }

  /** Wi-Fi panelini kurar: yeni gizli anahtar üretir, Wi-Fi bilgisini KARTA gönderir (Orbit şifreyi saklamaz) */
  async setupWifi(ssid, pass) {
    const token = crypto.randomBytes(12).toString('hex');
    await this.d.hub.command('wifi', { ssid: String(ssid || ''), pass: String(pass || ''), token });
    this.d.store.patch('settings', { esp32Token: token });
    return { token };
  }
  async disableWifi() {
    await this.d.hub.command('wifi_off');
    this.d.store.patch('settings', { esp32Token: null });
    this.wifi = { configured: false, connected: false };
    this.emit('wifi', this.wifi);
  }
  panelUrl() {
    const t = this.d.store.get('settings').esp32Token;
    return this.wifi?.connected && this.wifi.ip && t ? `http://${this.wifi.ip}/?t=${t}` : null;
  }
}

module.exports = { Automation, cpuSampler };
