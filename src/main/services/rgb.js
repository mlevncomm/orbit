// RGB aydınlatma: OpenRGB SDK sunucusu üzerinden anakart, RAM, ekran kartı, klavye, fare, kasa fanı vb.
// OpenRGB 1 sunucu olarak (port 6742) arka planda çalışır; efektleri Orbit hesaplayıp LED'lere gönderir.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { Client } = require('openrgb-sdk');
const store = require('./store');

const PORT = 6742;
const FPS = 24;

const TYPES = ['Anakart', 'RAM', 'Ekran Kartı', 'Soğutucu', 'LED Şerit', 'Klavye', 'Fare', 'Mousepad', 'Kulaklık', 'Kulaklık Standı',
  'Gamepad', 'Işık', 'Hoparlör', 'Sanal', 'Depolama', 'Kasa', 'Mikrofon', 'Aksesuar', 'Tuş Takımı', 'Laptop', 'Monitör'];

const EFFECTS = {
  static: 'Sabit',
  breathing: 'Nefes',
  rainbow: 'Gökkuşağı dalgası',
  spectrum: 'Renk döngüsü',
  wave: 'İki renk dalga',
  pulse: 'Kalp atışı',
  off: 'Kapalı',
};

const PRESETS = [
  { id: 'p_aurora', name: 'Aurora', effect: 'wave', colors: ['#00e5c0', '#7b2ff7'], speed: 4, brightness: 100 },
  { id: 'p_sunset', name: 'Gün Batımı', effect: 'wave', colors: ['#ff7a18', '#ff2e63'], speed: 3, brightness: 100 },
  { id: 'p_rainbow', name: 'Gökkuşağı', effect: 'rainbow', colors: ['#ff0000', '#0000ff'], speed: 5, brightness: 100 },
  { id: 'p_ocean', name: 'Okyanus', effect: 'breathing', colors: ['#1e6bff', '#000000'], speed: 3, brightness: 100 },
  { id: 'p_gaming', name: 'Oyun Modu', effect: 'pulse', colors: ['#ff1e3c', '#000000'], speed: 6, brightness: 100 },
  { id: 'p_cyber', name: 'Cyberpunk', effect: 'wave', colors: ['#fcee0a', '#00f0ff'], speed: 5, brightness: 100 },
  { id: 'p_focus', name: 'Odak (sıcak beyaz)', effect: 'static', colors: ['#ffb46b', '#000000'], speed: 1, brightness: 45 },
  { id: 'p_white', name: 'Saf Beyaz', effect: 'static', colors: ['#ffffff', '#000000'], speed: 1, brightness: 100 },
  { id: 'p_spectrum', name: 'Renk Döngüsü', effect: 'spectrum', colors: ['#ff0000', '#000000'], speed: 3, brightness: 100 },
  { id: 'p_off', name: 'Tümünü Kapat', effect: 'off', colors: ['#000000', '#000000'], speed: 1, brightness: 0 },
];

const hexToRgb = (hex) => {
  const n = parseInt(String(hex || '#000000').replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return { red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255 };
};
const scale = (c, f) => ({ red: Math.round(c.red * f), green: Math.round(c.green * f), blue: Math.round(c.blue * f) });
const mix = (a, b, t) => ({ red: Math.round(a.red + (b.red - a.red) * t), green: Math.round(a.green + (b.green - a.green) * t), blue: Math.round(a.blue + (b.blue - a.blue) * t) });
function hsv(h) {
  const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); };
  return { red: f(5), green: f(3), blue: f(1) };
}

class RGB extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.devices = [];
    this.assign = new Map(); // deviceId -> { effect, colors, speed, brightness } | { native: modeName }
    this.timer = null;
    this.t0 = Date.now();
    this.proc = null;
  }

  findExe() {
    const roots = [
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WinGet', 'Packages'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'OpenRGB'),
    ];
    const walk = (dir, depth) => {
      if (depth < 0 || !fs.existsSync(dir)) return null;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isFile() && e.name.toLowerCase() === 'openrgb.exe') return p;
        if (e.isDirectory() && (depth < 3 || /openrgb/i.test(e.name))) {
          if (dir.endsWith('Packages') && !/openrgb/i.test(e.name)) continue;
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
    // openrgb-sdk 0.6 yeni protokol alanlarını çözemiyor; OpenRGB 1.x ile uyumlu sürüme sabitle
    const c = new Client('Orbit', PORT, '127.0.0.1', { forceProtocolVersion: +(process.env.ORBIT_RGB_PROTO || 4) });
    await c.connect(1500);
    c.on('disconnect', () => { this.client = null; this.stopLoop(); this.emit('status'); });
    return c;
  }

  /** OpenRGB sunucusuna bağlanır; çalışmıyorsa arka planda başlatır. */
  async connect() {
    if (this.client) return this.status();
    try {
      this.client = await this.tryConnect();
    } catch {
      const exe = this.findExe();
      if (!exe) return { installed: false, connected: false };
      this.proc = spawn(exe, ['--server', '--server-port', String(PORT), '--startminimized'], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsHide: true });
      this.proc.unref();
      for (let i = 0; i < 30 && !this.client; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try { this.client = await this.tryConnect(); } catch {}
      }
      if (!this.client) throw new Error('OpenRGB başlatıldı ama bağlanılamadı. OpenRGB > SDK Server sekmesinden sunucuyu başlatın.');
    }
    await this.refresh();
    return this.status();
  }

  async refresh() {
    if (!this.client) return [];
    const list = await this.client.getAllControllerData();
    this.devices = list.map((d) => ({
      id: d.deviceId,
      name: d.name,
      vendor: d.vendor || '',
      type: TYPES[d.type] || 'Cihaz',
      typeId: d.type,
      leds: d.colors.length,
      zones: d.zones.map((z) => z.name),
      modes: d.modes.map((m) => m.name),
      activeMode: d.modes[d.activeMode]?.name,
      hasDirect: d.modes.some((m) => /direct|custom/i.test(m.name)),
    }));
    return this.devices;
  }

  status() {
    return {
      installed: !!this.client || !!this.findExe(),
      connected: !!this.client,
      devices: this.devices,
      effects: EFFECTS,
      presets: PRESETS,
      profiles: store.get('rgbProfiles') || [],
      active: store.get('rgbActive') || null,
    };
  }

  /** Bir profili (efekt) tüm cihazlara ya da tek cihaza uygular. */
  async apply(profile, deviceId = null) {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('OpenRGB bağlı değil');
    const targets = deviceId == null ? this.devices : this.devices.filter((d) => d.id === deviceId);
    for (const d of targets) {
      if (profile.native) {
        await this.client.updateMode(d.id, profile.native);
        this.assign.delete(d.id);
        continue;
      }
      if (d.hasDirect) await this.client.updateMode(d.id, d.modes.find((m) => /direct/i.test(m)) || d.modes.find((m) => /custom/i.test(m)));
      else this.client.setCustomMode(d.id);
      this.assign.set(d.id, { effect: profile.effect, colors: profile.colors.map(hexToRgb), speed: profile.speed || 3, brightness: (profile.brightness ?? 100) / 100 });
    }
    if (deviceId == null) store.set('rgbActive', { ...profile, deviceId: null });
    this.frame(true);
    this.startLoop();
    return true;
  }

  frame(force = false) {
    if (!this.client) return;
    const t = (Date.now() - this.t0) / 1000;
    for (const d of this.devices) {
      const a = this.assign.get(d.id);
      if (!a || !d.leds) continue;
      const animated = !['static', 'off'].includes(a.effect);
      if (!animated && !force) continue;
      const [c1, c2] = a.colors;
      const sp = a.speed;
      const out = new Array(d.leds);
      for (let i = 0; i < d.leds; i++) {
        let c;
        switch (a.effect) {
          case 'static': c = c1; break;
          case 'off': c = { red: 0, green: 0, blue: 0 }; break;
          case 'breathing': c = scale(c1, 0.08 + 0.92 * (Math.sin(t * sp * 0.6) + 1) / 2); break;
          case 'pulse': { const p = (t * sp * 0.35) % 1; c = scale(c1, Math.max(Math.exp(-p * 18), 0.7 * Math.exp(-Math.abs(p - 0.22) * 22), 0.05)); break; }
          case 'spectrum': c = hsv((t * sp * 20) % 360); break;
          case 'rainbow': c = hsv((t * sp * 40 + (i * 360) / Math.max(d.leds, 8)) % 360); break;
          case 'wave': c = mix(c1, c2, (Math.sin(t * sp * 0.8 - (i / Math.max(d.leds, 6)) * Math.PI * 2) + 1) / 2); break;
          default: c = c1;
        }
        out[i] = scale(c, a.brightness);
      }
      try { this.client.updateLeds(d.id, out); } catch {}
    }
  }

  startLoop() {
    const animated = [...this.assign.values()].some((a) => !['static', 'off'].includes(a.effect));
    if (animated && !this.timer) this.timer = setInterval(() => this.frame(), 1000 / FPS);
    if (!animated) this.stopLoop();
  }
  stopLoop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  saveProfile(p) {
    const list = (store.get('rgbProfiles') || []).filter((x) => x.id !== p.id);
    const item = { id: p.id || 'u_' + Date.now().toString(36), name: String(p.name || 'Profilim').slice(0, 40), effect: p.effect, colors: p.colors, speed: +p.speed || 3, brightness: +p.brightness || 100 };
    store.set('rgbProfiles', [...list, item]);
    return item;
  }
  deleteProfile(id) { store.set('rgbProfiles', (store.get('rgbProfiles') || []).filter((x) => x.id !== id)); }

  /** Açılışta son kullanılan görünümü geri yükler. */
  async restore() {
    const a = store.get('rgbActive');
    if (!a) return;
    try { await this.connect(); if (this.client) await this.apply(a); } catch {}
  }
}

module.exports = new RGB();
