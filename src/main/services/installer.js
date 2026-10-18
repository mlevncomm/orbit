// Kurulum kuyruğu: winget / doğrudan indirme / npm / komut / Windows Update sürücüleri
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { runProcess, refreshPath } = require('./ps');
const drivers = require('./drivers');
const store = require('./store');

// winget çıkış kodları (işaretsiz 32-bit -> işaretli)
const ALREADY = new Set([-1978335189 /* 0x8A15002B güncelleme yok */, -1978335135 /* 0x8A150061 zaten kurulu */]);
const REBOOT = new Set([3010, 1641, -1978334967 /* 0x8A150109 */]);

class Installer extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.running = false;
    this.cancelled = false;
    this.child = null;
  }

  emitItem(item, patch) {
    Object.assign(item, patch);
    this.emit('progress', { key: item.key, name: item.name, status: item.status, percent: item.percent ?? 0, message: item.message || '' });
  }

  enqueue(items) {
    const keys = new Set(this.queue.filter((q) => ['queued', 'running'].includes(q.status)).map((q) => q.key));
    for (const it of items) {
      if (keys.has(it.key)) continue;
      const item = { ...it, status: 'queued', percent: 0, message: 'Sırada' };
      this.queue.push(item);
      this.emitItem(item, {});
    }
    if (!this.running) this.process();
    return this.queue.length;
  }

  cancel() {
    this.cancelled = true;
    this.queue.filter((q) => q.status === 'queued').forEach((q) => this.emitItem(q, { status: 'cancelled', message: 'İptal edildi' }));
    if (this.child) try { this.child.kill(); } catch {}
  }

  async process() {
    this.running = true;
    this.cancelled = false;
    this.emit('state', { running: true });
    let next;
    while (!this.cancelled && (next = this.queue.find((q) => q.status === 'queued'))) {
      this.emitItem(next, { status: 'running', message: 'Başlatılıyor…' });
      try {
        const res = await this.installOne(next);
        this.emitItem(next, { status: res.status, percent: 100, message: res.message });
      } catch (e) {
        this.emitItem(next, { status: 'error', message: e.message || String(e) });
      }
      const history = store.get('history') || [];
      store.set('history', [{ key: next.key, name: next.name, status: next.status, at: new Date().toISOString() }, ...history].slice(0, 300));
    }
    this.running = false;
    this.child = null;
    const done = this.queue.filter((q) => ['done', 'skipped'].includes(q.status)).length;
    const failed = this.queue.filter((q) => q.status === 'error').length;
    const reboot = this.queue.some((q) => q.reboot);
    this.emit('state', { running: false, done, failed, reboot });
    this.queue = this.queue.filter((q) => ['queued', 'running'].includes(q.status));
  }

  installOne(item) {
    switch (item.source) {
      case 'winget': return this.winget(item);
      case 'url': return this.download(item);
      case 'npm': return this.npm(item);
      case 'command': return this.command(item);
      case 'wudrivers': return this.wuDrivers(item);
      default: throw new Error('Bilinmeyen kaynak: ' + item.source);
    }
  }

  async winget(item) {
    const args = ['install', '--id', item.wingetId, '-e', '--source', 'winget', '--silent',
      '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'];
    let installing = false;
    const r = await runProcess('winget', args, {
      onSpawn: (c) => (this.child = c),
      onChunk: (line) => {
        const size = line.match(/([\d.,]+)\s*(KB|MB|GB)\s*\/\s*([\d.,]+)\s*(KB|MB|GB)/i);
        const pct = line.match(/(\d{1,3})\s*%/);
        if (size || pct) {
          const unit = { KB: 1, MB: 1024, GB: 1048576 };
          const percent = size
            ? Math.min(99, Math.round((parseFloat(size[1].replace(',', '.')) * unit[size[2].toUpperCase()]) / (parseFloat(size[3].replace(',', '.')) * unit[size[4].toUpperCase()]) * 80))
            : Math.min(80, Math.round(+pct[1] * 0.8));
          this.emitItem(item, { percent, message: size ? `İndiriliyor ${size[1]} ${size[2]} / ${size[3]} ${size[4]}` : 'İndiriliyor…' });
        } else if (!installing && /install|yükl|kurul/i.test(line) && !/http/i.test(line)) {
          installing = true;
          this.emitItem(item, { percent: Math.max(item.percent, 85), message: 'Kuruluyor…' });
        }
      },
    });
    if (r.code === 0) return { status: 'done', message: 'Kuruldu' };
    if (ALREADY.has(r.code)) return { status: 'skipped', message: 'Zaten kurulu ve güncel' };
    if (REBOOT.has(r.code)) { item.reboot = true; return { status: 'done', message: 'Kuruldu (yeniden başlatma gerekli)' }; }
    throw new Error(`winget hata kodu 0x${(r.code >>> 0).toString(16).toUpperCase()}`);
  }

  async download(item) {
    if (!/^https:\/\//i.test(item.url)) throw new Error('Yalnızca https bağlantıları desteklenir');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-dl-'));
    const name = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || 'setup.exe').replace(/[^\w.-]/g, '_');
    const file = path.join(dir, /\.(exe|msi)$/i.test(name) ? name : name + '.exe');
    const res = await fetch(item.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`İndirme başarısız: HTTP ${res.status}`);
    const total = +res.headers.get('content-length') || 0;
    let got = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', (c) => {
      got += c.length;
      if (total) this.emitItem(item, { percent: Math.round((got / total) * 80), message: `İndiriliyor ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB` });
    });
    await pipeline(body, fs.createWriteStream(file));
    this.emitItem(item, { percent: 85, message: 'Kuruluyor…' });
    const isMsi = /\.msi$/i.test(file);
    const extra = (item.args || (isMsi ? '' : '/S')).split(' ').filter(Boolean);
    const r = isMsi
      ? await runProcess('msiexec', ['/i', file, '/qn', '/norestart', ...extra], { onSpawn: (c) => (this.child = c) })
      : await runProcess(file, extra, { onSpawn: (c) => (this.child = c) });
    fs.rm(dir, { recursive: true, force: true }, () => {});
    if (r.code === 0) return { status: 'done', message: 'Kuruldu' };
    if (REBOOT.has(r.code)) { item.reboot = true; return { status: 'done', message: 'Kuruldu (yeniden başlatma gerekli)' }; }
    throw new Error(`Kurulum çıkış kodu ${r.code}`);
  }

  async npm(item) {
    await refreshPath(); // Node.js aynı oturumda kurulduysa npm'i bulabilmek için
    this.emitItem(item, { percent: 30, message: `npm install -g ${item.npmPkg}` });
    const r = await runProcess('npm', ['install', '-g', item.npmPkg], { shell: true, onSpawn: (c) => (this.child = c) });
    if (r.code !== 0) throw new Error('npm kurulumu başarısız (Node.js kurulu mu?)');
    return { status: 'done', message: 'Kuruldu' };
  }

  async command(item) {
    await refreshPath();
    this.emitItem(item, { percent: 30, message: 'Komut çalıştırılıyor…' });
    const r = await runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', item.command], { onSpawn: (c) => (this.child = c) });
    if (r.code !== 0) throw new Error(`Komut çıkış kodu ${r.code}`);
    return { status: 'done', message: 'Tamamlandı' };
  }

  async wuDrivers(item) {
    this.emitItem(item, { percent: 3, message: 'Windows Update taranıyor (birkaç dakika sürebilir)…' });
    const res = await drivers.installWindowsUpdate(item.ids || [], (p) =>
      this.emitItem(item, { percent: Math.max(5, p.percent), message: `${p.index}/${p.total} ${p.stage === 'download' ? 'indiriliyor' : 'kuruluyor'}: ${p.title}` }));
    if (res.reboot) item.reboot = true;
    if (!res.installed && !res.failed) return { status: 'skipped', message: 'Tüm sürücüler güncel' };
    return { status: 'done', message: `${res.installed} sürücü kuruldu${res.failed ? `, ${res.failed} başarısız` : ''}${res.reboot ? ' · yeniden başlatma gerekli' : ''}` };
  }
}

module.exports = new Installer();
