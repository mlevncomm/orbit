// Orbit Köprüsü: Claude (MCP eklentisi) ve diğer yerel araçlar için YEREL API.
//
// Güvenlik:
//  - Yalnızca 127.0.0.1'de dinler; Host başlığı doğrulanır (DNS rebinding'e karşı).
//  - Tarayıcıdan gelen istekler (Origin başlığı) reddedilir: web siteleri köprüye erişemez.
//  - Her istek "Authorization: Bearer <anahtar>" ister; anahtar userData/bridge.json'da durur.
//  - Eylemler otomasyon izin listesinden geçer; kurulum gibi işlemler yine ekranda onay ister.
//  - Varsayılan olarak KAPALI; Ayarlar'dan açılır.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PORT = 48765;

class Bridge {
  /**
   * deps: { userData, version, log, automation, inventory, drivers, rgb, hub, installer, store, catalog,
   *         navigate(page) → Promise, screenshot() → Promise<Buffer>, uiState() → Promise<object>, logDir }
   */
  constructor(deps) {
    this.d = deps;
    this.server = null;
    this.port = null;
    this.token = null;
    this.file = path.join(deps.userData, 'bridge.json');
  }

  info() { return { enabled: !!this.server, port: this.port, file: this.file }; }

  async start(port = DEFAULT_PORT) {
    if (this.server) return this.info();
    this.token = crypto.randomBytes(24).toString('hex');
    this.server = http.createServer((req, res) => this.handle(req, res).catch((e) => this.json(res, 500, { error: e.message })));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', resolve);
    });
    this.port = this.server.address().port;
    fs.writeFileSync(this.file, JSON.stringify({ url: `http://127.0.0.1:${this.port}`, token: this.token, pid: process.pid, version: this.d.version }, null, 2));
    this.d.log.info(`Orbit Köprüsü açıldı: 127.0.0.1:${this.port}`);
    return this.info();
  }

  async stop() {
    if (!this.server) return this.info();
    await new Promise((r) => this.server.close(r));
    this.server = null; this.port = null; this.token = null;
    try { fs.unlinkSync(this.file); } catch {}
    this.d.log.info('Orbit Köprüsü kapatıldı');
    return this.info();
  }

  json(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  authorized(req) {
    if (req.headers.origin) return 'origin';                                   // tarayıcı isteği
    const host = String(req.headers.host || '');
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return 'host';
    const auth = String(req.headers.authorization || '');
    const given = Buffer.from(auth.replace(/^Bearer\s+/i, ''));
    const want = Buffer.from(this.token || '');
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return 'token';
    return null;
  }

  async body(req) {
    let data = '';
    for await (const chunk of req) { data += chunk; if (data.length > 64 * 1024) throw new Error('İstek çok büyük'); }
    return data ? JSON.parse(data) : {};
  }

  async handle(req, res) {
    const why = this.authorized(req);
    if (why) return this.json(res, why === 'token' ? 401 : 403, { error: { origin: 'Tarayıcı istekleri kabul edilmez', host: 'Geçersiz Host', token: 'Yetkisiz' }[why] });
    const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
    const d = this.d;
    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case 'GET /status': {
        const inv = d.inventory.summary();
        return this.json(res, 200, {
          version: d.version, ui: await d.uiState().catch(() => null),
          inventory: inv, queue: { running: d.installer.running, items: d.installer.list() },
          rgb: { connected: d.rgb.status().connected, active: d.store.get('rgbState')?.global || null },
          esp32: { state: d.hub.status().state, port: d.hub.port, firmware: d.hub.device ? `${d.hub.device.fw} ${d.hub.device.ver}` : null },
          twin: await d.automation.snapshot().catch(() => null),
        });
      }
      case 'GET /programs': {
        const cat = d.catalog.getCatalog();
        return this.json(res, 200, { catalog: cat.apps.map((a) => ({ key: a.key, name: a.name, category: a.category, installed: !!a.status?.installed, version: a.status?.version || null, available: a.status?.available || null })), profiles: cat.profiles });
      }
      case 'GET /inventory': {
        const inv = await d.inventory.get(url.searchParams.get('refresh') === '1');
        return this.json(res, 200, { programs: inv.programs, upgrades: inv.upgrades, scannedAt: inv.scannedAt });
      }
      case 'GET /drivers': return this.json(res, 200, { installed: await d.drivers.installedDrivers(url.searchParams.get('refresh') === '1') });
      case 'GET /rgb': return this.json(res, 200, d.rgb.status());
      case 'GET /esp32': return this.json(res, 200, { ...d.hub.status(), wifi: d.automation.wifi || null, history: d.automation.history.slice(0, 20) });
      case 'GET /actions': return this.json(res, 200, d.automation.catalog());
      case 'POST /actions': {
        const b = await this.body(req);
        const r = await d.automation.run(String(b.action || ''), String(b.arg || ''), { source: 'claude' });
        return this.json(res, r.ok ? 200 : 409, r);
      }
      case 'POST /ui/navigate': {
        const b = await this.body(req);
        await d.navigate(String(b.page || ''));
        return this.json(res, 200, await d.uiState());
      }
      case 'GET /ui/state': return this.json(res, 200, await d.uiState());
      case 'GET /ui/screenshot': {
        const png = await d.screenshot();
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        return res.end(png);
      }
      case 'GET /logs': {
        const n = Math.min(500, Math.max(1, +url.searchParams.get('n') || 100));
        let text = '';
        try { text = fs.readFileSync(path.join(d.logDir(), 'orbit.log'), 'utf8'); } catch {}
        return this.json(res, 200, { lines: text.trim().split(/\r?\n/).slice(-n) });
      }
      default: return this.json(res, 404, { error: 'Bilinmeyen uç', routes: ['GET /status', 'GET /programs', 'GET /inventory', 'GET /drivers', 'GET /rgb', 'GET /esp32', 'GET /actions', 'POST /actions', 'POST /ui/navigate', 'GET /ui/state', 'GET /ui/screenshot', 'GET /logs'] });
    }
  }
}

module.exports = { Bridge, DEFAULT_PORT };
